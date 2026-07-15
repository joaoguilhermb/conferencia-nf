import { logger } from "../lib/logger.js";
import type { Competencia } from "./portal-types.js";

const PORTAL_BASE = "https://nfse.rondonopolis.mt.gov.br";
const SESSION_TTL_MS = 14 * 60 * 1000; // 14 min (conservador; portal expira perto de 20 min)

const DEFAULT_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
  accept: "*/*",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  referer: `${PORTAL_BASE}/`,
  origin: PORTAL_BASE,
};

interface CompetenciaDisponivel {
  id: number; // = IdCompetenciaEconomico usado no filtro do Livro Fiscal
  mes: number;
  ano: number;
  mesString: string;
}

function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 90 : 122;
    const code = c.charCodeAt(0) + 13;
    return String.fromCharCode(code <= base ? code : code - 26);
  });
}

function codificarSenha(senha: string): string {
  const base64 = Buffer.from(senha, "utf-8").toString("base64");
  return rot13(base64);
}

/**
 * Sessão contra o portal Ágilis Blue via HTTP puro — sem Playwright/Chromium.
 * O fluxo de login foi validado por engenharia reversa do HAR (ver
 * teste-login-agilis-blue.mjs, que é a fonte deste código).
 */
class PortalSession {
  private cookies: Map<string, string> = new Map();
  private expiresAt = 0;
  private loginInProgress: Promise<void> | null = null;

  private idEconomico: number | null = null;
  // Lista de competências disponíveis NA TELA de Livro Fiscal — não confundir
  // com a competência usada durante o login (são endpoints diferentes, ver
  // comentário em getIdCompetencia).
  private competencias: CompetenciaDisponivel[] | null = null;

  async ensureSession(): Promise<void> {
    if (this.isValid()) return;

    if (!this.loginInProgress) {
      this.loginInProgress = this.login().finally(() => {
        this.loginInProgress = null;
      });
    }
    await this.loginInProgress;
  }

  /** Faz uma requisição autenticada, reautenticando uma vez se a sessão tiver expirado. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    await this.ensureSession();
    let res = await this.rawFetch(url, init);

    if (this.isLoginRedirect(res)) {
      logger.warn({ url }, "Sessão do portal expirou no meio da requisição, reautenticando");
      this.invalidate();
      await this.ensureSession();
      res = await this.rawFetch(url, init);
    }

    return res;
  }

  invalidate(): void {
    this.cookies.clear();
    this.expiresAt = 0;
    this.idEconomico = null;
    this.competencias = null;
  }

  getIdEconomico(): number {
    if (this.idEconomico === null) {
      throw new Error("Sessão ainda não estabelecida — chame ensureSession() ou fetch() antes.");
    }
    return this.idEconomico;
  }

  /**
   * Resolve o IdCompetenciaEconomico pra "mesAtual" ou "mesAnterior".
   *
   * IMPORTANTE: isso NÃO é o mesmo Id retornado durante o login
   * (GetCompetenciasEconomico). É um Id vindo de um endpoint diferente,
   * específico da tela de Livro Fiscal (GetCompetenciaEconomicoCombo),
   * confirmado por captura de HAR em 13/07/2026.
   */
  async getIdCompetencia(competencia: Competencia): Promise<number> {
    await this.ensureSession();
    if (!this.competencias) {
      this.competencias = await this.buscarCompetenciasDisponiveis();
    }

    const hoje = new Date();
    let mesAlvo = hoje.getMonth() + 1; // getMonth() é 0-indexado
    let anoAlvo = hoje.getFullYear();

    if (competencia === "mesAnterior") {
      mesAlvo -= 1;
      if (mesAlvo === 0) {
        mesAlvo = 12;
        anoAlvo -= 1;
      }
    }

    const match = this.competencias.find((c) => c.mes === mesAlvo && c.ano === anoAlvo);
    if (!match) {
      throw new Error(
        `Competência ${mesAlvo}/${anoAlvo} não encontrada na lista do portal. ` +
        `Disponíveis: ${this.competencias.map((c) => c.mesString).join(", ")}`,
      );
    }
    return match.id;
  }

