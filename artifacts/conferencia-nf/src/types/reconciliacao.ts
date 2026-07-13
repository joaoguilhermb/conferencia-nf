export interface NotaFaltante {
  id?: number;
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  razaoSocial?: string;
  status: string;
  issRetido?: string;
  valorBase: number;
  valorISS: number;
}

export interface NotaDivergente {
  id?: number;
  numeroNota: string;
  cnpj: string;
  razaoSocial?: string;
  valorBaseLF: number;
  valorBaseApollo: number;
  difBase: number;
  valorISSLF: number;
  valorISSApollo: number;
  difISS: number;
}

export interface NotaValidada {
  id?: number;
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  razaoSocial?: string;
  status: string;
  issRetido?: string;
  valorBase: number;
  valorISS: number;
}

export interface NotaCancelada {
  id?: number;
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  razaoSocial?: string;
  status?: string;
  valorBase: number;
  valorISS: number;
}

export interface NotaOutroMunicipio {
  id?: number;
  numeroNota: string;
  dataEmissao: string;
  cnpj: string;
  razaoSocial: string;
  municipio: string;
  valorServico: number;
  chaveAcesso: string;
}

export interface ResumoReconciliacao {
  totalNotas: number;
  totalValidadas: number;
  totalFaltantes: number;
  totalDivergencias: number;
  totalCanceladas: number;
  totalOutrosMunicipios: number;
  valorTotalValidadas: number;
  valorTotalFaltantes: number;
  valorTotalCanceladas: number;
  valorTotalOutrosMunicipios: number;
}

export interface ResultadoReconciliacao {
  resumo: ResumoReconciliacao;
  faltantes: NotaFaltante[];
  divergencias: NotaDivergente[];
  validadas: NotaValidada[];
  canceladas: NotaCancelada[];
  outrosMunicipios: NotaOutroMunicipio[];
  ultimaAtualizacao?: string | null;
}