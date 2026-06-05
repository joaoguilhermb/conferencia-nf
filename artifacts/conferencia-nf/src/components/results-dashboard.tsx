import { useState, useMemo } from "react";
import type {
  ResultadoReconciliacao,
  NotaFaltante,
  NotaDivergente,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface ResultsDashboardProps {
  results: ResultadoReconciliacao;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatCnpj(cnpj: string) {
  if (!cnpj) return "";
  const cleaned = cnpj.replace(/\D/g, "");
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

function DiffBadge({ dif }: { dif: number }) {
  if (dif === 0) return null;
  return (
    <span className="ml-1 text-xs font-semibold text-red-600 dark:text-red-400">
      (Δ {formatCurrency(dif)})
    </span>
  );
}

export function ResultsDashboard({ results }: ResultsDashboardProps) {
  const { resumo, faltantes = [], divergencias = [] } = results;

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("ALL");

  const normalizar = (s: string) => s.toLowerCase().trim();

  const filtrarFaltantes = useMemo(() => {
    if (statusFiltro !== "ALL" && statusFiltro !== "FALTANTE") return [];
    return (faltantes as NotaFaltante[]).filter((n) => {
      if (!busca) return true;
      const q = normalizar(busca);
      return (
        normalizar(n.numeroNota).includes(q) ||
        normalizar(n.cnpj).includes(q)
      );
    });
  }, [faltantes, busca, statusFiltro]);

  const filtrarDivergencias = useMemo(() => {
    if (statusFiltro !== "ALL" && statusFiltro !== "DIVERGENTE") return [];
    return (divergencias as NotaDivergente[]).filter((n) => {
      if (!busca) return true;
      const q = normalizar(busca);
      return (
        normalizar(n.numeroNota).includes(q) ||
        normalizar(n.cnpj).includes(q)
      );
    });
  }, [divergencias, busca, statusFiltro]);

  const totalProblemas = resumo.totalFaltantes + resumo.totalDivergencias;
  const tudo_ok = totalProblemas === 0 && resumo.totalLivroFiscal > 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          title="Notas no Livro Fiscal"
          value={resumo.totalLivroFiscal}
          className="border-border"
          valueColor="text-foreground"
          data-testid="card-total"
        />
        <SummaryCard
          title="Notas Faltantes no Apollo"
          value={resumo.totalFaltantes}
          className="border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20"
          valueColor="text-red-600 dark:text-red-400"
          data-testid="card-faltantes"
        />
        <SummaryCard
          title="Divergências de Valor"
          value={resumo.totalDivergencias}
          className="border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
          valueColor="text-amber-600 dark:text-amber-400"
          data-testid="card-divergencias"
        />
      </div>

      {/* All OK banner */}
      {tudo_ok && (
        <Card className="border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="py-6 text-center">
            <p className="text-green-700 dark:text-green-400 font-semibold text-lg">
              Todas as notas do Livro Fiscal estão corretamente lançadas no Apollo.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Nenhuma nota faltante ou divergência encontrada.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filter Bar */}
      {!tudo_ok && (
        <Card className="shadow-sm border-border">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por Número da Nota ou CNPJ..."
                className="pl-8"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                data-testid="input-busca-geral"
              />
            </div>
            <div className="w-full sm:w-56">
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os tipos</SelectItem>
                  <SelectItem value="FALTANTE">Faltantes</SelectItem>
                  <SelectItem value="DIVERGENTE">Divergências</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">

        {/* Tabela 1: Faltantes */}
        {(statusFiltro === "ALL" || statusFiltro === "FALTANTE") && (
          <Card className="border-l-4 border-l-red-500 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2 text-lg">
                Notas Faltantes no Apollo
                <Badge
                  variant="outline"
                  className="ml-2 text-red-700 dark:text-red-400 border-red-200 bg-red-50 dark:bg-red-950/30"
                  data-testid="badge-faltantes"
                >
                  {filtrarFaltantes.length}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Notas presentes no Livro Fiscal sem correspondência no Relatório Apollo (Rondonópolis).
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {filtrarFaltantes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {resumo.totalFaltantes === 0
                    ? "Nenhuma nota faltante. Todas as notas foram localizadas no Apollo."
                    : "Nenhum resultado para o filtro aplicado."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Número NFS-e</TableHead>
                        <TableHead>Data Emissão</TableHead>
                        <TableHead>CNPJ (Prestador)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor Base</TableHead>
                        <TableHead className="text-right">Valor ISS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtrarFaltantes.map((nota, i) => (
                        <TableRow
                          key={i}
                          className="hover:bg-red-50/30 dark:hover:bg-red-950/10"
                          data-testid={`row-faltante-${nota.numeroNota}`}
                        >
                          <TableCell className="font-semibold">{nota.numeroNota}</TableCell>
                          <TableCell>{nota.dataEmissao || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{formatCnpj(nota.cnpj)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-normal"
                            >
                              {nota.status || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(nota.valorBase)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
                            {formatCurrency(nota.valorISS)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabela 2: Divergências */}
        {(statusFiltro === "ALL" || statusFiltro === "DIVERGENTE") && (
          <Card className="border-l-4 border-l-amber-500 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-amber-700 dark:text-amber-500 flex items-center gap-2 text-lg">
                Divergências de Valor
                <Badge
                  variant="outline"
                  className="ml-2 text-amber-700 dark:text-amber-500 border-amber-200 bg-amber-50 dark:bg-amber-950/30"
                  data-testid="badge-divergencias"
                >
                  {filtrarDivergencias.length}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Notas localizadas nos dois arquivos com diferença superior a R$&nbsp;0,05 no Valor Base ou no ISS.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {filtrarDivergencias.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {resumo.totalDivergencias === 0
                    ? "Nenhuma divergência de valor encontrada."
                    : "Nenhum resultado para o filtro aplicado."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Número NFS-e</TableHead>
                        <TableHead>CNPJ (Prestador)</TableHead>
                        <TableHead className="text-right">Valor Base (LF)</TableHead>
                        <TableHead className="text-right">Valor Base (Apollo)</TableHead>
                        <TableHead className="text-right">Diferença Base</TableHead>
                        <TableHead className="text-right">ISS (LF)</TableHead>
                        <TableHead className="text-right">ISS (Apollo)</TableHead>
                        <TableHead className="text-right">Diferença ISS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtrarDivergencias.map((nota, i) => (
                        <TableRow
                          key={i}
                          className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10"
                          data-testid={`row-divergente-${nota.numeroNota}`}
                        >
                          <TableCell className="font-semibold">{nota.numeroNota}</TableCell>
                          <TableCell className="font-mono text-sm">{formatCnpj(nota.cnpj)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorBaseLF)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorBaseApollo)}</TableCell>
                          <TableCell className="text-right">
                            {nota.difBase > 0.005 ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400">
                                {formatCurrency(nota.difBase)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorISSLF)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorISSApollo)}</TableCell>
                          <TableCell className="text-right">
                            {nota.difISS > 0.005 ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400">
                                {formatCurrency(nota.difISS)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  className,
  valueColor = "text-foreground",
  "data-testid": testId,
}: {
  title: string;
  value: number;
  className?: string;
  valueColor?: string;
  "data-testid"?: string;
}) {
  return (
    <Card className={`shadow-sm ${className || ""}`} data-testid={testId}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className={`text-3xl font-bold ${valueColor}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
