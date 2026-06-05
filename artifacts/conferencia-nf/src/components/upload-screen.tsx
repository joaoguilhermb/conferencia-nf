import React, { useState, useRef } from "react";
import { UploadCloud, FileText, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

interface UploadScreenProps {
  onProcess: (livroFiscal: File, apollo: File) => void;
  isProcessing: boolean;
}

export function UploadScreen({ onProcess, isProcessing }: UploadScreenProps) {
  const [livroFiscal, setLivroFiscal] = useState<File | null>(null);
  const [apollo, setApollo] = useState<File | null>(null);

  const handleProcessClick = () => {
    if (livroFiscal && apollo) {
      onProcess(livroFiscal, apollo);
    }
  };

  return (
    <Card className="w-full shadow-lg border-t-4 border-t-primary">
      <CardHeader className="text-center pb-8">
        <CardTitle className="text-2xl font-bold">Importação de Arquivos</CardTitle>
        <CardDescription>
          Selecione os arquivos necessários para iniciar a conciliação.
          <br/>Formatos aceitos: XLSX, CSV, PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FileDropzone
            id="livroFiscal"
            label="Livro Fiscal"
            file={livroFiscal}
            onFileSelect={setLivroFiscal}
            disabled={isProcessing}
          />
          <FileDropzone
            id="apollo"
            label="Relatório Apollo"
            file={apollo}
            onFileSelect={setApollo}
            disabled={isProcessing}
          />
        </div>

        <div className="flex justify-center pt-6">
          <Button
            data-testid="button-processar"
            size="lg"
            className="w-full md:w-auto min-w-[200px]"
            onClick={handleProcessClick}
            disabled={!livroFiscal || !apollo || isProcessing}
          >
            {isProcessing ? (
              <>
                <Spinner className="mr-2 h-4 w-4" /> Processando conciliação...
              </>
            ) : (
              "Processar Conciliação"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FileDropzone({
  id,
  label,
  file,
  onFileSelect,
  disabled,
}: {
  id: string;
  label: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors
        ${file ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
      onClick={() => !disabled && inputRef.current?.click()}
      data-testid={`dropzone-${id}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".csv, .xlsx, .pdf"
        onChange={handleFileChange}
        disabled={disabled}
      />
      {file ? (
        <>
          <CheckCircle2 className="h-10 w-10 text-primary mb-3" />
          <h3 className="font-medium text-foreground">{label}</h3>
          <p className="text-sm text-muted-foreground mt-1 truncate max-w-full px-2" title={file.name}>
            {file.name}
          </p>
          <button
            className="text-xs text-destructive mt-3 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onFileSelect(null as any);
              if (inputRef.current) inputRef.current.value = "";
            }}
            disabled={disabled}
          >
            Remover arquivo
          </button>
        </>
      ) : (
        <>
          <UploadCloud className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="font-medium text-foreground">{label}</h3>
          <p className="text-sm text-muted-foreground mt-1">Clique para selecionar o arquivo</p>
        </>
      )}
    </div>
  );
}
