import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { logger } from "../lib/logger.js";

const PORTAL_BASE = "https://nfse.rondonopolis.mt.gov.br";
const LOGIN_URL = `${PORTAL_BASE}/Responsabilidades/Login`;

/** Cookie names expected after a successful login */
const REQUIRED_COOKIES = [
  "ASP.NET_SessionId",
  "__RequestVerificationToken",
  "blue.loginData",
  "blue.username",
];

const SESSION_TTL_MS = 14 * 60 * 1000; // 14 min (conservative, portal expires at ~20 min)

class PortalSession {
  private cookies: Map<string, string> = new Map();
  private expiresAt = 0;
  private loginInProgress: Promise<void> | null = null;

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  /** Ensure a valid session exists, running Playwright login if needed. */
  async ensureSession(): Promise<Map<string, string>> {
    if (this.isValid()) return this.cookies;

    // Deduplicate concurrent logins — only one Playwright instance at a time
    if (!this.loginInProgress) {
      this.loginInProgress = this.login().finally(() => {
        this.loginInProgress = null;
      });
    }
    await this.loginInProgress;
    return this.cookies;
  }

  /** Make an authenticated fetch, auto-retrying once on session expiry. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const cookies = await this.ensureSession();
    const res = await this.rawFetch(url, init, cookies);

    // Detect redirect to login page = session expired
    if (this.isLoginRedirect(res)) {
      logger.warn({ url }, "Portal session expired mid-request, re-authenticating");
      this.invalidate();
      const freshCookies = await this.ensureSession();
      return this.rawFetch(url, init, freshCookies);
    }

    return res;
  }

  invalidate(): void {
    this.cookies.clear();
    this.expiresAt = 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  private isValid(): boolean {
    return this.cookies.size > 0 && Date.now() < this.expiresAt;
  }

  private async rawFetch(
    url: string,
    init: RequestInit,
    cookies: Map<string, string>,
  ): Promise<Response> {
    const cookieHeader = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    return fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Cookie: cookieHeader,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
  }

  private isLoginRedirect(res: Response): boolean {
    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get("location") ?? "";
      return location.toLowerCase().includes("login");
    }
    // Some portals return 200 with a meta-refresh to login
    return false;
  }

  private async login(): Promise<void> {
    const cnpj = process.env["AGILIS_BLUE_CNPJ"];
    const senha = process.env["AGILIS_BLUE_SENHA"];

    if (!cnpj || !senha) {
      throw new Error(
        "AGILIS_BLUE_CNPJ e AGILIS_BLUE_SENHA devem ser definidos nas variáveis de ambiente.",
      );
    }

    logger.info("Iniciando login no portal Ágilis Blue via Playwright");

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: false, slowMo: 300 });
      const context: BrowserContext = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        locale: "pt-BR",
      });
      const page: Page = await context.newPage();

      // Step 1: Navigate to login page (loads the SPA and generates anti-CSRF token)
      await page.goto(LOGIN_URL, { waitUntil: "networkidle" });

      // Step 2: Fill CNPJ and submit first step
      await page.fill('input[name="cnpj"], input[id*="cnpj"], input[placeholder*="CNPJ"]', cnpj);

      // Click first submit — waits for the second step (senha) to appear
      await Promise.all([
        page.waitForResponse(
          (resp) => resp.url().includes("ValidarLogin") && resp.status() === 200,
          { timeout: 15000 },
        ),
        page.click('button[type="submit"], input[type="submit"]'),
      ]);

      // Step 3: Fill senha and submit second step
      await page.fill('input[type="password"]', senha);

      await Promise.all([
        page.waitForResponse(
          (resp) => resp.url().includes("LogarUsuario") && resp.status() === 200,
          { timeout: 15000 },
        ),
        page.click('button[type="submit"], input[type="submit"]'),
      ]);

      // Step 4: Wait for post-login navigation
      await page.waitForURL((url) => !url.href.toLowerCase().includes("login"), {
        timeout: 15000,
      });

      // Step 5: Extract cookies
      const pageCookies = await context.cookies();
      this.cookies.clear();
      for (const c of pageCookies) {
        this.cookies.set(c.name, c.value);
      }

      // Validate we got the required cookies
      const missing = REQUIRED_COOKIES.filter((name) => !this.cookies.has(name));
      if (missing.length > 0) {
        logger.warn({ missing }, "Login pode ter falhado: cookies esperados não encontrados");
      }

      this.expiresAt = Date.now() + SESSION_TTL_MS;
      logger.info({ cookieCount: this.cookies.size }, "Login no portal concluído com sucesso");
    } catch (err) {
      this.cookies.clear();
      this.expiresAt = 0;
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, "Falha no login do portal Ágilis Blue");
      throw new Error(`Falha ao autenticar no portal Ágilis Blue: ${message}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }
}

// Singleton — one session shared across the process lifetime
export const portalSession = new PortalSession();
