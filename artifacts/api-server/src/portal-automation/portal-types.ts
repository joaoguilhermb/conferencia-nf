/**
 * Types for the Ágilis Blue portal API responses.
 * Based on HAR capture of the real portal responses.
 */
export interface NotaPortal {
  Id: number;
  TipoNota: string;
  DataEmissao: string; // ISO 8601 datetime string
  NumeroNota: number;
  CNJPrestadorTomador: string; // only digits, 14 chars
  CPFCNPJPrestadorTomador: string; // formatted
  NomePrestador: string;
  Situacao: string; // "Emitido" | "Cancelado" | "Deferido" | others
  MunicipioIncidencia: string; // e.g. "RONDONÓPOLIS/MT"
  ValorServico: number;
  ValorBaseCalculo: number;
  Retido: string; // "Sim" | "Não"
  ValorDoImposto: number;
  ChaveAcesso: string; // 49-char unique key
}

export interface GridResult {
  data: NotaPortal[];
  total: number;
}

export type Competencia = "mesAtual" | "mesAnterior";

/** Municipality normalization helper. Used to compare against RONDONÓPOLIS/MT */
export function normalizarMunicipio(municipio: string): string {
  return municipio
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export const MUNICIPIO_LOCAL_NORMALIZADO = "RONDONOPOLIS/MT";

export function isRondonopolis(municipio: string): boolean {
  return normalizarMunicipio(municipio) === MUNICIPIO_LOCAL_NORMALIZADO;
}

/**
 * Normalize Situacao from the portal:
 * - "Emitido" → "Emitido"
 * - "Cancelado" → "Cancelado"
 * - "Deferido"  → "Emitido"  (business rule: treat as Emitido)
 * - others      → null       (ignore / do not insert)
 */
export function normalizarSituacao(situacao: string): "Emitido" | "Cancelado" | null {
  const s = situacao.trim().toLowerCase();
  if (s === "emitido") return "Emitido";
  if (s === "cancelado") return "Cancelado";
  if (s === "deferido") return "Emitido";
  return null; // ignore unknown statuses
}
