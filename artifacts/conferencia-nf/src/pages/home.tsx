import { useState, useEffect, useCallback } from "react";
import { UploadScreen } from "@/components/upload-screen";
import { ResultsDashboard } from "@/components/results-dashboard";
import type { ResultadoReconciliacao } from "@/types/reconciliacao";
import { useToast } from "@/hooks/use-toast";
import { User, RefreshCw, Clock } from "lucide-react";

// ---------------------------------------------------------------------------
// Tela de login — só pede o nome
// ---------------------------------------------------------------------------
function LoginScreen({ onLogin }: { onLogin: (nome: string) => void }) {
  const [nome, setNome] = useState("");

  const handleSubmit = () => {
    const trimmed = nome.trim();
    if (!trimmed) return;
    onLogin(trimmed);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / título */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
            ?
          </div>
          <div>
            <h1 className="font-semibold text-xl leading-tight">
              Conciliação Livro Fiscal
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Prefeitura - Apollo
            </p>
          </div>
        </div>

        {/* Card de login */}
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="nome-input"
              className="text-sm font-medium text-foreground"
            >
              Seu nome
            </label>
            <input
              id="nome-input"
              type="text"
              placeholder="Ex: Guilherme"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              autoFocus
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!nome.trim()}
            className="w-full bg-primary text-primary-foreground text-sm font-medium py-2 rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

function getIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0]![0]!.toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function Home() {
  const [usuario, setUsuario] = useState<string | null>(null);
  const [isProcessingReconciliacao, setIsProcessingReconciliacao] = useState(false);
  const [isAtualizando, setIsAtualizando] = useState(false);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [results, setResults] = useState<ResultadoReconciliacao | null>(null);
  const [competencia, setCompetencia] = useState<"mesAtual" | "mesAnterior">("mesAtual");
  const { toast } = useToast();

  // Load dashboard on first render after login
  const carregarDashboard = useCallback(async () => {
    setIsLoadingDashboard(true);
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Falha ao carregar dashboard");
      const data: ResultadoReconciliacao = await res.json();
      // Only set results if there's actual data (avoid empty placeholder state)
      if (data.resumo.totalNotas > 0) {
        setResults(data);
      }
    } catch (err) {
      // Silently fail on initial load — user can still use the upload screen
    } finally {
      setIsLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    if (usuario) {
      void carregarDashboard();
    }
  }, [usuario, carregarDashboard]);

  if (!usuario) {
    return <LoginScreen onLogin={setUsuario} />;
  }

  // ────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────

  const handleAtualizarPortal = async () => {
    setIsAtualizando(true);
    try {
      const res = await fetch("/api/notas/atualizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro ?? "Erro ao atualizar notas");

      toast({
        title: "Portal atualizado",
        description: `${data.totalInseridas} inseridas, ${data.totalAtualizadas} atualizadas, ${data.totalCanceladas} canceladas.`,
      });

      // Reload dashboard after update
      await carregarDashboard();
    } catch (err) {
      toast({
        title: "Erro ao buscar notas",
        description: err instanceof Error ? err.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setIsAtualizando(false);
    }
  };

  const handleProcessApollo = async (apollo: File) => {
    setIsProcessingReconciliacao(true);
    const formData = new FormData();
    formData.append("apollo", apollo);

    try {
      const response = await fetch("/api/reconciliacao/processar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.erro || "Falha ao processar a conciliação");
      }

      const data: ResultadoReconciliacao = await response.json();
      setResults(data);
      toast({
        title: "Conciliação concluída",
        description: `${data.resumo.totalNotas} notas avaliadas — ${data.resumo.totalFaltantes} faltantes, ${data.resumo.totalDivergencias} divergências.`,
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Ocorreu um erro inesperado.";
      toast({
        title: "Erro ao processar",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsProcessingReconciliacao(false);
    }
  };

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            {getIniciais(usuario)}
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight">
              Conferência de Notas Fiscais
            </h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />
              Usuário: {usuario}
            </p>
          </div>
        </div>

        {/* Portal update controls — always visible after login */}
        <div className="flex items-center gap-3">
          {results?.ultimaAtualizacao && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 hidden sm:flex">
              <Clock className="w-3 h-3" />
              Atualizado em {formatarDataHora(results.ultimaAtualizacao)}
            </p>
          )}
          <select
            id="select-competencia"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value as "mesAtual" | "mesAnterior")}
            className="text-sm border border-input rounded-md px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="mesAtual">Mês atual</option>
            <option value="mesAnterior">Mês anterior</option>
          </select>
          <button
            id="btn-atualizar-portal"
            onClick={handleAtualizarPortal}
            disabled={isAtualizando}
            className="flex items-center gap-1.5 text-sm font-medium bg-secondary text-secondary-foreground px-3 py-1.5 rounded-md hover:bg-secondary/80 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAtualizando ? "animate-spin" : ""}`} />
            {isAtualizando ? "Buscando…" : "Buscar no Portal"}
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col items-center">
        {isLoadingDashboard && !results ? (
          <div className="flex items-center gap-2 text-muted-foreground mt-24">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Carregando dados do banco…
          </div>
        ) : results ? (
          <div className="w-full max-w-7xl">
            <ResultsDashboard results={results} />
          </div>
        ) : (
          <div className="w-full max-w-2xl mt-12">
            <UploadScreen
              onProcess={handleProcessApollo}
              isProcessing={isProcessingReconciliacao}
            />
          </div>
        )}
      </main>
    </div>
  );
}