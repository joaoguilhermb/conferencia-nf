import type { NotaFiscalRaw } from "./reconciliacao.js";

// Map of known column aliases to normalized field names
const ALIAS_MAP: Record<string, keyof NotaFiscalRaw> = {
  // numeroNota
  "número da nota fiscal": "numeroNota",
  "numero da nota fiscal": "numeroNota",
  "nr nota": "numeroNota",
  "num nota": "numeroNota",
  "nf": "numeroNota",
  "nota": "numeroNota",
  "número nf": "numeroNota",
  "numero nf": "numeroNota",
  "nf nro": "numeroNota",
  "nro nf": "numeroNota",
  "nota fiscal": "numeroNota",
  "número": "numeroNota",
  "numero": "numeroNota",
  // dataEmissao
  "data de emissão": "dataEmissao",
  "data de emissao": "dataEmissao",
  "data emissão": "dataEmissao",
  "data emissao": "dataEmissao",
  "data": "dataEmissao",
  "emissão": "dataEmissao",
  "emissao": "dataEmissao",
  // razaoSocial
  "razão social": "razaoSocial",
  "razao social": "razaoSocial",
  "razão": "razaoSocial",
  "razao": "razaoSocial",
  "nome": "razaoSocial",
  "prestador": "razaoSocial",
  "empresa": "razaoSocial",
  "fornecedor": "razaoSocial",
  "tomador": "razaoSocial",
  // cnpj
  "cnpj": "cnpj",
  "cpf/cnpj": "cnpj",
  "cpf cnpj": "cnpj",
  "cnpj/cpf": "cnpj",
  "documento": "cnpj",
  "doc": "cnpj",
  // valorBruto
  "valor bruto": "valorBruto",
  "vl bruto": "valorBruto",
  "bruto": "valorBruto",
  "valor gross": "valorBruto",
  "valor total": "valorBruto",
  "total": "valorBruto",
  "vl total": "valorBruto",
  // valorLiquido
  "valor líquido": "valorLiquido",
  "valor liquido": "valorLiquido",
  "vl líquido": "valorLiquido",
  "vl liquido": "valorLiquido",
  "líquido": "valorLiquido",
  "liquido": "valorLiquido",
  "valor net": "valorLiquido",
  "net": "valorLiquido",
  // valorISS
  "valor do iss": "valorISS",
  "valor iss": "valorISS",
  "iss": "valorISS",
  "vl iss": "valorISS",
  "imposto": "valorISS",
  "iss devido": "valorISS",
  // cidade
  "cidade": "cidade",
  "município": "cidade",
  "municipio": "cidade",
  "city": "cidade",
};

function detectarCampo(coluna: string): keyof NotaFiscalRaw | null {
  const normalizado = coluna.trim().toLowerCase();
  return ALIAS_MAP[normalizado] ?? null;
}

function parseNumero(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === "") return 0;
  const str = String(val)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function mapearLinhas(
  headers: string[],
  rows: Record<string, string | number | null>[],
): NotaFiscalRaw[] {
  // Build field mapping: header index → field name
  const fieldMap = new Map<string, keyof NotaFiscalRaw>();
  for (const h of headers) {
    const campo = detectarCampo(h);
    if (campo) fieldMap.set(h, campo);
  }

  const notas: NotaFiscalRaw[] = [];

  for (const row of rows) {
    const nota: Partial<NotaFiscalRaw> = {};
    for (const [header, field] of fieldMap) {
      const val = row[header];
      if (field === "valorBruto" || field === "valorLiquido" || field === "valorISS") {
        (nota as Record<string, unknown>)[field] = parseNumero(val as string | number);
      } else {
        (nota as Record<string, unknown>)[field] = val !== null && val !== undefined ? String(val).trim() : "";
      }
    }

    // Only include rows that have at least a nota number
    if (nota.numeroNota && String(nota.numeroNota).trim() !== "") {
      notas.push({
        numeroNota: nota.numeroNota ?? "",
        dataEmissao: nota.dataEmissao ?? "",
        razaoSocial: nota.razaoSocial ?? "",
        cnpj: nota.cnpj ?? "",
        valorBruto: nota.valorBruto ?? 0,
        valorLiquido: nota.valorLiquido ?? 0,
        valorISS: nota.valorISS ?? 0,
        cidade: nota.cidade,
      });
    }
  }

  return notas;
}

export async function parseXLSX(buffer: Buffer): Promise<NotaFiscalRaw[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Nenhuma planilha encontrada no arquivo.");

  const sheet = workbook.Sheets[sheetName]!;
  const jsonData = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(sheet, {
    raw: false,
    defval: null,
  });

  if (jsonData.length === 0) return [];

  const headers = Object.keys(jsonData[0]!);
  return mapearLinhas(headers, jsonData);
}

export async function parseCSV(buffer: Buffer): Promise<NotaFiscalRaw[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    let headers: string[] = [];

    const csv = buffer.toString("utf-8");
    const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");

    if (lines.length === 0) {
      resolve([]);
      return;
    }

    // Detect delimiter: comma or semicolon
    const firstLine = lines[0]!;
    const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

    headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      const values = line.split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]!] = values[j] ?? "";
      }
      rows.push(row);
    }

    try {
      resolve(mapearLinhas(headers, rows as Record<string, string | number | null>[]));
    } catch (e) {
      reject(e);
    }
  });
}

export async function parsePDF(buffer: Buffer): Promise<NotaFiscalRaw[]> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    const text = data.text;

    // Basic text parsing: look for table-like rows
    // Each line with enough columns may represent an invoice
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    // Try to detect header line
    let headerLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i]!.toLowerCase();
      if (
        lower.includes("nota") ||
        lower.includes("nf") ||
        (lower.includes("cnpj") && lower.includes("valor"))
      ) {
        headerLineIdx = i;
        break;
      }
    }

    if (headerLineIdx === -1) {
      // Cannot parse PDF structure — return empty with informative error
      throw new Error(
        "Não foi possível identificar a estrutura da tabela no PDF. " +
        "Por favor, converta o arquivo para XLSX ou CSV para melhor processamento.",
      );
    }

    const headerLine = lines[headerLineIdx]!;
    const headers = headerLine.split(/\s{2,}|\t/).map((h) => h.trim()).filter((h) => h);

    const notas: NotaFiscalRaw[] = [];

    for (let i = headerLineIdx + 1; i < lines.length; i++) {
      const line = lines[i]!;
      const values = line.split(/\s{2,}|\t/).map((v) => v.trim()).filter((v) => v);
      if (values.length < 3) continue;

      const row: Record<string, string | number | null> = {};
      for (let j = 0; j < headers.length && j < values.length; j++) {
        row[headers[j]!] = values[j] ?? null;
      }

      const mapped = mapearLinhas(headers, [row]);
      notas.push(...mapped);
    }

    return notas;
  } catch (err) {
    if ((err as Error).message?.includes("identificar")) throw err;
    throw new Error(
      "Erro ao processar o arquivo PDF. Por favor, converta para XLSX ou CSV.",
    );
  }
}

export async function parseArquivo(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
): Promise<NotaFiscalRaw[]> {
  const ext = originalname.split(".").pop()?.toLowerCase() ?? "";

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return parseXLSX(buffer);
  }

  if (mimetype === "text/csv" || ext === "csv") {
    return parseCSV(buffer);
  }

  if (mimetype === "application/pdf" || ext === "pdf") {
    return parsePDF(buffer);
  }

  throw new Error(
    `Formato não suportado: ${ext || mimetype}. Use XLSX, CSV ou PDF.`,
  );
}
