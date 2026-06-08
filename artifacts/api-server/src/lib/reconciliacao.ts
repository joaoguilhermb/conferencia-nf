export interface NotaLivroFiscal {
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  razaoSocial: string;
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
  razaoSocial: string;
  status: string;
  issRetido: "Sim" | "Não";
  valorBase: number;
  valorISS: number;
}

export interface NotaDivergente {
  numeroNota: string;
  cnpj: string;
  razaoSocial: string;
  valorBaseLF: number;
  valorBaseApollo: number;
  difBase: number;
  valorISSLF: number;
  valorISSApollo: number;
  difISS: number;
}

export interface NotaValidada {
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  razaoSocial: string;
  status: string;
  issRetido: "Sim" | "Não";
  valorBase: number;
  valorISS: number;
}

export interface NotaCancelada {
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  razaoSocial: string;
  valorBase: number;
  valorISS: number;
}

export interface ResumoReconciliacao {
  totalLivroFiscal: number;
  totalValidadas: number;
  totalFaltantes: number;
  totalDivergencias: number;
  totalCanceladas: number;
}

export interface ResultadoReconciliacao {
  resumo: ResumoReconciliacao;
  faltantes: NotaFaltante[];
  divergencias: NotaDivergente[];
  validadas: NotaValidada[];
  canceladas: NotaCancelada[];
}

function normalizarNota(nota: string): string {
  return String(nota ?? "").trim().replace(/^0+/, "") || "0";
}

export function reconciliar(
  livroFiscal: NotaLivroFiscal[],
  apollo: NotaApollo[],
): ResultadoReconciliacao {
  // Separa emitidas e canceladas logo na entrada
  const emitidas = livroFiscal.filter((n) => n.status.toLowerCase() === "emitido");
  const canceladas = livroFiscal.filter((n) => n.status.toLowerCase() === "cancelado");

  const apolloByNota = new Map<string, NotaApollo>();
  for (const nota of apollo) {
    apolloByNota.set(normalizarNota(nota.nroNota), nota);
  }

  const faltantes: NotaFaltante[] = [];
  const divergencias: NotaDivergente[] = [];
  const validadas: NotaValidada[] = [];

  for (const lfNota of emitidas) {
    const key = normalizarNota(lfNota.numeroNota);
    const apolloNota = apolloByNota.get(key);

    if (!apolloNota) {
      faltantes.push({
        numeroNota: lfNota.numeroNota,
        dataEmissao: lfNota.dataEmissao,
        cnpj: lfNota.cnpj,
        razaoSocial: lfNota.razaoSocial,
        status: lfNota.status,
        issRetido: lfNota.issRetido,
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
          razaoSocial: lfNota.razaoSocial,
          valorBaseLF: lfNota.valorBase,
          valorBaseApollo: apolloNota.totNota,
          difBase: Math.round(difBase * 100) / 100,
          valorISSLF: lfNota.valorISS,
          valorISSApollo: apolloNota.issRetido,
          difISS: Math.round(difISS * 100) / 100,
        });
      } else {
        validadas.push({
          numeroNota: lfNota.numeroNota,
          dataEmissao: lfNota.dataEmissao,
          cnpj: lfNota.cnpj,
          razaoSocial: lfNota.razaoSocial,
          status: lfNota.status,
          issRetido: lfNota.issRetido,
          valorBase: lfNota.valorBase,
          valorISS: lfNota.valorISS,
        });
      }
    }
  }

  return {
    resumo: {
      totalLivroFiscal: emitidas.length,
      totalValidadas: validadas.length,
      totalFaltantes: faltantes.length,
      totalDivergencias: divergencias.length,
      totalCanceladas: canceladas.length,
    },
    faltantes,
    divergencias,
    validadas,
    canceladas: canceladas.map((n) => ({
      numeroNota: n.numeroNota,
      dataEmissao: n.dataEmissao,
      cnpj: n.cnpj,
      razaoSocial: n.razaoSocial,
      valorBase: n.valorBase,
      valorISS: n.valorISS,
    })),
  };
}