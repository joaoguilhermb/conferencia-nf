import { Router } from "express";
import { buscarNotasPortal, obterHtmlNota, urlConsultaPublica } from "../portal-automation/portal-api.js";
import { upsertNotasPortal } from "../lib/notas-service.js";
import { db } from "@workspace/db";
import { notasFiscaisTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { Competencia } from "../portal-automation/portal-types.js";

const router = Router();

function isCompetencia(v: unknown): v is Competencia {
  return v === "mesAtual" || v === "mesAnterior";
}

router.post("/notas/atualizar", async (req, res) => {
  const { competencia } = req.body as { competencia: unknown };
  if (!isCompetencia(competencia)) {
    res.status(400).json({ erro: "competencia deve ser 'mesAtual' ou 'mesAnterior'" });
    return;
  }

  try {
    req.log.info({ competencia }, "Iniciando busca de notas no portal");
    const notas = await buscarNotasPortal(competencia);
    const resultado = await upsertNotasPortal(notas, competencia);
    req.log.info(resultado, "Atualização de notas concluída");
    res.json(resultado);
  } catch (err) {
    req.log.error({ err }, "Erro ao atualizar notas do portal");
    res.status(400).json({
      erro: err instanceof Error ? err.message : "Falha ao buscar notas do portal.",
    });
  }
});

router.post("/notas/:id/pdf", async (req, res) => {
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ erro: "ID inválido." });
    return;
  }

  const [nota] = await db
    .select()
    .from(notasFiscaisTable)
    .where(eq(notasFiscaisTable.id, id))
    .limit(1);

  if (!nota) {
    res.status(404).json({ erro: "Nota não encontrada." });
    return;
  }

  // Nota de outro município: retorna link público
  if (nota.statusConciliacao === "OutroMunicipio") {
    const url = urlConsultaPublica(nota.chaveAcesso);
    res.json({ url, tipo: "linkExterno" });
    return;
  }

  // Nota de Rondonópolis: monta o HTML de visualização via portal.
  // Não é um PDF de verdade — é o mesmo HTML que o Viewer do portal usa pra
  // exibir a nota. O frontend abre isso numa aba nova e o usuário usa o
  // Ctrl+P do navegador pra salvar como PDF, se quiser.
  try {
    const html = await obterHtmlNota(nota.idPortal);
    if (html) {
      res.json({ html, tipo: "html" });
    } else {
      // Fallback: retorna o link público se não conseguiu montar o HTML
      const url = `https://nfse.rondonopolis.mt.gov.br/NFSe/DocumentosFiscais/NotasFiscaisEletronicas?chave=${nota.chaveAcesso}`;
      res.json({ url, tipo: "linkExterno" });
    }
  } catch (err) {
    req.log.error({ err, id }, "Erro ao obter visualização da nota");
    res.status(400).json({
      erro: err instanceof Error ? err.message : "Erro ao obter visualização da nota.",
    });
  }
});

export default router;