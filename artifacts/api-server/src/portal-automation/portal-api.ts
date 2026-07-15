import { portalSession } from "./portal-session.js";
import { logger } from "../lib/logger.js";
import type { NotaPortal, Competencia } from "./portal-types.js";

const PORTAL_BASE = "https://nfse.rondonopolis.mt.gov.br";
const GRID_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/EmissaoLivroFiscal/GetDocumentosFiscaisGrid`;

// Endpoints do relatório em PDF (Stimulsoft) — mantidos como estavam, ainda
// NÃO validados contra o portal real. Tratar com desconfiança até testar.
const PDF_SNAPSHOT_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/NotasFiscaisEletronicas/AglReportGetReportSnapshotHtml`;
const PDF_INIT_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/NotasFiscaisEletronicas/AglReportInitVars`;
const PDF_EXPORT_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/NotasFiscaisEletronicas/AglReportExportReportViewHtml`;

/**
 * Busca todas as NFS-e do portal pra uma competência ("mesAtual" ou
 * "mesAnterior"), paginando automaticamente.
 *
 * Filtro de período: NÃO usa DataInicial/DataFinal (vieram sempre vazios em
 * toda captura de HAR analisada). O filtro real é feito selecionando o
 * IdCompetenciaEconomico certo, resolvido por portalSession.getIdCompetencia().
 *
 * Paginação: o campo "Total" que o portal retorna veio -1 em toda captura
 * (não confiável). O critério de parada é: página trouxe menos itens que o
 * "limit" pedido = chegou na última página.
 */
export async function buscarNotasPortal(competencia: Competencia): Promise<NotaPortal[]> {
  await portalSession.ensureSession();
  const idEconomico = portalSession.getIdEconomico();
  const idCompetenciaEconomico = await portalSession.getIdCompetencia(competencia);

  logger.info({ competencia, idEconomico, idCompetenciaEconomico }, "Buscando notas no portal");

  const limit = 100;
  const allNotas: NotaPortal[] = [];
  let page = 1;

  while (true) {
    const values = {
      Tipo: -2,
      IdPessoaContribuinte: "",
      IdEconomico: idEconomico,
      MostrarNomeTomador: -1,
      TipoDocumentoLivro: -3,
      TipoImpressaoAtividadeEconomica: -3,
      DataInicial: "",
      DataFinal: "",
      IdCompetenciaEconomico: idCompetenciaEconomico,
    };

    const body = new URLSearchParams({
      values: JSON.stringify(values),
      page: String(page),
      start: String((page - 1) * limit),
      limit: String(limit),
    });

    let res: Response;
    try {
      res = await portalSession.fetch(GRID_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${PORTAL_BASE}/NFSe/DocumentosFiscais/EmissaoLivroFiscal`,
        },
        body: body.toString(),
      });
    } catch (err) {
      throw new Error(`Falha ao comunicar com o portal: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!res.ok) {
      throw new Error(`Portal retornou status inesperado: ${res.status}`);
    }

    let json: { Dados?: NotaPortal[]; Total?: number } | null = null;
    try {
      json = await res.json();
    } catch {
      throw new Error("Portal retornou resposta não-JSON. Possível sessão inválida ou mudança de layout.");
    }

    const notas: NotaPortal[] = json?.Dados ?? [];
    if (notas.length === 0) break;

    allNotas.push(...notas);
    logger.info({ page, fetched: notas.length, accumulated: allNotas.length }, "Página de notas recebida");

    if (notas.length < limit) break;
    page++;
  }

  logger.info({ total: allNotas.length }, "Busca de notas no portal concluída");
  return allNotas;
}

/** Ainda não validado contra o portal real — ver "on the horizon" no contexto do projeto. */
export async function obterPdfNota(idPortal: number, chaveAcesso: string): Promise<Buffer | null> {
  logger.info({ idPortal }, "Solicitando PDF da nota fiscal");

  try {
    const snapshotRes = await portalSession.fetch(PDF_SNAPSHOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        reportName: "NFSe",
        reportParams: JSON.stringify({ Id: idPortal, ChaveAcesso: chaveAcesso }),
      }).toString(),
    });

    if (!snapshotRes.ok) {
      logger.warn({ status: snapshotRes.status, idPortal }, "Snapshot do relatório falhou");
      return null;
    }

    await portalSession.fetch(PDF_INIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ reportName: "NFSe" }).toString(),
    });

    const exportParams = Buffer.from(
      JSON.stringify({ exportFormat: "Pdf", reportName: "NFSe" }),
    ).toString("base64");

    const exportRes = await portalSession.fetch(PDF_EXPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        stiweb_parameters: exportParams,
        reportName: "NFSe",
      }).toString(),
    });

    if (!exportRes.ok) {
      logger.warn({ status: exportRes.status, idPortal }, "Export PDF falhou");
      return null;
    }

    const contentType = exportRes.headers.get("content-type") ?? "";
    if (!contentType.includes("pdf")) {
      logger.warn({ contentType, idPortal }, "Resposta do export não é PDF");
      return null;
    }

    return Buffer.from(await exportRes.arrayBuffer());
  } catch (err) {
    logger.error({ err, idPortal }, "Erro ao obter PDF da nota");
    return null;
  }
}

export function urlConsultaPublica(chaveAcesso: string): string {
  return `https://www.nfse.gov.br/consultapublica/?chave=${chaveAcesso}&tpc=1`;
}