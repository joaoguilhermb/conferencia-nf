import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Metadados de operações de atualização (busca no portal, reconciliação Apollo).
 * Usado para exibir "Última atualização: ..." no frontend.
 */
export const metaAtualizacaoTable = pgTable("meta_atualizacao", {
  id: serial("id").primaryKey(),
  tipo: varchar("tipo", { length: 30 }).notNull(), // "busca_portal" | "reconciliacao_apollo"
  competencia: varchar("competencia", { length: 20 }),
  totalNotas: integer("total_notas"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MetaAtualizacao = typeof metaAtualizacaoTable.$inferSelect;
