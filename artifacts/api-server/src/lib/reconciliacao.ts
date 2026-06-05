export interface NotaFiscalRaw {
  numeroNota: string;
  dataEmissao: string;
  razaoSocial: string;
  cnpj: string;
  valorBruto: number;
  valorLiquido: number;
  valorISS: number;
  cidade?: string;
}

export interface CampoDivergente {
  campo: string;
  valorLivroFiscal: string;
  valorApollo: string;
}

export interface NotaConciliada {
  numeroNota: string;
  dataEmissao: string;
  razaoSocial: string;
  cnpj: string;
  valorBruto: number;
  valorLiquido: number;
  valorISS: number;
  status: string;
}

export interface NotaNaoLocalizada {
  numeroNota: string;
  dataEmissao: string;
  razaoSocial: string;
  cnpj: string;
  valorBruto: number;
  valorLiquido: number;
  valorISS: number;
}

export interface NotaDivergente {
  numeroNota: string;
  razaoSocial: string;
  cnpj: string;
  camposDivergentes: CampoDivergente[];
  observacao: string;
  acaoRecomendada: string;
}

export interface PossivelErroLancamento {
  notaLivroFiscal: string;
  notaApollo: string;
  razaoSocial: string;
  cnpj: string;
  percentualConfianca: number;
  observacao: string;
  acaoRecomendada: string;
}

export interface ResumoReconciliacao {
  totalLivroFiscal: number;
  totalConciliadas: number;
  totalNaoLocalizadas: number;
  totalDivergentes: number;
  totalPosiveisErros: number;
}

export interface ResultadoReconciliacao {
  resumo: ResumoReconciliacao;
  conciliadas: NotaConciliada[];
  naoLocalizadas: NotaNaoLocalizada[];
  divergentes: NotaDivergente[];
  posiveisErros: PossivelErroLancamento[];
}

// Normalize CNPJ: remove all non-digits
function normalizarCNPJ(cnpj: string): string {
  return String(cnpj).replace(/\D/g, "");
}

