import { Router } from "express";
import { carregarDashboard } from "../lib/notas-service.js";
import type { NotaFiscal } from "@workspace/db/schema";

const router = Router();

/** Map DB rows to the API shape expected by the frontend */
function mapNota(n: NotaFiscal) {
  return {
    id: n.id,
    numeroNota: String(n.numeroNota),
    dataEmissao: n.dataEmissao ? n.dataEmissao.toISOString().split("T")[0]!.split("-").reverse().join("/") : "",
    cnpj: n.cpfCnpjFormatado,
    razaoSocial: n.nomePrestador,
    status: n.situacaoPortal,
    issRetido: n.retido === "Sim" ? "Sim" : "Não",
    valorBase: parseFloat(n.valorBaseCalculo ?? "0"),
    valorISS: parseFloat(n.valorImposto ?? "0"),
  };
}

function mapDivergente(n: NotaFiscal) {
  const valorBaseLF = parseFloat(n.valorBaseCalculo ?? "0");
  const valorBaseApollo = parseFloat(n.valorApolloBase ?? "0");
  const valorISSLF = parseFloat(n.valorImposto ?? "0");
  const valorISSApollo = parseFloat(n.valorApolloIss ?? "0");
  return {
    id: n.id,
    numeroNota: String(n.numeroNota),
    cnpj: n.cpfCnpjFormatado,
    razaoSocial: n.nomePrestador,
    valorBaseLF,
    valorBaseApollo,
    difBase: Math.round(Math.abs(valorBaseLF - valorBaseApollo) * 100) / 100,
    valorISSLF,
    valorISSApollo,
    difISS: Math.round(Math.abs(valorISSLF - valorISSApollo) * 100) / 100,
  };
}

function mapOutroMunicipio(n: NotaFiscal) {
  return {
    id: n.id,
    numeroNota: String(n.numeroNota),
    dataEmissao: n.dataEmissao ? n.dataEmissao.toISOString().split("T")[0]!.split("-").reverse().join("/") : "",
    cnpj: n.cpfCnpjFormatado,
    razaoSocial: n.nomePrestador,
    municipio: n.municipioIncidencia,
    valorServico: parseFloat(n.valorServico ?? "0"),
    chaveAcesso: n.chaveAcesso,
  };
}

router.get("/dashboard", async (req, res) => {
  try {
    const dashboard = await carregarDashboard();
    res.json({
      resumo: dashboard.resumo,
      validadas: dashboard.validadas.map(mapNota),
      faltantes: dashboard.faltantes.map(mapNota),
      divergencias: dashboard.divergencias.map(mapDivergente),
      canceladas: dashboard.canceladas.map(mapNota),
      outrosMunicipios: dashboard.outrosMunicipios.map(mapOutroMunicipio),
      ultimaAtualizacao: dashboard.ultimaAtualizacao,
    });
  } catch (err) {
    req.log.error({ err }, "Erro ao carregar dashboard");
    res.status(500).json({ erro: err instanceof Error ? err.message : "Erro ao carregar dashboard" });
  }
});

export default router;
