import { portalSession } from "./portal-session.js";
import { logger } from "../lib/logger.js";
import type { NotaPortal, Competencia } from "./portal-types.js";

const PORTAL_BASE = "https://nfse.rondonopolis.mt.gov.br";
const GRID_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/EmissaoLivroFiscal/GetDocumentosFiscaisGrid`;

// PDF report endpoints (Stimulsoft-based)
const PDF_SNAPSHOT_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/NotasFiscaisEletronicas/AglReportGetReportSnapshotHtml`;
const PDF_INIT_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/NotasFiscaisEletronicas/AglReportInitVars`;
const PDF_EXPORT_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/NotasFiscaisEletronicas/AglReportExportReportViewHtml`;

function calcularIntervalo(competencia: Competencia): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-indexed

  if (competencia === "mesAtual") {
    const dataInicial = `${String(1).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${ano}`;
    const dataFinal = `${String(hoje.getDate()).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${ano}`;
    return { dataInicial, dataFinal };
  } else {
    // Mês anterior
    const primeiroDiaMesAtual = new Date(ano, mes, 1);
    const ultimoDiaMesAnterior = new Date(primeiroDiaMesAtual.getTime() - 1);
    const anoAnt = ultimoDiaMesAnterior.getFullYear();
    const mesAnt = ultimoDiaMesAnterior.getMonth() + 1;
    const ultimoDia = ultimoDiaMesAnterior.getDate();
    const dataInicial = `01/${String(mesAnt).padStart(2, "0")}/${anoAnt}`;
    const dataFinal = `${String(ultimoDia).padStart(2, "0")}/${String(mesAnt).padStart(2, "0")}/${anoAnt}`;
    return { dataInicial, dataFinal };
  }
}

/**
 * Fetch all NFS-e from the portal for a given competência.
 * Handles pagination automatically.
 */
export async function buscarNotasPortal(competencia: Competencia): Promise<NotaPortal[]> {
  const { dataInicial, dataFinal } = calcularIntervalo(competencia);
  logger.info({ competencia, dataInicial, dataFinal }, "Buscando notas no portal");

  const pageSize = 100;
  const allNotas: NotaPortal[] = [];
  let page = 1;

  while (true) {
    const body = new URLSearchParams({
      "tipoDocumento": "Tomado",
      "dataInicial": dataInicial,
      "dataFinal": dataFinal,
      "page": String(page),
      "pageSize": String(pageSize),
      "sort": "",
      "group": "",
      "filter": "",
    });

    let res: Response;
    try {
      res = await portalSession.fetch(GRID_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${PORTAL_BASE}/NFSe/DocumentosFiscais/EmissaoLivroFiscal`,
        },
        body: body.toString(),
      });
    } catch (err) {
      throw new Error(
        `Falha ao comunicar com o portal: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok && res.status !== 200) {
      throw new Error(`Portal retornou status inesperado: ${res.status}`);
    }

    let json: { Data?: NotaPortal[]; Total?: number } | null = null;
    try {
      json = await res.json();
    } catch {
      throw new Error("Portal retornou resposta não-JSON. Possível mudança de layout ou sessão inválida.");
    }

    const notas: NotaPortal[] = json?.Data ?? [];
    const total: number = json?.Total ?? 0;

    if (notas.length === 0) break;

    allNotas.push(...notas);
    logger.info({ page, fetched: notas.length, total, accumulated: allNotas.length }, "Página de notas recebida");

    if (allNotas.length >= total) break;
    page++;
  }

  logger.info({ total: allNotas.length }, "Busca de notas no portal concluída");
  return allNotas;
}

/**
 * Try to obtain the PDF bytes for a nota from Rondonópolis.
 * Returns null if the report endpoint is not reachable.
 */
export async function obterPdfNota(idPortal: number, chaveAcesso: string): Promise<Buffer | null> {
  logger.info({ idPortal }, "Solicitando PDF da nota fiscal");

  try {
    // Step 1: get report snapshot (initializes the Stimulsoft report session)
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

    // Step 2: init report vars (may be required by Stimulsoft)
    await portalSession.fetch(PDF_INIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ reportName: "NFSe" }).toString(),
    });

    // Step 3: export as PDF
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

    const arrayBuffer = await exportRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error({ err, idPortal }, "Erro ao obter PDF da nota");
    return null;
  }
}

/** URL pública para notas de outros municípios — não exige autenticação */
export function urlConsultaPublica(chaveAcesso: string): string {
  return `https://www.nfse.gov.br/consultapublica/?chave=${chaveAcesso}&tpc=1`;
}
