import type { NotaLivroFiscal, NotaApollo } from "./reconciliacao.js";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;

function toFloat(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;

  // Se já é número, retorna direto
  if (typeof v === "number") return v;

  const s = String(v).replace(/[R$\s]/g, "").trim();

  // Formato brasileiro: 1.234,56 ou 1234,56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+(,\d+)$/.test(s)) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }

  // Formato americano ou já decimal: 1234.56 ou 1234
  return parseFloat(s.replace(",", "."));
}

function isDateLike(v: unknown): boolean {
  if (!v) return false;
  const s = String(v).trim();
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return true;
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(s)) return true;
  const n = parseFloat(s);
  if (!isNaN(n) && n > 20000 && n < 60000) return true; // Excel serial
  if (!isNaN(Date.parse(s))) return true;
  return false;
}

function parseDate(v: unknown): string {
  if (!v) return "";
  const s = String(v).trim();

  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (br) {
    const day = br[1]!.padStart(2, "0");
    const month = br[2]!.padStart(2, "0");
    let year = br[3]!;
    if (year.length === 2) year = "20" + year;
    return `${day}/${month}/${year}`;
  }

  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) {
    return `${iso[3]!.padStart(2, "0")}/${iso[2]!.padStart(2, "0")}/${iso[1]}`;
  }

  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 20000 && serial < 60000) {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + serial * 86400000);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
  }

  return s;
}

function parseCNPJ(v: unknown): string {
  if (!v) return "";
  const s = String(v).trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  return s;
}

// ---------------------------------------------------------------------------
// Column detection for headerless Livro Fiscal
// ---------------------------------------------------------------------------

type LFField = "numeroNota" | "dataEmissao" | "cnpj" | "status" | "issRetido" | "valorISS" | "valorBase";

function detectColumns(rows: unknown[][]): Map<LFField, number> {
  if (rows.length === 0) throw new Error("Arquivo vazio.");

  // Layout fixo do Livro Fiscal da Prefeitura de Rondonópolis:
  // col 0  = data de emissão
  // col 2  = número da NFS-e
  // col 4  = prestador (CNPJ + nome)
  // col 5  = status
  // col 10 = valor base
  // col 13 = ISS retido (Sim/Não)
  // col 15 = valor do ISS
  const FIXED: [LFField, number][] = [
    ["dataEmissao", 0],
    ["numeroNota", 2],
    ["cnpj", 4],
    ["status", 5],
    ["valorBase", 10],
    ["issRetido", 13],
    ["valorISS", 15],
  ];

  // Validar com as primeiras 5 linhas que o arquivo está no formato esperado
  const sample = rows.slice(0, 20);

  const issRetidoOk = sample.some((r) => {
    const v = String(r[13] ?? "").trim().toLowerCase();
    return v === "sim" || v === "não" || v === "nao";
  });

  const cnpjOk = sample.some((r) => CNPJ_RE.test(String(r[4] ?? "")));

  if (!issRetidoOk || !cnpjOk) {
    throw new Error(
      "O arquivo do Livro Fiscal não está no formato esperado. " +
      "Verifique se é a exportação correta da Prefeitura de Rondonópolis."
    );
  }

  const assigned = new Map<LFField, number>();
  for (const [field, col] of FIXED) {
    assigned.set(field, col);
  }

  console.log("=== COLUNAS DETECTADAS ===");
  for (const [field, colIndex] of assigned.entries()) {
    console.log(`  ${field}: coluna ${colIndex}`);
  }

  return assigned;
}

// ---------------------------------------------------------------------------
// Parse Livro Fiscal (no header)
// ---------------------------------------------------------------------------

