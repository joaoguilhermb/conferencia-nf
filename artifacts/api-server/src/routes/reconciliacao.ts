import { Router } from "express";
import multer from "multer";
import { parseArquivo } from "../lib/parseArquivo.js";
import { reconciliar } from "../lib/reconciliacao.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

router.post(
  "/reconciliacao/processar",
  upload.fields([
    { name: "livroFiscal", maxCount: 1 },
    { name: "apollo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as
        | Record<string, Express.Multer.File[]>
        | undefined;

      if (!files?.["livroFiscal"]?.[0]) {
        res
          .status(400)
          .json({ erro: "Arquivo do Livro Fiscal não enviado." });
        return;
      }

      if (!files?.["apollo"]?.[0]) {
        res
          .status(400)
          .json({ erro: "Arquivo do Relatório Apollo não enviado." });
        return;
      }

      const livroFiscalFile = files["livroFiscal"][0];
      const apolloFile = files["apollo"][0];

      req.log.info(
        {
          livroFiscal: livroFiscalFile.originalname,
          apollo: apolloFile.originalname,
        },
        "Iniciando processamento de reconciliação",
      );

      const [notasLivroFiscal, notasApollo] = await Promise.all([
        parseArquivo(
          livroFiscalFile.buffer,
          livroFiscalFile.mimetype,
          livroFiscalFile.originalname,
        ),
        parseArquivo(
          apolloFile.buffer,
          apolloFile.mimetype,
          apolloFile.originalname,
        ),
      ]);

      if (notasLivroFiscal.length === 0) {
        res.status(400).json({
          erro:
            "Nenhuma nota fiscal foi encontrada no Livro Fiscal. Verifique se as colunas estão corretamente nomeadas.",
        });
        return;
      }

      req.log.info(
        {
          totalLivroFiscal: notasLivroFiscal.length,
          totalApollo: notasApollo.length,
        },
        "Notas carregadas, iniciando reconciliação",
      );

      const resultado = reconciliar(notasLivroFiscal, notasApollo);

      req.log.info(
        resultado.resumo,
        "Reconciliação concluída",
      );

      res.json(resultado);
    } catch (err) {
      req.log.error({ err }, "Erro durante processamento de reconciliação");
      res.status(400).json({
        erro:
          err instanceof Error
            ? err.message
            : "Erro ao processar os arquivos.",
      });
    }
  },
);

export default router;
