import {
  pgTable,
  serial,
  integer,
  varchar,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";


/**
 * Status de conciliação possíveis para uma nota fiscal.
 * - Faltante: nota do portal sem correspondência no Apollo
 * - Validada: nota do portal encontrada no Apollo sem divergência
 * - Divergente: nota do portal encontrada no Apollo com divergência de valor
 * - Cancelada: nota cancelada pela Prefeitura (prioridade máxima)
 * - OutroMunicipio: nota de município diferente de Rondonópolis (não reconciliada)
 */
export const STATUS_CONCILIACAO = [
  "Faltante",
  "Validada",
  "Divergente",
  "Cancelada",
  "OutroMunicipio",
] as const;

export type StatusConciliacao = (typeof STATUS_CONCILIACAO)[number];

export const notasFiscaisTable = pgTable(
  "notas_fiscais",
  {
    id: serial("id").primaryKey(),

    // Dados do portal Ágilis Blue
    idPortal: integer("id_portal").notNull().unique(),
    chaveAcesso: varchar("chave_acesso", { length: 60 }).notNull().unique(),
    numeroNota: integer("numero_nota").notNull(),
    tipoNota: varchar("tipo_nota", { length: 20 }).notNull(),
    dataEmissao: timestamp("data_emissao").notNull(),
    cnpjPrestadorTomador: varchar("cnpj_prestador_tomador", { length: 20 }).notNull(),
    cpfCnpjFormatado: varchar("cpf_cnpj_formatado", { length: 25 }).notNull(),
    nomePrestador: varchar("nome_prestador", { length: 255 }).notNull(),
    situacaoPortal: varchar("situacao_portal", { length: 30 }).notNull(),
    municipioIncidencia: varchar("municipio_incidencia", { length: 100 }).notNull(),
    valorServico: numeric("valor_servico", { precision: 15, scale: 2 }).notNull(),
    valorBaseCalculo: numeric("valor_base_calculo", { precision: 15, scale: 2 }).notNull(),
    retido: varchar("retido", { length: 5 }).notNull(),
    valorImposto: numeric("valor_imposto", { precision: 15, scale: 2 }).notNull(),

    // Status calculado pela lógica de conciliação
    statusConciliacao: varchar("status_conciliacao", { length: 20 })
      .notNull()
      .default("Faltante"),

    // Valores do Apollo (preenchidos após reconciliação)
    valorApolloBase: numeric("valor_apollo_base", { precision: 15, scale: 2 }),
    valorApolloIss: numeric("valor_apollo_iss", { precision: 15, scale: 2 }),

    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_notas_numero_cnpj").on(table.numeroNota, table.cnpjPrestadorTomador),
    index("idx_notas_status").on(table.statusConciliacao),
    index("idx_notas_municipio").on(table.municipioIncidencia),
  ],
);

export type NotaFiscal = typeof notasFiscaisTable.$inferSelect;

export interface InsertNotaFiscal {
  idPortal: number;
  chaveAcesso: string;
  numeroNota: number;
  tipoNota: string;
  dataEmissao: Date;
  cnpjPrestadorTomador: string;
  cpfCnpjFormatado: string;
  nomePrestador: string;
  situacaoPortal: string;
  municipioIncidencia: string;
  valorServico: string;
  valorBaseCalculo: string;
  retido: string;
  valorImposto: string;
  statusConciliacao?: string;
  valorApolloBase?: string | null;
  valorApolloIss?: string | null;
}

