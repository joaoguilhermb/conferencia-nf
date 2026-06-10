# Conferência de NF

Sistema web de conferência e reconciliação de notas fiscais, desenvolvido para uso interno no Grupo Fancar.

## Estrutura do projeto

```
├── artifacts/
│   ├── api-server/          # Backend Node.js + TypeScript (Express)
│   └── conferencia-nf/      # Frontend React + Vite + Tailwind
├── lib/
│   ├── api-client-react/    # Client HTTP gerado via Orval (React Query)
│   ├── api-spec/            # Especificação OpenAPI (orval.config.ts)
│   ├── api-zod/             # Schemas Zod gerados via Orval
│   └── db/                  # Camada de banco de dados (Drizzle ORM)
├── scripts/                 # Scripts utilitários
├── package.json             # Workspace root (pnpm)
└── pnpm-workspace.yaml      # Configuração do monorepo
```

## Tecnologias

- **Runtime:** Node.js
- **Gerenciador de pacotes:** pnpm (workspaces)
- **Backend:** TypeScript, Express
- **Frontend:** React 19, Vite, Tailwind CSS v4, TanStack Query, Wouter
- **Banco de dados:** Drizzle ORM
- **Validação:** Zod
- **Geração de cliente API:** Orval (OpenAPI → TypeScript)

## Pré-requisitos

- Node.js 20+
- pnpm 9+

## Instalação

```bash
pnpm install
```

## Desenvolvimento

```bash
# Rodar o backend
cd artifacts/api-server
pnpm dev

# Rodar o frontend
cd artifacts/conferencia-nf
pnpm dev
```

## Build

```bash
# Build completo do workspace
pnpm build
```

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto baseado no `.env.example` (se disponível).