export async function parseLivroFiscal(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
): Promise<NotaLivroFiscal[]> {
  const ext = originalname.split(".").pop()?.toLowerCase() ?? "";
  let rows: unknown[][];

  if (
    mimetype.includes("spreadsheet") ||
    mimetype.includes("excel") ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Nenhuma planilha encontrada no arquivo do Livro Fiscal.");
    const sheet = wb.Sheets[sheetName]!;
    const arr = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    rows = arr as unknown[][];
  } else if (mimetype === "text/csv" || ext === "csv") {
    const text = buffer.toString("utf-8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    const delim = lines[0]!.split(";").length > lines[0]!.split(",").length ? ";" : ",";
    rows = lines.map((line) =>
      line.split(delim).map((v) => v.trim().replace(/^"|"$/g, "") || null),
    );
  } else {
    throw new Error("Formato não suportado para o Livro Fiscal. Use XLSX ou CSV.");
  }

  // Remove completely empty rows
  rows = rows.filter((r) => r.some((v) => v !== null && v !== undefined && v !== ""));

  let colMap: Map<LFField, number>;
  try {
    colMap = detectColumns(rows);
  } catch {
    if (rows.length > 1) {
      colMap = detectColumns(rows.slice(1));
      rows = rows.slice(1);
    } else {
      throw new Error("Não foi possível detectar as colunas do Livro Fiscal.");
    }
  }

  const iCol = colMap.get("numeroNota")!;
  const dCol = colMap.get("dataEmissao");
  const cCol = colMap.get("cnpj")!;
  const sCol = colMap.get("status");
  const irCol = colMap.get("issRetido")!;
  const vbCol = colMap.get("valorBase")!;
  const viCol = colMap.get("valorISS")!;

  const notas: NotaLivroFiscal[] = [];

  for (const row of rows) {
    const issRetidoRaw = String(row[irCol] ?? "").trim().toLowerCase();
    const issRetido = issRetidoRaw === "sim" ? "Sim" : issRetidoRaw === "não" || issRetidoRaw === "nao" ? "Não" : null;

    if (issRetido === null) continue;
    if (issRetido !== "Sim") continue;

    const status = sCol !== undefined ? String(row[sCol] ?? "").trim() : "";
    const valorISS = toFloat(row[viCol]);

    if (status.toLowerCase() === "cancelado" && (isNaN(valorISS) || valorISS === 0)) continue;

    const numeroNota = String(row[iCol] ?? "").trim().replace(/\.0$/, "");
    if (!numeroNota || numeroNota === "null") continue;

    notas.push({
      numeroNota,
      dataEmissao: dCol !== undefined ? parseDate(row[dCol]) : "",
      cnpj: parseCNPJ(row[cCol]),
      status,
      issRetido: "Sim",
      valorBase: isNaN(toFloat(row[vbCol])) ? 0 : toFloat(row[vbCol]),
      valorISS: isNaN(valorISS) ? 0 : valorISS,
    });
  }

  return notas;
}

// ---------------------------------------------------------------------------
// Parse Apollo (named headers, filter Cidade == RONDONOPOLIS)
// ---------------------------------------------------------------------------

export async function parseApollo(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
): Promise<NotaApollo[]> {
  const ext = originalname.split(".").pop()?.toLowerCase() ?? "";
  let jsonData: Record<string, unknown>[];

  if (
    mimetype.includes("spreadsheet") ||
    mimetype.includes("excel") ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer", raw: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Nenhuma planilha encontrada no arquivo Apollo.");
    const sheet = wb.Sheets[sheetName]!;
    jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  } else if (mimetype === "text/csv" || ext === "csv") {
    const text = buffer.toString("utf-8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) return [];
    const delim = lines[0]!.split(";").length > lines[0]!.split(",").length ? ";" : ",";
    const headers = lines[0]!.split(delim).map((h) => h.trim().replace(/^"|"$/g, ""));
    jsonData = lines.slice(1).map((line) => {
      const vals = line.split(delim).map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, unknown> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]!] = vals[j] ?? null;
      }
      return row;
    });
  } else {
    throw new Error("Formato não suportado para o Relatório Apollo. Use XLSX ou CSV.");
  }

  if (jsonData.length === 0) return [];

  const headers = Object.keys(jsonData[0]!);
  function findCol(candidates: string[]): string | undefined {
    for (const c of candidates) {
      const found = headers.find((h) => h.trim().toLowerCase() === c.toLowerCase());
      if (found) return found;
    }
    return undefined;
  }

  const nroNotaCol = findCol(["nro nota", "nronota", "nota", "número nota", "numero nota", "nf"]);
  const issRetidoCol = findCol(["iss retido", "issretido", "iss"]);
  const totNotaCol = findCol(["totnota", "tot nota", "total nota", "valor total", "total"]);

  const missing = [];
  if (!nroNotaCol) missing.push("Nro Nota");
  if (!issRetidoCol) missing.push("ISS Retido");
  if (!totNotaCol) missing.push("TotNota");

  if (missing.length > 0) {
    throw new Error(
      `Colunas não encontradas no Relatório Apollo: ${missing.join(", ")}. ` +
      `Verifique o arquivo.`,
    );
  }

  const notas: NotaApollo[] = [];

  for (const row of jsonData) {
    const nroNota = String(row[nroNotaCol!] ?? "").trim().replace(/\.0$/, "");
    if (!nroNota || nroNota === "null") continue;

    notas.push({
      nroNota,
      issRetido: isNaN(toFloat(row[issRetidoCol!])) ? 0 : toFloat(row[issRetidoCol!]),
      totNota: isNaN(toFloat(row[totNotaCol!])) ? 0 : toFloat(row[totNotaCol!]),
    });
  }

  return notas;
}