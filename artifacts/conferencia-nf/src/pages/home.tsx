import React, { useState } from "react";
import { UploadScreen } from "@/components/upload-screen";
import { ResultsDashboard } from "@/components/results-dashboard";
import { ResultadoReconciliacao } from "@workspace/api-client-react/src/generated/api.schemas";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ResultadoReconciliacao | null>(null);
  const { toast } = useToast();

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

      const data = await response.json();
      setResults(data);
      toast({
        title: "Sucesso",
        description: "Conciliação processada com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Ocorreu um erro inesperado.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setResults(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
            R
          </div>
          <div>
            <h1 className="font-semibold text-lg leading-tight">Conferência de Notas Fiscais</h1>
            <p className="text-xs text-muted-foreground">Prefeitura Municipal de Rondonópolis</p>
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
