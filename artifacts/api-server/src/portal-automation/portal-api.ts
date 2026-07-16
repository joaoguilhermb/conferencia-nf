import { randomUUID } from "node:crypto";
import { portalSession } from "./portal-session.js";
import { logger } from "../lib/logger.js";
import type { NotaPortal, Competencia } from "./portal-types.js";

let filaPortal: Promise<void> = Promise.resolve();

const PORTAL_BASE = "https://nfse.rondonopolis.mt.gov.br";
const GRID_URL = `${PORTAL_BASE}/NFSe/DocumentosFiscais/EmissaoLivroFiscal/GetDocumentosFiscaisGrid`;

// ---------------------------------------------------------------------------
// Fluxo do Viewer Stimulsoft (confirmado via HAR — 15/07/2026)
//
// 1. POST GerarNFSeCompetencia
//      → gera o relatório daquela nota especificamente no servidor e
//        responde com um redirect (302) pra IndexReportView, já com o
//        parâmetro 'uc' (contexto de sessão) pronto. Não precisa descobrir
//        nada por tentativa — o fetch já segue o redirect sozinho.
// 2. (via redirect) GET IndexReportView
//      → HTML do Viewer, de onde tiramos clientGuid e requestToken.
// 3. POST AglReportGetReportSnapshotHtml
//      → devolve JSON com pagesArray:
//          [0] = { content: "<html da nota>" }
//          [1] = "css específico daquela nota" (string solta, sem chave)
//        Isso é só pra VISUALIZAR no navegador — não é PDF. O "salvar como
//        PDF" fica por conta do Ctrl+P do navegador em cima desse HTML.
// ---------------------------------------------------------------------------
const VIEWER_BASE = `${PORTAL_BASE}/NotasFiscaisEletronicas/NotaFiscalServicoEletronica`;
const GERAR_RELATORIO_URL = `${VIEWER_BASE}/GerarNFSeCompetencia`;

// ID do MODELO/template de impressão dentro do portal — não é o ID da nota.
// O portal tem mais de um layout disponível; usamos o "Com o Nome do Econômico".
const REPORT_TEMPLATE_ID = "717";
const REPORT_TEMPLATE_NOME = "Impressão NFS-e (Com o Nome do Econômico)";

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

// ---------------------------------------------------------------------------
// Configuração do Viewer, extraída do HTML do IndexReportView.
// O Stimulsoft injeta um objeto JSON dentro de um <script> com esses campos.
// ---------------------------------------------------------------------------
interface ViewerConfig {
  clientGuid: string;
  requestToken: string;
}

function extrairViewerConfig(html: string): ViewerConfig {
  const clientGuid = html.match(/"clientGuid":"([^"]+)"/)?.[1] ?? "";
  const requestToken = html.match(/"requestToken":"([^"]+)"/)?.[1] ?? "";
  return { clientGuid, requestToken };
}

/**
 * Monta o corpo (em base64) do parâmetro stiweb_parameters exigido pelo
 * AglReportGetReportSnapshotHtml. Formato extraído byte a byte de uma
 * requisição real do navegador (HAR — 15/07/2026). Os únicos campos que
 * mudam de uma chamada pra outra são clientGuid (por sessão do Viewer) e
 * routes.id (o template de relatório usado).
 */
