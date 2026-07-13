import { db } from "@workspace/db";
import {
  notasFiscaisTable,
  historicoStatusTable,
  metaAtualizacaoTable,
  type NotaFiscal,
  type InsertNotaFiscal,
} from "@workspace/db/schema";
import { eq, ne, inArray, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import type { NotaPortal } from "../portal-automation/portal-types.js";
import { isRondonopolis, normalizarSituacao } from "../portal-automation/portal-types.js";
import type { NotaApollo } from "./reconciliacao.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types re-exported for routes
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoAtualizacao {
  totalInseridas: number;
  totalAtualizadas: number;
  totalCanceladas: number;
}

export interface DashboardResult {
  resumo: {
    totalNotas: number;
    totalValidadas: number;
    totalFaltantes: number;
    totalDivergencias: number;
    totalCanceladas: number;
    totalOutrosMunicipios: number;
    valorTotalValidadas: number;
    valorTotalFaltantes: number;
    valorTotalCanceladas: number;
    valorTotalOutrosMunicipios: number;
  };
  faltantes: NotaFiscal[];
  divergencias: NotaFiscal[];
  validadas: NotaFiscal[];
  canceladas: NotaFiscal[];
  outrosMunicipios: NotaFiscal[];
  ultimaAtualizacao: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function normalizarNota(nota: string | number): string {
  return String(nota ?? "").trim().replace(/^0+/, "") || "0";
}

async function registrarHistorico(
  notaId: number,
  statusAnterior: string | null,
  statusNovo: string,
  motivo: string,
): Promise<void> {
  if (statusAnterior === statusNovo) return;
  await db.insert(historicoStatusTable).values({
    notaId,
    statusAnterior: statusAnterior ?? undefined,
    statusNovo,
    motivo,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Upsert notas do portal (regras 1, 2, 5)
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertNotasPortal(
  notas: NotaPortal[],
  competencia: string,
): Promise<ResultadoAtualizacao> {
  let totalInseridas = 0;
  let totalAtualizadas = 0;
  let totalCanceladas = 0;

  for (const nota of notas) {
    const situacaoNormalizada = normalizarSituacao(nota.Situacao);

    if (situacaoNormalizada === null) {
      logger.warn({ situacao: nota.Situacao, idPortal: nota.Id }, "Situacao desconhecida, ignorando nota");
      continue;
    }

    // Regra 5: Outro município → status OutroMunicipio
    const outroMunicipio = !isRondonopolis(nota.MunicipioIncidencia);

    // Regra 2: Cancelamento tem prioridade
    let statusConciliacao: string;
    if (situacaoNormalizada === "Cancelado") {
      statusConciliacao = "Cancelada";
    } else if (outroMunicipio) {
      statusConciliacao = "OutroMunicipio";
    } else {
      // Regra 1: Nota nova emitida entra como Faltante
      statusConciliacao = "Faltante";
    }

    const values: InsertNotaFiscal = {
      idPortal: nota.Id,
      chaveAcesso: nota.ChaveAcesso,
      numeroNota: nota.NumeroNota,
      tipoNota: nota.TipoNota,
      dataEmissao: new Date(nota.DataEmissao),
      cnpjPrestadorTomador: nota.CNJPrestadorTomador,
      cpfCnpjFormatado: nota.CPFCNPJPrestadorTomador,
      nomePrestador: nota.NomePrestador,
      situacaoPortal: situacaoNormalizada,
      municipioIncidencia: nota.MunicipioIncidencia,
      valorServico: String(nota.ValorServico),
      valorBaseCalculo: String(nota.ValorBaseCalculo),
      retido: nota.Retido,
      valorImposto: String(nota.ValorDoImposto),
      statusConciliacao,
    };

    // Check if already exists
    const [existing] = await db
      .select()
      .from(notasFiscaisTable)
      .where(eq(notasFiscaisTable.chaveAcesso, nota.ChaveAcesso))
      .limit(1);

    if (!existing) {
      // Insert new
      const [inserted] = await db.insert(notasFiscaisTable).values(values).returning();
      if (inserted) {
        await registrarHistorico(inserted.id, null, statusConciliacao, "Inserção via busca no portal");
        totalInseridas++;
        if (statusConciliacao === "Cancelada") totalCanceladas++;
      }
    } else {
      // Update existing — but ALWAYS respect cancelamento priority (regra 2)
      let newStatus = statusConciliacao;

      if (situacaoNormalizada === "Cancelado") {
        // Cancelamento sempre vence
        newStatus = "Cancelada";
      } else if (existing.statusConciliacao === "Cancelada") {
        // Already cancelled in DB — do not downgrade just because portal shows Emitido
        // (edge case: should not happen, but safety check)
        newStatus = "Cancelada";
      } else if (outroMunicipio) {
        newStatus = "OutroMunicipio";
      } else {
        // Keep existing reconciliation status (Validada, Divergente, Faltante)
        newStatus = existing.statusConciliacao ?? "Faltante";
      }

      await db
        .update(notasFiscaisTable)
        .set({
          ...values,
          statusConciliacao: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(notasFiscaisTable.id, existing.id));

      await registrarHistorico(existing.id, existing.statusConciliacao, newStatus, "Atualização via busca no portal");
      totalAtualizadas++;
      if (newStatus === "Cancelada" && existing.statusConciliacao !== "Cancelada") totalCanceladas++;
    }
  }

  // Record the operation metadata
  await db.insert(metaAtualizacaoTable).values({
    tipo: "busca_portal",
    competencia,
    totalNotas: notas.length,
  });

  return { totalInseridas, totalAtualizadas, totalCanceladas };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Reconciliação contra Apollo (regras 3, 4)
// ─────────────────────────────────────────────────────────────────────────────

export async function reconciliarContraApollo(notasApollo: NotaApollo[]): Promise<DashboardResult> {
  // Build Apollo lookup map
  const apolloMap = new Map<string, NotaApollo>();
  for (const nota of notasApollo) {
    apolloMap.set(normalizarNota(nota.nroNota), nota);
  }

  // Busca todas as notas não-canceladas e não-OutroMunicipio do banco
  const notasAtivas = await db
    .select()
    .from(notasFiscaisTable)
    .where(
      sql`${notasFiscaisTable.statusConciliacao} NOT IN ('Cancelada', 'OutroMunicipio')`,
    );

  // Regra 3: Reavalia TODAS as notas ativas — pode promover OU rebaixar
  for (const nota of notasAtivas) {
    const key = normalizarNota(nota.numeroNota);
    const apolloNota = apolloMap.get(key);

    let newStatus: string;
    let valorApolloBase: string | null = null;
    let valorApolloIss: string | null = null;

    if (!apolloNota) {
      // Regra 3: não encontrado no Apollo → Faltante (mesmo que estava Validada)
      newStatus = "Faltante";
    } else {
      valorApolloBase = String(apolloNota.totNota);
      valorApolloIss = String(apolloNota.issRetido);
      const notaBase = parseFloat(nota.valorBaseCalculo ?? "0");
      const notaIss = parseFloat(nota.valorImposto ?? "0");
      const difBase = Math.abs(notaBase - apolloNota.totNota);
      const difIss = Math.abs(notaIss - apolloNota.issRetido);

      if (difBase > 0.05 || difIss > 0.05) {
        newStatus = "Divergente";
      } else {
        newStatus = "Validada";
      }
    }

    await db
      .update(notasFiscaisTable)
      .set({
        statusConciliacao: newStatus,
        valorApolloBase,
        valorApolloIss,
        updatedAt: new Date(),
      })
      .where(eq(notasFiscaisTable.id, nota.id));

    await registrarHistorico(nota.id, nota.statusConciliacao, newStatus, "Reconciliação Apollo");
  }

  // Record reconciliation metadata
  await db.insert(metaAtualizacaoTable).values({
    tipo: "reconciliacao_apollo",
    totalNotas: notasAtivas.length,
  });

  return carregarDashboard();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Carrega dashboard completo do banco
// ─────────────────────────────────────────────────────────────────────────────

export async function carregarDashboard(): Promise<DashboardResult> {
  const todasNotas = await db.select().from(notasFiscaisTable);

  const validadas = todasNotas.filter((n) => n.statusConciliacao === "Validada");
  const faltantes = todasNotas.filter((n) => n.statusConciliacao === "Faltante");
  const divergencias = todasNotas.filter((n) => n.statusConciliacao === "Divergente");
  const canceladas = todasNotas.filter((n) => n.statusConciliacao === "Cancelada");
  const outrosMunicipios = todasNotas.filter((n) => n.statusConciliacao === "OutroMunicipio");

  const somarValor = (notas: NotaFiscal[]) =>
    notas.reduce((sum, n) => sum + parseFloat(n.valorBaseCalculo ?? "0"), 0);

  // Última atualização
  const [ultimaMeta] = await db
    .select()
    .from(metaAtualizacaoTable)
    .orderBy(sql`${metaAtualizacaoTable.createdAt} DESC`)
    .limit(1);

  return {
    resumo: {
      totalNotas: todasNotas.length,
      totalValidadas: validadas.length,
      totalFaltantes: faltantes.length,
      totalDivergencias: divergencias.length,
      totalCanceladas: canceladas.length,
      totalOutrosMunicipios: outrosMunicipios.length,
      valorTotalValidadas: somarValor(validadas),
      valorTotalFaltantes: somarValor(faltantes),
      valorTotalCanceladas: somarValor(canceladas),
      valorTotalOutrosMunicipios: outrosMunicipios.reduce(
        (sum, n) => sum + parseFloat(n.valorServico ?? "0"),
        0,
      ),
    },
    faltantes,
    divergencias,
    validadas,
    canceladas,
    outrosMunicipios,
    ultimaAtualizacao: ultimaMeta?.createdAt?.toISOString() ?? null,
  };
}
