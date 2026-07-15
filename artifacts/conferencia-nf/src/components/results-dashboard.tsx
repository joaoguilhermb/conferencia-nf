import { useState, useMemo, useCallback } from "react";
import type {
  ResultadoReconciliacao,
  NotaFaltante,
  NotaDivergente,
  NotaValidada,
  NotaCancelada,
} from "@/types/reconciliacao";
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
import { Search, FileDown, Loader2 } from "lucide-react";

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

function CnpjCell({ cnpj, razaoSocial }: { cnpj: string; razaoSocial: string }) {
  return (
    <div>
      <div className="font-mono text-sm">{formatCnpj(cnpj)}</div>
      {razaoSocial && (
        <div className="text-xs text-muted-foreground mt-0.5 max-w-[240px] truncate" title={razaoSocial}>
          {razaoSocial}
        </div>
      )}
    </div>
  );
}

function PdfButton({ notaId, numeroNota }: { notaId?: number; numeroNota: string }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (notaId === undefined) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/notas/${notaId}/pdf`, { method: "POST" });

      // O backend agora SEMPRE responde em JSON (nunca manda PDF binário
      // direto) — o campo "tipo" diz o que fazer com a resposta.
      const data = (await res.json().catch(() => ({}))) as {
        html?: string;
        url?: string;
        tipo?: string;
        erro?: string;
      };

      if (!res.ok) {
        throw new Error(data.erro ?? `Erro HTTP ${res.status}`);
      }

      if (data.tipo === "html" && data.html) {
        // HTML da visualização da nota — abre numa aba nova.
        // O usuário usa o Ctrl+P do navegador ali dentro pra salvar como PDF.
        const blob = new Blob([data.html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } else if (data.tipo === "linkExterno" && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("Resposta inesperada do servidor.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao obter visualização da nota.";
      setErro(msg);
      // Limpa o erro após 4 segundos
      setTimeout(() => setErro(null), 4000);
    } finally {
      setLoading(false);
    }
  }, [notaId, numeroNota]);

  if (notaId === undefined) return null;

  return (
    <button
      onClick={(e) => { e.stopPropagation(); void handleClick(); }}
      disabled={loading}
      title={erro ?? `Baixar PDF da NFS-e ${numeroNota}`}
      className={`inline-flex items-center justify-center w-6 h-6 rounded ml-1.5 transition-colors
        ${erro
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }
        disabled:opacity-40 disabled:cursor-wait
      `}
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <FileDown className="w-3.5 h-3.5" />
      }
    </button>
  );
}

export function ResultsDashboard({ results }: ResultsDashboardProps) {
  const {
    resumo,
    faltantes = [],
    divergencias = [],
    validadas = [],
    canceladas = [],
  } = results;

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("ALL");

  const faltantesFiltradas = useMemo(() => {
    if (filtro !== "ALL" && filtro !== "FALTANTE") return [];
    if (!busca) return faltantes as NotaFaltante[];
    const q = busca.toLowerCase().trim();
    return (faltantes as NotaFaltante[]).filter(
      (n) =>
        n.numeroNota.toLowerCase().includes(q) ||
        n.cnpj.toLowerCase().includes(q) ||
        (n.razaoSocial ?? "").toLowerCase().includes(q),
    );
  }, [faltantes, busca, filtro]);

  const divergenciasFiltradas = useMemo(() => {
    if (filtro !== "ALL" && filtro !== "DIVERGENTE") return [];
    if (!busca) return divergencias as NotaDivergente[];
    const q = busca.toLowerCase().trim();
    return (divergencias as NotaDivergente[]).filter(
      (n) =>
        n.numeroNota.toLowerCase().includes(q) ||
        n.cnpj.toLowerCase().includes(q) ||
        (n.razaoSocial ?? "").toLowerCase().includes(q),
    );
  }, [divergencias, busca, filtro]);

  const validadasFiltradas = useMemo(() => {
    if (filtro !== "ALL" && filtro !== "VALIDADA") return [];
    if (!busca) return validadas as NotaValidada[];
    const q = busca.toLowerCase().trim();
    return (validadas as NotaValidada[]).filter(
      (n) =>
        n.numeroNota.toLowerCase().includes(q) ||
        n.cnpj.toLowerCase().includes(q) ||
        (n.razaoSocial ?? "").toLowerCase().includes(q),
    );
  }, [validadas, busca, filtro]);

  const canceladasFiltradas = useMemo(() => {
    if (filtro !== "ALL" && filtro !== "CANCELADA") return [];
    if (!busca) return canceladas as NotaCancelada[];
    const q = busca.toLowerCase().trim();
    return (canceladas as NotaCancelada[]).filter(
      (n) =>
        n.numeroNota.toLowerCase().includes(q) ||
        n.cnpj.toLowerCase().includes(q) ||
        (n.razaoSocial ?? "").toLowerCase().includes(q),
    );
  }, [canceladas, busca, filtro]);

  const tudo_ok =
    resumo.totalFaltantes === 0 &&
    resumo.totalDivergencias === 0 &&
    resumo.totalNotas > 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <SummaryCard
          title="Total Emitidas"
          value={resumo.totalNotas}
          className="border-border"
          valueColor="text-foreground"
        />
        <SummaryCard
          title="Validadas"
          value={resumo.totalValidadas}
          className="border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20"
          valueColor="text-green-600 dark:text-green-400"
        />
        <SummaryCard
          title="Faltantes no Apollo"
          value={resumo.totalFaltantes}
          className="border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20"
          valueColor="text-red-600 dark:text-red-400"
        />
        <SummaryCard
          title="Divergências de Valor"
          value={resumo.totalDivergencias}
          className="border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
          valueColor="text-amber-600 dark:text-amber-400"
        />
        <SummaryCard
          title="Canceladas"
          value={resumo.totalCanceladas}
          className="border-l-4 border-l-slate-400 bg-slate-50/50 dark:bg-slate-900/20"
          valueColor="text-slate-500 dark:text-slate-400"
        />
      </div>

      {/* Banner tudo ok */}
      {tudo_ok && (
        <Card className="border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="py-6 text-center">
            <p className="text-green-700 dark:text-green-400 font-semibold text-lg">
              Todas as notas emitidas do Livro Fiscal estão corretamente lançadas no Apollo.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Nenhuma nota faltante ou divergência encontrada.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Barra de filtros */}
      <Card className="shadow-sm border-border">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nota, CNPJ ou razão social..."
              className="pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-60">
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os tipos</SelectItem>
                <SelectItem value="FALTANTE">Faltantes</SelectItem>
                <SelectItem value="DIVERGENTE">Divergências</SelectItem>
                <SelectItem value="VALIDADA">Validadas</SelectItem>
                <SelectItem value="CANCELADA">Canceladas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-8">

        {/* Tabela: Faltantes */}
        {(filtro === "ALL" || filtro === "FALTANTE") && (
          <Card className="border-l-4 border-l-red-500 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2 text-lg">
                Notas Faltantes no Apollo
                <Badge variant="outline" className="ml-2 text-red-700 dark:text-red-400 border-red-200 bg-red-50 dark:bg-red-950/30">
                  {faltantesFiltradas.length}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Notas emitidas no Livro Fiscal sem correspondência no Relatório Apollo.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {faltantesFiltradas.length === 0 ? (
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
                        <TableHead>CNPJ / Razão Social</TableHead>
                        <TableHead>ISS Retido</TableHead>
                        <TableHead className="text-right">Valor Base</TableHead>
                        <TableHead className="text-right">Valor ISS</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(faltantesFiltradas as NotaFaltante[]).map((nota, i) => (
                        <TableRow key={i} className="hover:bg-red-50/30 dark:hover:bg-red-950/10">
                          <TableCell className="font-semibold">
                            <span className="inline-flex items-center">
                              {nota.numeroNota}
                              <PdfButton notaId={nota.id} numeroNota={nota.numeroNota} />
                            </span>
                          </TableCell>
                          <TableCell>{nota.dataEmissao || "—"}</TableCell>
                          <TableCell>
                            <CnpjCell cnpj={nota.cnpj} razaoSocial={nota.razaoSocial ?? ""} />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={nota.issRetido === "Sim"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 font-normal"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-normal"}
                            >
                              {nota.issRetido}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(nota.valorBase)}</TableCell>
                          <TableCell className="text-right font-medium text-red-600 dark:text-red-400">{formatCurrency(nota.valorISS)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabela: Divergências */}
        {(filtro === "ALL" || filtro === "DIVERGENTE") && (
          <Card className="border-l-4 border-l-amber-500 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-amber-700 dark:text-amber-500 flex items-center gap-2 text-lg">
                Divergências de Valor
                <Badge variant="outline" className="ml-2 text-amber-700 dark:text-amber-500 border-amber-200 bg-amber-50 dark:bg-amber-950/30">
                  {divergenciasFiltradas.length}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Notas localizadas nos dois arquivos com diferença superior a R$&nbsp;0,05 no Valor Base ou no ISS.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {divergenciasFiltradas.length === 0 ? (
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
                        <TableHead>CNPJ / Razão Social</TableHead>
                        <TableHead className="text-right">Valor Base (LF)</TableHead>
                        <TableHead className="text-right">Valor Base (Apollo)</TableHead>
                        <TableHead className="text-right">Diferença Base</TableHead>
                        <TableHead className="text-right">ISS (LF)</TableHead>
                        <TableHead className="text-right">ISS (Apollo)</TableHead>
                        <TableHead className="text-right">Diferença ISS</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(divergenciasFiltradas as NotaDivergente[]).map((nota, i) => (
                        <TableRow key={i} className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10">
                          <TableCell className="font-semibold">
                            <span className="inline-flex items-center">
                              {nota.numeroNota}
                              <PdfButton notaId={nota.id} numeroNota={nota.numeroNota} />
                            </span>
                          </TableCell>
                          <TableCell>
                            <CnpjCell cnpj={nota.cnpj} razaoSocial={nota.razaoSocial ?? ""} />
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorBaseLF)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorBaseApollo)}</TableCell>
                          <TableCell className="text-right">
                            {nota.difBase > 0.005 ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(nota.difBase)}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorISSLF)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorISSApollo)}</TableCell>
                          <TableCell className="text-right">
                            {nota.difISS > 0.005 ? (
                              <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(nota.difISS)}</span>
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

        {/* Tabela: Canceladas */}
        {(filtro === "ALL" || filtro === "CANCELADA") && (
          <Card className="border-l-4 border-l-slate-400 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-slate-600 dark:text-slate-400 flex items-center gap-2 text-lg">
                Notas Canceladas
                <Badge variant="outline" className="ml-2 text-slate-600 dark:text-slate-400 border-slate-200 bg-slate-50 dark:bg-slate-900/30">
                  {canceladasFiltradas.length}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Notas com situação "Cancelado" no Livro Fiscal. Verifique se alguma ainda está lançada no Apollo.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {canceladasFiltradas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {resumo.totalCanceladas === 0
                    ? "Nenhuma nota cancelada encontrada."
                    : "Nenhum resultado para o filtro aplicado."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Número NFS-e</TableHead>
                        <TableHead>Data Emissão</TableHead>
                        <TableHead>CNPJ / Razão Social</TableHead>
                        <TableHead className="text-right">Valor Base</TableHead>
                        <TableHead className="text-right">Valor ISS</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(canceladasFiltradas as NotaCancelada[]).map((nota, i) => (
                        <TableRow key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                          <TableCell className="font-semibold text-slate-500">
                            <span className="inline-flex items-center">
                              {nota.numeroNota}
                              <PdfButton notaId={nota.id} numeroNota={nota.numeroNota} />
                            </span>
                          </TableCell>
                          <TableCell>{nota.dataEmissao || "—"}</TableCell>
                          <TableCell>
                            <CnpjCell cnpj={nota.cnpj} razaoSocial={nota.razaoSocial ?? ""} />
                          </TableCell>
                          <TableCell className="text-right font-medium text-slate-500">{formatCurrency(nota.valorBase)}</TableCell>
                          <TableCell className="text-right font-medium text-slate-500">{formatCurrency(nota.valorISS)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabela: Validadas */}
        {(filtro === "ALL" || filtro === "VALIDADA") && (
          <Card className="border-l-4 border-l-green-500 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-green-700 dark:text-green-400 flex items-center gap-2 text-lg">
                Notas Validadas
                <Badge variant="outline" className="ml-2 text-green-700 dark:text-green-400 border-green-200 bg-green-50 dark:bg-green-950/30">
                  {validadasFiltradas.length}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Notas presentes no Livro Fiscal e localizadas no Apollo sem divergência de valor.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {validadasFiltradas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {resumo.totalValidadas === 0
                    ? "Nenhuma nota validada encontrada."
                    : "Nenhum resultado para o filtro aplicado."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Número NFS-e</TableHead>
                        <TableHead>Data Emissão</TableHead>
                        <TableHead>CNPJ / Razão Social</TableHead>
                        <TableHead>ISS Retido</TableHead>
                        <TableHead className="text-right">Valor Base</TableHead>
                        <TableHead className="text-right">Valor ISS</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(validadasFiltradas as NotaValidada[]).map((nota, i) => (
                        <TableRow key={i} className="hover:bg-green-50/30 dark:hover:bg-green-950/10">
                          <TableCell className="font-semibold">
                            <span className="inline-flex items-center">
                              {nota.numeroNota}
                              <PdfButton notaId={nota.id} numeroNota={nota.numeroNota} />
                            </span>
                          </TableCell>
                          <TableCell>{nota.dataEmissao || "—"}</TableCell>
                          <TableCell>
                            <CnpjCell cnpj={nota.cnpj} razaoSocial={nota.razaoSocial ?? ""} />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={nota.issRetido === "Sim"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 font-normal"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-normal"}
                            >
                              {nota.issRetido}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(nota.valorBase)}</TableCell>
                          <TableCell className="text-right font-medium text-green-600 dark:text-green-400">{formatCurrency(nota.valorISS)}</TableCell>
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