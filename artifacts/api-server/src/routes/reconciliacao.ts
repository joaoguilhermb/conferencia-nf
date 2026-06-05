import { Router } from "express";
import multer from "multer";
import { parseLivroFiscal, parseApollo } from "../lib/parseArquivo.js";
import { reconciliar } from "../lib/reconciliacao.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post(
  "/reconciliacao/processar",
  upload.fields([
    { name: "livroFiscal", maxCount: 1 },
    { name: "apollo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;

      if (!files?.["livroFiscal"]?.[0]) {
        res.status(400).json({ erro: "Arquivo do Livro Fiscal não enviado." });
        return;
      }
      if (!files?.["apollo"]?.[0]) {
        res.status(400).json({ erro: "Arquivo do Relatório Apollo não enviado." });
        return;
      }

      const livroFiscalFile = files["livroFiscal"][0];
      const apolloFile = files["apollo"][0];

      req.log.info(
        { livroFiscal: livroFiscalFile.originalname, apollo: apolloFile.originalname },
        "Iniciando processamento de reconciliação",
      );

      const [notasLF, notasApollo] = await Promise.all([
        parseLivroFiscal(livroFiscalFile.buffer, livroFiscalFile.mimetype, livroFiscalFile.originalname),
        parseApollo(apolloFile.buffer, apolloFile.mimetype, apolloFile.originalname),
      ]);

      if (notasLF.length === 0) {
        res.status(400).json({
          erro: "Nenhuma nota fiscal válida foi encontrada no Livro Fiscal após os filtros (ISS Retido = Sim, excluindo canceladas com ISS = 0). Verifique se o arquivo está correto.",
        });
        return;
      }

      req.log.info(
        { totalLivroFiscal: notasLF.length, totalApollo: notasApollo.length },
        "Notas carregadas, iniciando reconciliação",
      );

      const resultado = reconciliar(notasLF, notasApollo);

      req.log.info(resultado.resumo, "Reconciliação concluída");

      res.json(resultado);
    } catch (err) {
      req.log.error({ err }, "Erro durante processamento de reconciliação");
      res.status(400).json({
        erro: err instanceof Error ? err.message : "Erro ao processar os arquivos.",
      });
    }
  },
);

export default router;
