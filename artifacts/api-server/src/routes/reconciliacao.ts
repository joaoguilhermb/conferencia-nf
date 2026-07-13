import { Router } from "express";
import multer from "multer";
import { parseApollo } from "../lib/parseArquivo.js";
import { reconciliarContraApollo } from "../lib/notas-service.js";
import type { NotaFiscal } from "@workspace/db/schema";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function mapNota(n: NotaFiscal) {
  return {
    id: n.id,
    numeroNota: String(n.numeroNota),
    dataEmissao: n.dataEmissao
      ? n.dataEmissao.toISOString().split("T")[0]!.split("-").reverse().join("/")
      : "",
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
    dataEmissao: n.dataEmissao
      ? n.dataEmissao.toISOString().split("T")[0]!.split("-").reverse().join("/")
      : "",
    cnpj: n.cpfCnpjFormatado,
    razaoSocial: n.nomePrestador,
    municipio: n.municipioIncidencia,
    valorServico: parseFloat(n.valorServico ?? "0"),
    chaveAcesso: n.chaveAcesso,
  };
}

router.post(
  "/reconciliacao/processar",
  upload.single("apollo"),
  async (req, res) => {
    try {
      const apolloFile = req.file;
      if (!apolloFile) {
        res.status(400).json({ erro: "Arquivo do Relatório Apollo não enviado." });
        return;
      }

      req.log.info({ apollo: apolloFile.originalname }, "Iniciando reconciliação com arquivo Apollo");

      const notasApollo = await parseApollo(
        apolloFile.buffer,
        apolloFile.mimetype,
        apolloFile.originalname,
      );

      req.log.info({ totalApollo: notasApollo.length }, "Apollo carregado, reconciliando contra banco");

      const dashboard = await reconciliarContraApollo(notasApollo);

      req.log.info(dashboard.resumo, "Reconciliação concluída");

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
      req.log.error({ err }, "Erro durante reconciliação");
      res.status(400).json({
        erro: err instanceof Error ? err.message : "Erro ao processar os arquivos.",
      });
    }
  },
);

export default router;