function montarStiwebParameters(clientGuid: string): string {
  const payload = {
    viewerId: "MvcViewer",
    routes: {
      action: "IndexReportView",
      controller: "NotaFiscalServicoEletronica",
      id: `${REPORT_TEMPLATE_ID}||`,
    },
    formValues: {},
    clientGuid,
    drillDownGuid: null,
    dashboardDrillDownGuid: null,
    cacheMode: "ObjectCache",
    cacheTimeout: 60,
    cacheItemPriority: "Default",
    pageNumber: 0,
    originalPageNumber: 0,
    reportType: "Auto",
    zoom: 100,
    viewMode: "SinglePage",
    showBookmarks: true,
    openLinksWindow: "_blank",
    chartRenderType: "AnimatedVector",
    reportDisplayMode: "Table",
    drillDownParameters: [],
    editableParameters: null,
    useRelativeUrls: true,
    passQueryParametersForResources: true,
    passQueryParametersToReport: false,
    version: "2022.1.6",
    reportDesignerMode: false,
    imagesQuality: "Normal",
    parametersPanelSortDataItems: true,
    combineReportPages: false,
    allowAutoUpdateCookies: false,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Formato de resposta do AglReportGetReportSnapshotHtml.
 * pagesArray[0] = objeto com o HTML da nota (campo "content").
 * pagesArray[1] = string solta com o CSS específico daquela nota.
 * (Confirmado inspecionando o JSON real — não documentado pelo Stimulsoft.)
 */
interface SnapshotResponse {
  pagesArray?: Array<{ content?: string; sizes?: string } | string>;
}

/**
 * Obtém o HTML pronto pra visualização/impressão de uma NFS-e do portal
 * Ágilis Blue.
 *
 * Importante: isso NÃO gera um PDF no servidor. O portal não expõe (ou pelo
 * menos não usa, no fluxo normal do usuário) nenhum endpoint de export/print
 * que devolva um PDF binário — confirmado inspecionando 4 capturas de HAR
 * reais, nenhuma delas teve uma única resposta com content-type de PDF.
 * O botão de "imprimir" do Viewer do Stimulsoft usa o print nativo do
 * navegador (Ctrl+P) em cima do HTML já renderizado.
 *
 * Por isso a estratégia aqui é: montar esse mesmo HTML (conteúdo + CSS) e
 * devolver pro frontend, que abre numa nova aba — o usuário salva como PDF
 * pelo diálogo de impressão do próprio navegador.
 */
export async function obterHtmlNota(idPortal: number): Promise<string | null> {
  logger.info({ idPortal }, "Solicitando visualização da nota fiscal");

  await filaPortal;

  let resolverFila: () => void = () => { };
  filaPortal = new Promise<void>((resolve) => {
    resolverFila = resolve;
  });

  try {
    // ── Passo 1: gerar o relatório dessa nota e seguir o redirect ────────────
    const gerarBody = new URLSearchParams({
      idDocumentoFiscalPrestacao: String(idPortal),
      id: REPORT_TEMPLATE_ID,
      nomeRelatorioSegundoPlano: REPORT_TEMPLATE_NOME,
      descricaoRelatorioSegundoPlano: "",
      idAplicacao: "-147",
      identificadorEmissaoRelatorio: randomUUID(),
    });

    const indexRes = await portalSession.fetch(GERAR_RELATORIO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${PORTAL_BASE}/NFSe/DocumentosFiscais/EmissaoLivroFiscal`,
      },
      body: gerarBody.toString(),
    });

    if (!indexRes.ok) {
      logger.warn({ status: indexRes.status, idPortal }, "GerarNFSeCompetencia falhou");
      return null;
    }

    // fetch já seguiu o redirect 302 sozinho — indexRes.url é a URL final,
    // com o parâmetro 'uc' já preenchido pelo servidor.
    const indexReportViewUrl = indexRes.url;
    const indexHtml = await indexRes.text();

    if (!indexReportViewUrl.includes("IndexReportView")) {
      logger.warn({ idPortal, indexReportViewUrl }, "Redirecionamento não levou ao IndexReportView — sessão pode ter expirado");
      return null;
    }

    const { clientGuid, requestToken } = extrairViewerConfig(indexHtml);

    if (!clientGuid || !requestToken) {
      logger.warn(
        { idPortal, temClientGuid: Boolean(clientGuid), temRequestToken: Boolean(requestToken) },
        "clientGuid ou requestToken não encontrados no HTML do Viewer",
      );
      return null;
    }

    // ── Passo 2: pedir o snapshot do relatório (conteúdo real da nota) ───────
    const snapshotUrl = indexReportViewUrl.replace("IndexReportView", "AglReportGetReportSnapshotHtml");

    const snapshotBody = new URLSearchParams({
      stiweb_component: "Viewer",
      stiweb_action: "GetReport",
      stiweb_parameters: montarStiwebParameters(clientGuid),
      __RequestVerificationToken: requestToken,
    });

    const snapshotRes = await portalSession.fetch(snapshotUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        requestverificationtoken: requestToken,
        Referer: indexReportViewUrl,
      },
      body: snapshotBody.toString(),
    });

    if (!snapshotRes.ok) {
      logger.warn({ status: snapshotRes.status, idPortal }, "AglReportGetReportSnapshotHtml falhou");
      return null;
    }

    let snapshot: SnapshotResponse;
    try {
      snapshot = (await snapshotRes.json()) as SnapshotResponse;
    } catch {
      logger.warn({ idPortal }, "Resposta do snapshot não é JSON válido");
      return null;
    }

    const primeiraPagina = snapshot.pagesArray?.[0];
    const cssPagina = snapshot.pagesArray?.[1];

    const conteudoHtml = typeof primeiraPagina === "object" ? primeiraPagina?.content : undefined;
    const conteudoCss = typeof cssPagina === "string" ? cssPagina : "";
    const tamanhoPagina = typeof primeiraPagina === "object" ? primeiraPagina?.sizes : undefined;

    if (!conteudoHtml) {
      logger.warn({ idPortal }, "Snapshot veio sem conteúdo (pagesArray[0].content vazio)");
      return null;
    }

    // O relatório é desenhado a 100px por polegada, mas o navegador imprime
    // a 96px por polegada — sem essa conversão, o conteúdo sai ~4% maior que
    // o papel e é cortado. "sizes" vem como "largura;altura" nessa escala de
    // 100px/polegada (ex: "827;1169" = A4). Convertendo pra polegadas reais.
    const [larguraRaw, alturaRaw] = (tamanhoPagina ?? "827;1169").split(";").map(Number);
    const larguraPoleg = (larguraRaw || 827) / 100;
    const alturaPoleg = (alturaRaw || 1169) / 100;

    logger.info({ idPortal }, "HTML da nota obtido com sucesso");

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>NFS-e ${idPortal}</title>
<style>
  ${conteudoCss}

  @page {
    size: ${larguraPoleg}in ${alturaPoleg}in;
    margin: 0;
  }

  html, body {
    margin: 0;
    height: 100%;
  }

  .nf-conteudo {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar-nf {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #eaf1fb;
    border-bottom: 1px solid #b8cbe8;
    font-family: Arial, sans-serif;
  }
  .toolbar-nf button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 13px;
    color: #1a4d8f;
    background: #fff;
    border: 1px solid #b8cbe8;
    border-radius: 3px;
    cursor: pointer;
  }
  .toolbar-nf button:hover {
    background: #dce8fb;
  }

  @media print {
    .toolbar-nf { display: none; }
    /* Corrige a diferença de escala: relatório desenhado a 100px/polegada,
       navegador imprime a 96px/polegada. */
    .nf-conteudo { zoom: 0.96; }
  }
</style>
</head>
<body>
<div class="toolbar-nf">
  <button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
</div>
<div class="nf-conteudo">
${conteudoHtml}
</div>
</body>
</html>`;
  } catch (err) {
    logger.error({ err, idPortal }, "Erro ao obter HTML da nota");
    return null;
  } finally {
    resolverFila();
  }
}

export function urlConsultaPublica(chaveAcesso: string): string {
  return `https://www.nfse.gov.br/consultapublica/?chave=${chaveAcesso}&tpc=1`;
}