  private async buscarCompetenciasDisponiveis(): Promise<CompetenciaDisponivel[]> {
    const body = new URLSearchParams({
      modelName: "",
      idEconomico: String(this.getIdEconomico()),
      page: "1",
      start: "0",
      limit: "25",
    });

    const res = await this.fetch(
      `${PORTAL_BASE}/NFSe/CadastrosTecnicos/CompetenciaTributaria/GetCompetenciaEconomicoCombo`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
        },
        body: body.toString(),
      },
    );

    const data = (await res.json()) as {
      Dados: Array<{ Id: number; Mes: number; Ano: number; MesString: string }>;
    };
    return data.Dados.map((d) => ({ id: d.Id, mes: d.Mes, ano: d.Ano, mesString: d.MesString }));
  }

  // ─────────────────────────────────────────────────────────────
  // Privados
  // ─────────────────────────────────────────────────────────────

  private isValid(): boolean {
    return this.cookies.size > 0 && Date.now() < this.expiresAt;
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private updateCookieJar(response: Response): void {
    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    for (const raw of setCookieHeaders) {
      const pair = raw.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      // Corta só no PRIMEIRO "=" — o valor do cookie pode ter "=" dentro
      // (ex.: padding de base64). Foi exatamente esse bug que causava 403
      // antes, no teste-login-agilis-blue.mjs original.
      this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1));
    }
  }

  private async rawFetch(url: string, init: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...DEFAULT_HEADERS,
        ...(init.headers as Record<string, string> | undefined),
        cookie: this.cookieHeader(),
      },
    });
    this.updateCookieJar(response);
    return response;
  }

  private isLoginRedirect(res: Response): boolean {
    return res.redirected && res.url.toLowerCase().includes("login");
  }

  private async requestJson<T>(path: string): Promise<T> {
    const res = await this.rawFetch(`${PORTAL_BASE}${path}`, {
      headers: { "x-requested-with": "XMLHttpRequest" },
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Resposta inesperada (não-JSON) de ${path}: ${text.slice(0, 200)}`);
    }
  }

  private async login(): Promise<void> {
    const cnpj = process.env["AGILIS_BLUE_CNPJ"];
    const senha = process.env["AGILIS_BLUE_SENHA"];

    if (!cnpj || !senha) {
      throw new Error("AGILIS_BLUE_CNPJ e AGILIS_BLUE_SENHA devem ser definidos nas variáveis de ambiente.");
    }

    logger.info("Iniciando login no portal Ágilis Blue via HTTP puro");

    try {
      await this.rawFetch(`${PORTAL_BASE}/`, {});

      const azd = codificarSenha(senha);
      const bodyValidar = new URLSearchParams({
        azd,
        moduloSelecionado: "Nfse",
        username: cnpj,
        pwd: "",
        rememberMe: "true",
        rm: "0",
        rem: "2",
      });

      const respValidar = await this.rawFetch(`${PORTAL_BASE}/Responsabilidades/Login/ValidarLogin`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
        },
        body: bodyValidar.toString(),
      });
      const dataValidar = (await respValidar.json()) as { success: boolean };
      if (!dataValidar.success) {
        throw new Error("Portal recusou usuário/senha em ValidarLogin.");
      }

      const ugData = await this.requestJson<{ Dados: Array<{ Id: number; Fantasia: string }> }>(
        "/UnidadesGestoras/UnidadeGestora/GetUnidadesGestorasCombo?modelName=&naoExibirUGLogada=false&id=1&page=1&start=0&limit=10",
      );
      const ug = ugData.Dados[0];

      const perfilData = await this.requestJson<{
        Dados: Array<{ Id: number; Nome: string; IdPerfilCoreXUsuario: number }>;
      }>(
        `/Responsabilidades/Login/GetPerfisDoUsuarioNaUGCombo?apenasVigentes=true&apenasEconomicoLogado=false&apenasPermiteSolicitacaoAcessoViaPortal=false&idUnidadeGestora=${ug.Id}&id=-7&page=1&start=0&limit=10`,
      );
      const perfil = perfilData.Dados[0];

      const economicoData = await this.requestJson<{ Dados: Array<{ Id: number; Nome: string }> }>(
        `/Responsabilidades/Login/GetEconomicosRepresentadosPeloUsuarioNoPerfil?idPerfil=${perfil.Id}&id=1037&page=1&start=0&limit=10`,
      );
      const economico = economicoData.Dados[0];

      const competenciaData = await this.requestJson<{
        Dados: Array<{ Id: number; Competencia: string; Exercicio: number }>;
      }>(
        `/Pessoas/Economico/GetCompetenciasEconomico?idUnidadeGestora=${ug.Id}&idEconomico=${economico.Id}&page=1&start=0&limit=25`,
      );
      const competencia = competenciaData.Dados[0];

      const dados = {
        NomePerfil: perfil.Nome,
        IdPerfilCoreXUsuario: perfil.IdPerfilCoreXUsuario,
        NomeRazaoSocialPessoaVinculada: "",
        NomeEconomico: economico.Nome,
        CompetenciaEconomico: competencia.Competencia,
        CodigoDescricaoEstruturaAdministrativa: "",
        IdUnidadeGestora: ug.Id,
        IdPerfilCore: perfil.Id,
        IdEconomico: economico.Id,
        exercicio: String(competencia.Exercicio),
        IdEstruturaAdministrativa: "",
        Competencia: competencia.Id,
        IP: "",
      };
      const bodyLogar = new URLSearchParams({ dados: JSON.stringify(dados) });

      const respLogar = await this.rawFetch(`${PORTAL_BASE}/Responsabilidades/Login/LogarUsuario`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
        },
        body: bodyLogar.toString(),
      });
      const dataLogar = (await respLogar.json()) as { userSessionData?: string };
      if (!dataLogar.userSessionData) {
        throw new Error("LogarUsuario não retornou userSessionData — login pode ter falhado.");
      }

      this.idEconomico = economico.Id;
      this.competencias = null;
      this.expiresAt = Date.now() + SESSION_TTL_MS;

      logger.info({ idEconomico: this.idEconomico }, "Login no portal concluído (HTTP puro, sem navegador)");
    } catch (err) {
      this.cookies.clear();
      this.expiresAt = 0;
      this.idEconomico = null;
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, "Falha no login do portal Ágilis Blue");
      throw new Error(`Falha ao autenticar no portal Ágilis Blue: ${message}`);
    }
  }
}

export const portalSession = new PortalSession();