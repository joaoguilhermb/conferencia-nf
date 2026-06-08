import { useState } from "react";
import { UploadScreen } from "@/components/upload-screen";
import { ResultsDashboard } from "@/components/results-dashboard";
import type { ResultadoReconciliacao } from "@/types/reconciliacao";
import { useToast } from "@/hooks/use-toast";
import { User } from "lucide-react";

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
// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function Home() {
  const [usuario, setUsuario] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ResultadoReconciliacao | null>(null);
  const { toast } = useToast();

  // Antes de tudo: exige nome
  if (!usuario) {
    return <LoginScreen onLogin={setUsuario} />;
  }

  const handleProcess = async (livroFiscal: File, apollo: File) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append("livroFiscal", livroFiscal);
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
        description: `${data.resumo.totalLivroFiscal} notas processadas — ${data.resumo.totalFaltantes} faltantes, ${data.resumo.totalDivergencias} divergências.`,
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
      setIsProcessing(false);
    }
  };

  const handleReset = () => setResults(null);

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
            {/* Nome do usuário no lugar de "Prefeitura de Rondonópolis" */}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />
              Usuário: {usuario}
            </p>
          </div>
        </div>
        {results && (
          <button
            data-testid="button-nova-conciliacao"
            onClick={handleReset}
            className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Nova Conciliação
          </button>
        )}
      </header>

      <main className="flex-1 p-6 flex flex-col items-center">
        {results ? (
          <div className="w-full max-w-7xl">
            <ResultsDashboard results={results} />
          </div>
        ) : (
          <div className="w-full max-w-2xl mt-12">
            <UploadScreen onProcess={handleProcess} isProcessing={isProcessing} />
          </div>
        )}
      </main>
    </div>
  );
}