// Normalize monetary value to a number rounded to 2 decimal places
function normalizarValor(valor: number | string | undefined | null): number {
  if (valor === undefined || valor === null || valor === "") return 0;
  const str = String(valor)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

// Normalize date to ISO format YYYY-MM-DD
function normalizarData(data: string | undefined | null): string {
  if (!data) return "";
  const str = String(data).trim();

  // Try common Brazilian format dd/MM/yyyy or dd-MM-yyyy
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (brMatch) {
    const day = brMatch[1]!.padStart(2, "0");
    const month = brMatch[2]!.padStart(2, "0");
    let year = brMatch[3]!;
    if (year.length === 2) year = "20" + year;
    return `${year}-${month}-${day}`;
  }

  // ISO format yyyy-MM-dd
  const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]!.padStart(2, "0")}-${isoMatch[3]!.padStart(2, "0")}`;
  }

  // Excel serial date number
  const serial = parseFloat(str);
  if (!isNaN(serial) && serial > 1000) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + serial * 86400000);
    return d.toISOString().split("T")[0]!;
  }

  return str;
}

// Normalize text: trim, lowercase, collapse spaces
function normalizarTexto(texto: string | undefined | null): string {
  if (!texto) return "";
  return String(texto).trim().toLowerCase().replace(/\s+/g, " ");
}

// Normalize invoice number: remove leading zeros, trim
function normalizarNota(nota: string | undefined | null): string {
  if (!nota) return "";
  return String(nota).trim().replace(/^0+/, "") || "0";
}

// Levenshtein distance for string similarity
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

function similaridadeTexto(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

function similaridadeNota(a: string, b: string): number {
  const na = normalizarNota(a);
  const nb = normalizarNota(b);
  if (na === nb) return 1;
  return similaridadeTexto(na, nb);
}

function calcularConfianca(lf: NotaFiscalRaw, apollo: NotaFiscalRaw): number {
  const cnpjScore =
    normalizarCNPJ(lf.cnpj) === normalizarCNPJ(apollo.cnpj) ? 1 : 0;
  const razaoScore = similaridadeTexto(lf.razaoSocial, apollo.razaoSocial);
  const brutoScore =
    Math.abs(lf.valorBruto - apollo.valorBruto) < 0.01 ? 1 : 0;
  const liquidoScore =
    Math.abs(lf.valorLiquido - apollo.valorLiquido) < 0.01 ? 1 : 0;
  const issScore =
    Math.abs(lf.valorISS - apollo.valorISS) < 0.01 ? 1 : 0;
  const dataScore =
    normalizarData(lf.dataEmissao) === normalizarData(apollo.dataEmissao)
      ? 1
      : 0;
  const notaScore = similaridadeNota(lf.numeroNota, apollo.numeroNota);

  const pesos = [
    cnpjScore * 25,
    razaoScore * 15,
    brutoScore * 20,
    liquidoScore * 15,
    issScore * 15,
    dataScore * 5,
    notaScore * 5,
  ];
  return Math.round(pesos.reduce((a, b) => a + b, 0));
}

function descreverDivergencia(campo: string): { observacao: string; acaoRecomendada: string } {
  const mapa: Record<string, { observacao: string; acaoRecomendada: string }> = {
    dataEmissao: {
      observacao: "Data de emissão divergente entre o Livro Fiscal e o Apollo.",
      acaoRecomendada: "Verificar o lançamento e corrigir a data de emissão no Apollo.",
    },
    razaoSocial: {
      observacao: "Razão Social divergente entre o Livro Fiscal e o Apollo.",
      acaoRecomendada: "Verificar o prestador de serviço e corrigir a Razão Social no Apollo.",
    },
    cnpj: {
      observacao: "CNPJ divergente entre o Livro Fiscal e o Apollo.",
      acaoRecomendada: "Verificar o CNPJ do prestador e corrigir o lançamento no Apollo.",
    },
    valorBruto: {
      observacao: "Valor Bruto divergente entre o Livro Fiscal e o Apollo.",
      acaoRecomendada: "Verificar o lançamento e corrigir o Valor Bruto no Apollo.",
    },
    valorLiquido: {
      observacao: "Valor Líquido divergente entre o Livro Fiscal e o Apollo.",
      acaoRecomendada: "Verificar o lançamento e corrigir o Valor Líquido no Apollo.",
    },
    valorISS: {
      observacao: "Valor do ISS divergente entre o Livro Fiscal e o Apollo.",
      acaoRecomendada: "Verificar o lançamento e corrigir o Valor do ISS no Apollo.",
    },
  };
  return (
    mapa[campo] ?? {
      observacao: `Campo "${campo}" divergente entre o Livro Fiscal e o Apollo.`,
      acaoRecomendada: `Verificar o lançamento e corrigir o campo "${campo}" no Apollo.`,
    }
  );
}

export function reconciliar(
  livroFiscal: NotaFiscalRaw[],
  apollo: NotaFiscalRaw[],
): ResultadoReconciliacao {
  const conciliadas: NotaConciliada[] = [];
  const naoLocalizadas: NotaNaoLocalizada[] = [];
  const divergentes: NotaDivergente[] = [];
  const posiveisErros: PossivelErroLancamento[] = [];

  // Build Apollo lookup by normalized invoice number
  const apolloByNota = new Map<string, NotaFiscalRaw[]>();
  for (const nota of apollo) {
    const key = normalizarNota(nota.numeroNota);
    if (!apolloByNota.has(key)) apolloByNota.set(key, []);
    apolloByNota.get(key)!.push(nota);
  }

  // Build Apollo lookup by normalized CNPJ for smart matching
  const apolloByCNPJ = new Map<string, NotaFiscalRaw[]>();
  for (const nota of apollo) {
    const key = normalizarCNPJ(nota.cnpj);
    if (!apolloByCNPJ.has(key)) apolloByCNPJ.set(key, []);
    apolloByCNPJ.get(key)!.push(nota);
  }

  for (const lfNota of livroFiscal) {
    const notaKey = normalizarNota(lfNota.numeroNota);
    const apolloMatches = apolloByNota.get(notaKey);

    if (apolloMatches && apolloMatches.length > 0) {
      // Found exact invoice number match — check field-by-field
      const apolloNota = apolloMatches[0]!;
      const campos: CampoDivergente[] = [];

      const comparacoes: Array<{
        campo: string;
        lf: string;
        ap: string;
        match: boolean;
      }> = [
        {
          campo: "dataEmissao",
          lf: normalizarData(lfNota.dataEmissao),
          ap: normalizarData(apolloNota.dataEmissao),
          match:
            normalizarData(lfNota.dataEmissao) ===
            normalizarData(apolloNota.dataEmissao),
        },
        {
          campo: "razaoSocial",
          lf: lfNota.razaoSocial,
          ap: apolloNota.razaoSocial,
          match:
            normalizarTexto(lfNota.razaoSocial) ===
            normalizarTexto(apolloNota.razaoSocial),
        },
        {
          campo: "cnpj",
          lf: lfNota.cnpj,
          ap: apolloNota.cnpj,
          match:
            normalizarCNPJ(lfNota.cnpj) === normalizarCNPJ(apolloNota.cnpj),
        },
        {
          campo: "valorBruto",
          lf: String(normalizarValor(lfNota.valorBruto)),
          ap: String(normalizarValor(apolloNota.valorBruto)),
          match:
            Math.abs(
              normalizarValor(lfNota.valorBruto) -
                normalizarValor(apolloNota.valorBruto),
            ) < 0.01,
        },
        {
          campo: "valorLiquido",
          lf: String(normalizarValor(lfNota.valorLiquido)),
          ap: String(normalizarValor(apolloNota.valorLiquido)),
          match:
            Math.abs(
              normalizarValor(lfNota.valorLiquido) -
                normalizarValor(apolloNota.valorLiquido),
            ) < 0.01,
        },
        {
          campo: "valorISS",
          lf: String(normalizarValor(lfNota.valorISS)),
          ap: String(normalizarValor(apolloNota.valorISS)),
          match:
            Math.abs(
              normalizarValor(lfNota.valorISS) -
                normalizarValor(apolloNota.valorISS),
            ) < 0.01,
        },
      ];

      for (const comp of comparacoes) {
        if (!comp.match) {
          campos.push({
            campo: comp.campo,
            valorLivroFiscal: comp.lf,
            valorApollo: comp.ap,
          });
        }
      }

      if (campos.length === 0) {
        // Fully reconciled
        conciliadas.push({
          numeroNota: lfNota.numeroNota,
          dataEmissao: normalizarData(lfNota.dataEmissao),
          razaoSocial: lfNota.razaoSocial,
          cnpj: lfNota.cnpj,
          valorBruto: normalizarValor(lfNota.valorBruto),
          valorLiquido: normalizarValor(lfNota.valorLiquido),
          valorISS: normalizarValor(lfNota.valorISS),
          status: "Conciliada",
        });
      } else {
        // Divergent — build combined observacao and acaoRecomendada
        const descricoes = campos.map((c) => descreverDivergencia(c.campo));
        const campoNomes: Record<string, string> = {
          dataEmissao: "Data de Emissão",
          razaoSocial: "Razão Social",
          cnpj: "CNPJ",
          valorBruto: "Valor Bruto",
          valorLiquido: "Valor Líquido",
          valorISS: "Valor do ISS",
        };
        const camposFormatados = campos.map((c) => ({
          campo: campoNomes[c.campo] ?? c.campo,
          valorLivroFiscal: c.valorLivroFiscal,
          valorApollo: c.valorApollo,
        }));

        const nomesCampos = camposFormatados.map((c) => c.campo).join(", ");
        divergentes.push({
          numeroNota: lfNota.numeroNota,
          razaoSocial: lfNota.razaoSocial,
          cnpj: lfNota.cnpj,
          camposDivergentes: camposFormatados,
          observacao: `Divergência encontrada nos campos: ${nomesCampos}.`,
          acaoRecomendada: `Verificar o lançamento no Apollo e corrigir os campos divergentes: ${nomesCampos}.`,
        });
      }
    } else {
      // Invoice number not found — try smart matching
      const cnpjKey = normalizarCNPJ(lfNota.cnpj);
      const candidatos = apolloByCNPJ.get(cnpjKey) ?? [];

      // Score all candidates
      const scored = candidatos
        .map((c) => ({ nota: c, score: calcularConfianca(lfNota, c) }))
        .filter((s) => s.score >= 60)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const best = scored[0]!;
        const notaApolloNum = normalizarNota(best.nota.numeroNota);
        const notaLFNum = normalizarNota(lfNota.numeroNota);

        // Detect type of error
        let observacao =
          "Possível lançamento realizado com numeração incorreta.";
        if (
          notaLFNum.includes(notaApolloNum) ||
          notaApolloNum.includes(notaLFNum)
        ) {
          observacao = "Possível lançamento com número incorreto (dígitos faltando ou a mais).";
        } else if (notaLFNum.split("").sort().join("") === notaApolloNum.split("").sort().join("")) {
          observacao = "Possível lançamento com dígitos invertidos no número da nota.";
        }

        posiveisErros.push({
          notaLivroFiscal: lfNota.numeroNota,
          notaApollo: best.nota.numeroNota,
          razaoSocial: lfNota.razaoSocial,
          cnpj: lfNota.cnpj,
          percentualConfianca: best.score,
          observacao,
          acaoRecomendada:
            "Verificar o lançamento, excluir o registro incorreto e lançar novamente a nota com a numeração correta.",
        });
      } else {
        // Not found at all
        naoLocalizadas.push({
          numeroNota: lfNota.numeroNota,
          dataEmissao: normalizarData(lfNota.dataEmissao),
          razaoSocial: lfNota.razaoSocial,
          cnpj: lfNota.cnpj,
          valorBruto: normalizarValor(lfNota.valorBruto),
          valorLiquido: normalizarValor(lfNota.valorLiquido),
          valorISS: normalizarValor(lfNota.valorISS),
        });
      }
    }
  }

  return {
    resumo: {
      totalLivroFiscal: livroFiscal.length,
      totalConciliadas: conciliadas.length,
      totalNaoLocalizadas: naoLocalizadas.length,
      totalDivergentes: divergentes.length,
      totalPosiveisErros: posiveisErros.length,
    },
    conciliadas,
    naoLocalizadas,
    divergentes,
    posiveisErros,
  };
}
