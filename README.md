```markdown
# ?? Cabine - Monorepo

Este reposit¢rio cont‚m o c¢digo-fonte do projeto **Cabine**, estruturado em um monorepo que engloba o backend (`cabine-core`) e o frontend (`cabine-web`).

## ??? Pr‚-requisitos

Antes de come‡ar, certifique-se de ter as seguintes ferramentas instaladas na sua m quina local:

*   [Node.js](https://nodejs.org/) (recomendado versÆo LTS)
*   [Python](https://www.python.org/) (versÆo 3.10 ou superior)
*   [uv](https://docs.astral.sh/uv/) (Gerenciador de dependˆncias para o Python)

---

## ?? Instala‡Æo e Execu‡Æo

### 1. Backend (`cabine-core`)

O core da aplica‡Æo ‚ respons vel pela l¢gica de neg¢cios e APIs. Para rodar o ambiente localmente:

1. Acesse o diret¢rio do backend:
   ```bash
   cd cabine-core

```

2. Instale as dependˆncias a partir do arquivo de lock usando o `uv`:
```bash
uv sync

```


3. Ative o ambiente virtual e inicie o servidor:
```bash
# O comando abaixo pode variar dependendo do framework usado (FastAPI, Flask, etc.)
uv run python main.py

```



### 2. Frontend (`cabine-web`)

A interface de usu rio foi desenvolvida em TypeScript. Para subir o ambiente visual:

1. Em uma nova aba do terminal, acesse o diret¢rio web:
```bash
cd cabine-web

```


2. Instale as dependˆncias do pacote (ajuste caso utilize `yarn` ou `pnpm`):
```bash
npm install

```


3. Inicie o servidor de desenvolvimento:
```bash
npm run dev

```



---

## ??? Estrutura do Projeto

* `/cabine-core/` - Aplica‡Æo backend e integra‡äes.
* `/cabine-web/` - Aplica‡Æo frontend e interface de usu rio.
