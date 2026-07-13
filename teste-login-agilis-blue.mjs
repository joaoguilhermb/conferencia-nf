// teste-login-agilis-blue.mjs
//
// Script standalone pra validar se dá pra fazer login no portal Ágilis Blue
// (NFS-e Rondonópolis) usando só HTTP puro (fetch nativo do Node), sem Playwright/navegador.
//
// Só existe pra validar a hipótese antes de mexer no código de verdade do projeto.
// Não faz parte do monorepo, é descartável.
//
// Como rodar (Git Bash):
//   cd até a pasta onde você salvou este arquivo
//   AGILIS_BLUE_CNPJ="00784470000193" AGILIS_BLUE_SENHA="sua_senha_aqui" node teste-login-agilis-blue.mjs
//
// Repare na sintaxe: no Git Bash, "VAR=valor comando" define a variável só
// pra essa execução do comando (não fica salva depois). No PowerShell isso
// não funcionaria (por isso especifico Git Bash aqui).

const BASE_URL = "https://nfse.rondonopolis.mt.gov.br";

const CNPJ = process.env.AGILIS_BLUE_CNPJ;
const SENHA = process.env.AGILIS_BLUE_SENHA;

if (!CNPJ || !SENHA) {
  console.error(
    "Defina AGILIS_BLUE_CNPJ e AGILIS_BLUE_SENHA nas variáveis de ambiente antes de rodar.",
  );
  process.exit(1);
}

// --- "cookie jar" manual e simples ---
// Guarda os cookies recebidos e manda de volta em toda requisição seguinte,
// exatamente como um navegador faz sozinho, sem precisar de biblioteca externa
// pra esse teste rápido (no código final do projeto, aí sim vale usar
// tough-cookie + fetch-cookie, que tratam casos extras como Path e Expires).
const cookieJar = new Map();

function updateCookieJar(response) {
  const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookieHeaders) {
    const [pair] = raw.split(";"); // pega só "nome=valor", ignora Path/Expires/etc
    // Corta só no PRIMEIRO "=" — o valor do cookie pode ter "=" dentro dele
    // (ex.: padding de base64, tipo "xyz=="). Usar split("=") ingênuo (como
    // estava antes) quebra o valor em pedaços errados e trunca o cookie
    // silenciosamente — era exatamente esse o bug que causava o 403.
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1);
    cookieJar.set(name, value);
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

// Headers padrão que um navegador de verdade manda em toda requisição.
const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
  accept: "*/*",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  referer: `${BASE_URL}/`,
  origin: BASE_URL,
  "sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Microsoft Edge";v="150"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...options.headers,
      cookie: cookieHeader(),
    },
  });
  updateCookieJar(response);

  if (response.redirected) {
    console.log(
      `   ⚠️  a requisição pra ${path} foi redirecionada para: ${response.url}`,
    );
  }
  console.log(`   status: ${response.status} | cookies atuais: [${[...cookieJar.keys()].join(", ")}]`);

  // Diagnóstico extra: mostra o valor bruto de cada cookie (truncado a 60
  // caracteres) pra dar pra conferir visualmente se algum ficou cortado.
  for (const [k, v] of cookieJar.entries()) {
    console.log(`      cookie ${k} = ${v.slice(0, 60)}${v.length > 60 ? "…(" + v.length + " chars)" : ""}`);
  }

  return response;
}

async function requestJson(path, options = {}) {
  const response = await request(path, options);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error(
      `\n❌ Resposta de ${path} não é JSON. Primeiros 300 caracteres do corpo:\n`,
      text.slice(0, 300),
    );
    throw new Error(`Resposta inesperada (não-JSON) de ${path}`);
  }
}

// --- codificação da senha ---
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 90 : 122;
    const code = c.charCodeAt(0) + 13;
    return String.fromCharCode(code <= base ? code : code - 26);
  });
}

function codificarSenha(senha) {
  const base64 = Buffer.from(senha, "utf-8").toString("base64");
  return rot13(base64);
}

