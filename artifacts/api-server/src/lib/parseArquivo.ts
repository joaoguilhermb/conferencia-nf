import type { NotaLivroFiscal, NotaApollo } from "./reconciliacao.js";

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const STATUS_TERMS = ["emitido", "cancelado", "deferido", "substituído", "substituido"];

function toFloat(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  const s = String(v)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(s);
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

interface ColScore {
  colIndex: number;
  scores: Partial<Record<LFField, number>>;
}

function detectColumns(
  rows: unknown[][],
): Map<LFField, number> {
  if (rows.length === 0) throw new Error("Arquivo vazio.");

  const numCols = Math.max(...rows.map((r) => r.length));
  const colScores: ColScore[] = Array.from({ length: numCols }, (_, i) => ({
    colIndex: i,
    scores: {},
  }));

  for (let ci = 0; ci < numCols; ci++) {
    const vals = rows.map((r) => r[ci]).filter((v) => v !== null && v !== undefined && v !== "");
    const n = vals.length;
    if (n === 0) continue;

    // --- Número da NFS-e ---
    // Integer numeric, values 1–999999, high unique count
    const intVals = vals.map((v) => {
      const num = parseFloat(String(v));
      return Number.isInteger(num) && num >= 1 && num <= 999999 ? num : NaN;
    });
    const intRate = intVals.filter((v) => !isNaN(v)).length / n;
    const uniqueCount = new Set(intVals.filter((v) => !isNaN(v))).size;
    if (intRate > 0.85 && uniqueCount > 1) {
      colScores[ci]!.scores.numeroNota = intRate * (uniqueCount / n);
    }

    // --- Data de emissão ---
    const dateRate = vals.filter((v) => isDateLike(v)).length / n;
    if (dateRate > 0.8) {
      colScores[ci]!.scores.dataEmissao = dateRate;
    }

    // --- Prestador/CNPJ ---
    const cnpjRate = vals.filter((v) => CNPJ_RE.test(String(v))).length / n;
    if (cnpjRate > 0.5) {
      colScores[ci]!.scores.cnpj = cnpjRate;
    }

    // --- Status ---
    const textVals = vals.map((v) => String(v).trim().toLowerCase());
    const uniqueTextVals = new Set(textVals);
    const hasStatusTerm = [...uniqueTextVals].some((t) =>
      STATUS_TERMS.some((s) => t.includes(s)),
    );
    if (hasStatusTerm && uniqueTextVals.size < 10) {
      colScores[ci]!.scores.status = 1 - uniqueTextVals.size / 10;
    }

    // --- ISS Retido (Sim/Não) ---
    const issRetidoVals = new Set(textVals);
    issRetidoVals.delete("");
    const isSimNao =
      [...issRetidoVals].every((v) => v === "sim" || v === "não" || v === "nao") &&
      issRetidoVals.size <= 2 &&
      issRetidoVals.size >= 1;
    if (isSimNao) {
      colScores[ci]!.scores.issRetido = 1;
    }

    // --- Numeric decimal columns (valorISS, valorBase) ---
    const floatVals = vals.map((v) => toFloat(v)).filter((v) => !isNaN(v) && v >= 0);
    const floatRate = floatVals.length / n;
    if (floatRate > 0.85 && floatVals.length > 0) {
      const avg = floatVals.reduce((a, b) => a + b, 0) / floatVals.length;
      // Mark as potential value column with its average for later ordering
      if (avg > 0) {
        colScores[ci]!.scores.valorBase = avg; // will be resolved after all cols scored
        colScores[ci]!.scores.valorISS = avg;
      }
    }
  }

  // --- Resolve best column per field ---
  const assigned = new Map<LFField, number>();
  const usedCols = new Set<number>();

  // Priority: deterministic fields first
  const deterministic: LFField[] = ["issRetido", "cnpj", "status", "dataEmissao", "numeroNota"];
  for (const field of deterministic) {
    let best = -1;
    let bestScore = 0;
    for (const cs of colScores) {
      const s = cs.scores[field] ?? 0;
      if (s > bestScore && !usedCols.has(cs.colIndex)) {
        bestScore = s;
        best = cs.colIndex;
      }
    }
    if (best >= 0 && bestScore > 0) {
      assigned.set(field, best);
      usedCols.add(best);
    }
  }

  // CORREÇÃO - usa posição relativa: valorISS é sempre o mais à direita
  // entre as colunas numéricas decimais, após o bloco de texto/status
  const floatCols = colScores
    .filter(cs => !usedCols.has(cs.colIndex) && (cs.scores.valorBase ?? 0) > 0)
    .sort((a, b) => a.colIndex - b.colIndex); // ordena por índice crescente

  if (floatCols.length >= 2) {
    // Mais à esquerda = valorBase, mais à direita = valorISS
    assigned.set("valorBase", floatCols[0]!.colIndex);
    usedCols.add(floatCols[0]!.colIndex);
    assigned.set("valorISS", floatCols[floatCols.length - 1]!.colIndex);
    usedCols.add(floatCols[floatCols.length - 1]!.colIndex);
  } else if (floatCols.length === 1) {
    assigned.set("valorBase", floatCols[0]!.colIndex);
  }

  // Validate required columns
  const required: LFField[] = ["numeroNota", "cnpj", "issRetido", "valorBase", "valorISS"];
  const missing = required.filter((f) => !assigned.has(f));
  if (missing.length > 0) {
    const fieldLabels: Record<LFField, string> = {
      numeroNota: "Número da NFS-e",
      dataEmissao: "Data de Emissão",
      cnpj: "Prestador (CNPJ)",
      status: "Status",
      issRetido: "ISS Retido (Sim/Não)",
      valorISS: "Valor do ISS",
      valorBase: "Valor Base",
    };
    throw new Error(
      `Não foi possível identificar as seguintes colunas no Livro Fiscal: ${missing.map((f) => fieldLabels[f]).join(", ")}. ` +
      `Verifique se o arquivo está correto.`,
    );
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

  // Try to skip header if first row looks like a header (non-numeric values in numeric column)
  // We detect columns first on all rows, then retry skipping first row if detection fails
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

    if (issRetido === null) continue; // skip non-data rows

    // Filter: keep only ISS Retido == "Sim"
    if (issRetido !== "Sim") continue;

    const status = sCol !== undefined ? String(row[sCol] ?? "").trim() : "";
    const valorISS = toFloat(row[viCol]);

    // Filter: exclude Cancelado with ISS == 0
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

  // Find columns by name (case-insensitive, trim)
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
  const cidadeCol = findCol(["cidade", "município", "municipio", "city"]);

  const missing = [];
  if (!nroNotaCol) missing.push("Nro Nota");
  if (!issRetidoCol) missing.push("ISS Retido");
  if (!totNotaCol) missing.push("TotNota");
  if (!cidadeCol) missing.push("Cidade");

  if (missing.length > 0) {
    throw new Error(
      `Colunas não encontradas no Relatório Apollo: ${missing.join(", ")}. ` +
      `Verifique o arquivo.`,
    );
  }

  const notas: NotaApollo[] = [];

  for (const row of jsonData) {
    const cidade = String(row[cidadeCol!] ?? "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (cidade !== "RONDONOPOLIS") continue;

    const nroNota = String(row[nroNotaCol!] ?? "").trim().replace(/\.0$/, "");
    if (!nroNota || nroNota === "null") continue;

    notas.push({
      nroNota,
      issRetido: isNaN(toFloat(row[issRetidoCol!])) ? 0 : toFloat(row[issRetidoCol!]),
      totNota: isNaN(toFloat(row[totNotaCol!])) ? 0 : toFloat(row[totNotaCol!]),
      cidade: String(row[cidadeCol!] ?? "").trim(),
    });
  }

  return notas;
}
