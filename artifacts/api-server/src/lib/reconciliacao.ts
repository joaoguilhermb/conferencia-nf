export interface NotaLivroFiscal {
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  status: string;
  issRetido: "Sim" | "Não";
  valorBase: number;
  valorISS: number;
}

export interface NotaApollo {
  nroNota: string;
  issRetido: number;
  totNota: number;
}

export interface NotaFaltante {
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  status: string;
  valorBase: number;
  valorISS: number;
}

export interface NotaDivergente {
  numeroNota: string;
  cnpj: string;
  valorBaseLF: number;
  valorBaseApollo: number;
  difBase: number;
  valorISSLF: number;
  valorISSApollo: number;
  difISS: number;
}

export interface ResumoReconciliacao {
  totalLivroFiscal: number;
  totalFaltantes: number;
  totalDivergencias: number;
}

export interface ResultadoReconciliacao {
  resumo: ResumoReconciliacao;
  faltantes: NotaFaltante[];
  divergencias: NotaDivergente[];
}

function normalizarNota(nota: string): string {
  return String(nota ?? "").trim().replace(/^0+/, "") || "0";
}

export function reconciliar(
  livroFiscal: NotaLivroFiscal[],
  apollo: NotaApollo[],
): ResultadoReconciliacao {
  const apolloByNota = new Map<string, NotaApollo>();
  for (const nota of apollo) {
    apolloByNota.set(normalizarNota(nota.nroNota), nota);
  }

  const faltantes: NotaFaltante[] = [];
  const divergencias: NotaDivergente[] = [];

  for (const lfNota of livroFiscal) {
    const key = normalizarNota(lfNota.numeroNota);
    const apolloNota = apolloByNota.get(key);

    if (!apolloNota) {
      faltantes.push({
        numeroNota: lfNota.numeroNota,
        dataEmissao: lfNota.dataEmissao,
        cnpj: lfNota.cnpj,
        status: lfNota.status,
        valorBase: lfNota.valorBase,
        valorISS: lfNota.valorISS,
      });
    } else {
      const difBase = Math.abs(lfNota.valorBase - apolloNota.totNota);
      const difISS = Math.abs(lfNota.valorISS - apolloNota.issRetido);

      if (difBase > 0.05 || difISS > 0.05) {
        divergencias.push({
          numeroNota: lfNota.numeroNota,
          cnpj: lfNota.cnpj,
          valorBaseLF: lfNota.valorBase,
          valorBaseApollo: apolloNota.totNota,
          difBase: Math.round(difBase * 100) / 100,
          valorISSLF: lfNota.valorISS,
          valorISSApollo: apolloNota.issRetido,
          difISS: Math.round(difISS * 100) / 100,
        });
      }
    }
  }

  return {
    resumo: {
      totalLivroFiscal: livroFiscal.length,
      totalFaltantes: faltantes.length,
      totalDivergencias: divergencias.length,
    },
    faltantes,
    divergencias,
  };
}