async function main() {
  console.log("1. Carregando a página inicial pra pegar o cookie de sessão...");
  await request("/");
  console.log("   cookies após carregar /:", [...cookieJar.keys()]);

  console.log("\n2. Validando credenciais (ValidarLogin)...");
  const azd = codificarSenha(SENHA);
  const bodyValidar = new URLSearchParams({
    azd,
    moduloSelecionado: "Nfse",
    username: CNPJ,
    pwd: "",
    rememberMe: "true",
    rm: "0",
    rem: "2",
  });

  const respValidar = await request("/Responsabilidades/Login/ValidarLogin", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      accept: "*/*",
      origin: BASE_URL,
      referer: `${BASE_URL}/`,
    },
    body: bodyValidar.toString(),
  });

  const dataValidar = await respValidar.json();
  console.log("   resposta:", dataValidar);

  if (!dataValidar.success) {
    console.error("Login falhou na validação de credenciais. Parando aqui.");
    process.exit(1);
  }

  console.log(
    "\n3. Buscando os dados de Unidade Gestora / Perfil / Econômico / Competência...",
  );

  const ugData = await requestJson(
    "/UnidadesGestoras/UnidadeGestora/GetUnidadesGestorasCombo?modelName=&naoExibirUGLogada=false&id=1&page=1&start=0&limit=10",
    { headers: { "x-requested-with": "XMLHttpRequest" } },
  );
  const ug = ugData.Dados[0];
  console.log("   Unidade Gestora:", ug.Fantasia, "(Id:", ug.Id + ")");

  const perfilData = await requestJson(
    `/Responsabilidades/Login/GetPerfisDoUsuarioNaUGCombo?apenasVigentes=true&apenasEconomicoLogado=false&apenasPermiteSolicitacaoAcessoViaPortal=false&idUnidadeGestora=${ug.Id}&id=-7&page=1&start=0&limit=10`,
    { headers: { "x-requested-with": "XMLHttpRequest" } },
  );
  const perfil = perfilData.Dados[0];
  console.log("   Perfil:", perfil.Nome, "(Id:", perfil.Id + ")");

  const economicoData = await requestJson(
    `/Responsabilidades/Login/GetEconomicosRepresentadosPeloUsuarioNoPerfil?idPerfil=${perfil.Id}&id=1037&page=1&start=0&limit=10`,
    { headers: { "x-requested-with": "XMLHttpRequest" } },
  );
  const economico = economicoData.Dados[0];
  console.log("   Econômico:", economico.Nome, "(Id:", economico.Id + ")");

  const competenciaData = await requestJson(
    `/Pessoas/Economico/GetCompetenciasEconomico?idUnidadeGestora=${ug.Id}&idEconomico=${economico.Id}&page=1&start=0&limit=25`,
    { headers: { "x-requested-with": "XMLHttpRequest" } },
  );
  const competencia = competenciaData.Dados[0];
  console.log("   Competência:", competencia.Competencia, "(Id:", competencia.Id + ")");

  console.log("\n4. Efetivando o login (LogarUsuario)...");
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

  const respLogar = await request("/Responsabilidades/Login/LogarUsuario", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      accept: "*/*",
      origin: BASE_URL,
      referer: `${BASE_URL}/`,
    },
    body: bodyLogar.toString(),
  });

  const dataLogar = await respLogar.json();
  const sessionData = dataLogar.userSessionData
    ? JSON.parse(dataLogar.userSessionData)
    : null;
  console.log("   resposta:", sessionData ?? dataLogar);

  if (sessionData) {
    console.log(
      "\n✅ LOGIN CONFIRMADO — sessão ativa sem usar navegador nenhum.",
    );
    console.log("Cookies finais da sessão:", [...cookieJar.keys()]);
  } else {
    console.log("\n❌ Algo não bateu — resposta não trouxe userSessionData.");
  }
}

main().catch((err) => {
  console.error("Erro durante o teste:", err);
  process.exit(1);
});
