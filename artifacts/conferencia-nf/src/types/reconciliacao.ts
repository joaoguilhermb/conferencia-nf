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