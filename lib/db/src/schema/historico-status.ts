import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { notasFiscaisTable } from "./notas-fiscais";

/**
 * Histórico de mudanças de status de conciliação.
 * Usado para debug/auditoria — registra cada transição de status.
 */
export const historicoStatusTable = pgTable(
  "historico_status",
  {
    id: serial("id").primaryKey(),
    notaId: integer("nota_id")
      .notNull()
      .references(() => notasFiscaisTable.id, { onDelete: "cascade" }),
    statusAnterior: varchar("status_anterior", { length: 20 }),
    statusNovo: varchar("status_novo", { length: 20 }).notNull(),
    motivo: varchar("motivo", { length: 100 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_historico_nota").on(table.notaId),
  ],
);

export type HistoricoStatus = typeof historicoStatusTable.$inferSelect;
