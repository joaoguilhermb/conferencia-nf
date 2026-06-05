import React, { useState, useMemo } from "react";
import { ResultadoReconciliacao, NotaNaoLocalizada, NotaDivergente, PossivelErroLancamento, NotaConciliada } from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Search, Filter } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function ResultsDashboard({ results }: ResultsDashboardProps) {
  const { resumo, naoLocalizadas, divergentes, posiveisErros, conciliadas } = results;

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("ALL");
  const [razaoSocialFiltro, setRazaoSocialFiltro] = useState("");
  const [cnpjFiltro, setCnpjFiltro] = useState("");
  
  const [isConciliadasOpen, setIsConciliadasOpen] = useState(false);

  const filterItems = <T extends { numeroNota?: string, notaLivroFiscal?: string, razaoSocial?: string, cnpj?: string }>(items: T[]) => {
    return items.filter(item => {
      const num = item.numeroNota || item.notaLivroFiscal || "";
      const rs = item.razaoSocial || "";
      const c = item.cnpj || "";

      const matchBusca = busca === "" || 
        num.toLowerCase().includes(busca.toLowerCase()) || 
        rs.toLowerCase().includes(busca.toLowerCase()) || 
        c.toLowerCase().includes(busca.toLowerCase());
      
      const matchRazao = razaoSocialFiltro === "" || rs.toLowerCase().includes(razaoSocialFiltro.toLowerCase());
      const matchCnpj = cnpjFiltro === "" || c.toLowerCase().includes(cnpjFiltro.toLowerCase());

      return matchBusca && matchRazao && matchCnpj;
    });
  };

  const filteredNaoLocalizadas = useMemo(() => filterItems(naoLocalizadas || []), [naoLocalizadas, busca, razaoSocialFiltro, cnpjFiltro]);
  const filteredDivergentes = useMemo(() => filterItems(divergentes || []), [divergentes, busca, razaoSocialFiltro, cnpjFiltro]);
  const filteredPosiveisErros = useMemo(() => filterItems(posiveisErros || []), [posiveisErros, busca, razaoSocialFiltro, cnpjFiltro]);
  const filteredConciliadas = useMemo(() => filterItems(conciliadas || []), [conciliadas, busca, razaoSocialFiltro, cnpjFiltro]);

  const showNaoLocalizadas = statusFiltro === "ALL" || statusFiltro === "NAO_LOCALIZADA";
  const showDivergentes = statusFiltro === "ALL" || statusFiltro === "DIVERGENTE";
  const showPosiveisErros = statusFiltro === "ALL" || statusFiltro === "POSSIVEL_ERRO";
  const showConciliadas = statusFiltro === "ALL" || statusFiltro === "CONCILIADA";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard title="Notas no Livro" value={resumo?.totalLivroFiscal || 0} className="border-border" />
        <SummaryCard title="Conciliadas" value={resumo?.totalConciliadas || 0} className="border-green-500 bg-green-50/50 dark:bg-green-950/20" valueColor="text-green-600 dark:text-green-400" />
        <SummaryCard title="Não Localizadas" value={resumo?.totalNaoLocalizadas || 0} className="border-red-500 bg-red-50/50 dark:bg-red-950/20" valueColor="text-red-600 dark:text-red-400" />
        <SummaryCard title="Divergentes" value={resumo?.totalDivergentes || 0} className="border-amber-500 bg-amber-50/50 dark:bg-amber-950/20" valueColor="text-amber-600 dark:text-amber-400" />
        <SummaryCard title="Possíveis Erros" value={resumo?.totalPosiveisErros || 0} className="border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" valueColor="text-blue-600 dark:text-blue-400" />
      </div>

      {/* Filter Bar */}
      <Card className="shadow-sm border-border">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar (Número, Razão, CNPJ)..." 
              className="pl-8" 
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              data-testid="input-busca-geral"
            />
          </div>
          <div>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger data-testid="select-status">
                <SelectValue placeholder="Filtrar por Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Status</SelectItem>
                <SelectItem value="NAO_LOCALIZADA">Não Localizadas</SelectItem>
                <SelectItem value="DIVERGENTE">Divergentes</SelectItem>
                <SelectItem value="POSSIVEL_ERRO">Possíveis Erros</SelectItem>
                <SelectItem value="CONCILIADA">Conciliadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input 
              placeholder="Filtrar Razão Social" 
              value={razaoSocialFiltro}
              onChange={(e) => setRazaoSocialFiltro(e.target.value)}
              data-testid="input-razao-social"
            />
          </div>
          <div>
            <Input 
              placeholder="Filtrar CNPJ" 
              value={cnpjFiltro}
              onChange={(e) => setCnpjFiltro(e.target.value)}
              data-testid="input-cnpj"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-8">
        
        {/* Table 1: Não Localizadas */}
        {showNaoLocalizadas && (
          <Card className="border-l-4 border-l-red-500 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2 text-lg">
                Notas Não Localizadas
                <Badge variant="outline" className="ml-2 text-red-700 dark:text-red-400 border-red-200 bg-red-50 dark:bg-red-950/30">{filteredNaoLocalizadas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredNaoLocalizadas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma nota não localizada encontrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Número da Nota</TableHead>
                        <TableHead>Data Emissão</TableHead>
                        <TableHead>Razão Social</TableHead>
                        <TableHead>CNPJ</TableHead>
                        <TableHead className="text-right">Valor Bruto</TableHead>
                        <TableHead className="text-right">Valor Líquido</TableHead>
                        <TableHead className="text-right">Valor ISS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNaoLocalizadas.map((nota, i) => (
                        <TableRow key={i} data-testid={`row-nao-localizada-${nota.numeroNota}`}>
                          <TableCell className="font-medium">{nota.numeroNota}</TableCell>
                          <TableCell>{nota.dataEmissao}</TableCell>
                          <TableCell>{nota.razaoSocial}</TableCell>
                          <TableCell>{formatCnpj(nota.cnpj)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorBruto)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(nota.valorLiquido)}</TableCell>
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

        {/* Table 2: Divergentes */}
        {showDivergentes && (
          <Card className="border-l-4 border-l-amber-500 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-amber-700 dark:text-amber-500 flex items-center gap-2 text-lg">
                Notas Divergentes
                <Badge variant="outline" className="ml-2 text-amber-700 dark:text-amber-500 border-amber-200 bg-amber-50 dark:bg-amber-950/30">{filteredDivergentes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredDivergentes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma nota divergente encontrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Número da Nota</TableHead>
                        <TableHead>Razão Social</TableHead>
                        <TableHead>Campos Divergentes</TableHead>
                        <TableHead>Observação</TableHead>
                        <TableHead>Ação Recomendada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDivergentes.map((nota, i) => (
                        <TableRow key={i} data-testid={`row-divergente-${nota.numeroNota}`}>
                          <TableCell className="font-medium">{nota.numeroNota}</TableCell>
                          <TableCell>
                            <div>{nota.razaoSocial}</div>
                            <div className="text-xs text-muted-foreground">{formatCnpj(nota.cnpj)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2 py-2">
                              {nota.camposDivergentes?.map((c, j) => (
                                <div key={j} className="text-sm bg-muted/50 p-2 rounded border border-border/50">
                                  <div className="font-semibold mb-1 capitalize">{c.campo}</div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div><span className="text-muted-foreground block text-[10px] uppercase">Livro Fiscal</span>{c.valorLivroFiscal}</div>
                                    <div><span className="text-muted-foreground block text-[10px] uppercase">Apollo</span>{c.valorApollo}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{nota.observacao}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 whitespace-nowrap">{nota.acaoRecomendada}</Badge>
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

        {/* Table 3: Possíveis Erros */}
        {showPosiveisErros && (
          <Card className="border-l-4 border-l-blue-500 shadow-md">
            <CardHeader className="py-4">
              <CardTitle className="text-blue-700 dark:text-blue-400 flex items-center gap-2 text-lg">
                Possíveis Erros de Lançamento
                <Badge variant="outline" className="ml-2 text-blue-700 dark:text-blue-400 border-blue-200 bg-blue-50 dark:bg-blue-950/30">{filteredPosiveisErros.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filteredPosiveisErros.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum possível erro encontrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead>Nota (Livro)</TableHead>
                        <TableHead>Nota (Apollo)</TableHead>
                        <TableHead>Razão Social</TableHead>
                        <TableHead>Confiança</TableHead>
                        <TableHead>Observação</TableHead>
                        <TableHead>Ação Recomendada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPosiveisErros.map((nota, i) => (
                        <TableRow key={i} data-testid={`row-possivel-erro-${nota.notaLivroFiscal}`}>
                          <TableCell className="font-medium">{nota.notaLivroFiscal}</TableCell>
                          <TableCell className="font-medium text-muted-foreground">{nota.notaApollo}</TableCell>
                          <TableCell>
                            <div>{nota.razaoSocial}</div>
                            <div className="text-xs text-muted-foreground">{formatCnpj(nota.cnpj)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={nota.percentualConfianca} className="w-16 h-2" />
                              <span className="text-xs font-medium">{nota.percentualConfianca}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{nota.observacao}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 whitespace-nowrap">{nota.acaoRecomendada}</Badge>
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

        {/* Table 4: Conciliadas */}
        {showConciliadas && (
          <Collapsible open={isConciliadasOpen} onOpenChange={setIsConciliadasOpen}>
            <Card className="border-l-4 border-l-green-500 shadow-md">
              <CardHeader className="py-3 pr-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-green-700 dark:text-green-500 flex items-center gap-2 text-lg">
                    Notas Conciliadas
                    <Badge variant="outline" className="ml-2 text-green-700 dark:text-green-500 border-green-200 bg-green-50 dark:bg-green-950/30">{filteredConciliadas.length}</Badge>
                  </CardTitle>
                  <CollapsibleTrigger className="p-2 hover:bg-muted rounded-full transition-colors">
                    {isConciliadasOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </CollapsibleTrigger>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="p-0 border-t">
                  {filteredConciliadas.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhuma nota conciliada encontrada.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow>
                            <TableHead>Número da Nota</TableHead>
                            <TableHead>Data Emissão</TableHead>
                            <TableHead>Razão Social</TableHead>
                            <TableHead>CNPJ</TableHead>
                            <TableHead className="text-right">Valor Bruto</TableHead>
                            <TableHead className="text-right">Valor Líquido</TableHead>
                            <TableHead className="text-right">Valor ISS</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredConciliadas.map((nota, i) => (
                            <TableRow key={i} data-testid={`row-conciliada-${nota.numeroNota}`}>
                              <TableCell className="font-medium">{nota.numeroNota}</TableCell>
                              <TableCell>{nota.dataEmissao}</TableCell>
                              <TableCell>{nota.razaoSocial}</TableCell>
                              <TableCell>{formatCnpj(nota.cnpj)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(nota.valorBruto)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(nota.valorLiquido)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(nota.valorISS)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 font-normal">
                                  {nota.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
        
      </div>
    </div>
  );
}

function SummaryCard({ title, value, className, valueColor = "text-foreground" }: { title: string; value: number; className?: string; valueColor?: string }) {
  return (
    <Card className={`shadow-sm ${className || ""}`}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
