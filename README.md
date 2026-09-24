# Sift

[![GitHub stars](https://img.shields.io/github/stars/fruitizz/hanfani-sift?style=social)](https://github.com/fruitizz/hanfani-sift)

Schema-driven document extraction with **cited sources**. Open-source by default:
**DeepSeek V4** for text-based PDFs (local classify → Markdown → extract), optional
**Claude vision** for scans and images. No signup.

**Repo:** [github.com/fruitizz/hanfani-sift](https://github.com/fruitizz/hanfani-sift) · Built by the Hanfani ecosystem.

Upload a PDF/image (or URL), pick or design a schema, get **Fields** / **Plain text** /
**JSON** with copy + download. Bilingual UI (EN / FR).

## Stack

- **Frontend:** Vite + React + TypeScript
- **Backend:** tiny Node server (Hono) — API keys stay on the server
- **Default model:** DeepSeek V4 (Anthropic-compatible API) via `DEEPSEEK_API_KEY`
- **Vision (optional):** Claude via `ANTHROPIC_API_KEY` or BYOK
- **PDF engine:** `@firecrawl/pdf-inspector` (classify + Markdown, no OCR tax)

## Layout

```
doc-extractor/
  index.html            Vite entry
  vite.config.ts        dev server + /api proxy → backend
  server/
    index.ts            Hono server: POST /api/extract, GET /api/v1/extract (+ serves dist in prod)
    extract.ts          builds the Claude request, parses the cited extraction
    public-extract.ts   URL-only public API request builder
    openapi.ts          OpenAPI 3.1 spec for the public surface
  shared/types.ts       request/response contract shared by front & back
  src/
    App.tsx             state + orchestration
    ApiDocs.tsx         /api-docs public API reference
    components/         SourcePanel · SchemaPanel · Results
    lib/                api client · model catalog
    i18n.ts             EN / FR strings
    styles.css          Cabane-style palette
```

## Run it

1. Install deps:
   ```sh
   npm install
   ```
2. Give the backend a DeepSeek key (never commit it):
   ```sh
   cp .env.example .env
   # edit .env → DEEPSEEK_API_KEY=sk-...
   # optional for Claude vision: ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Start frontend + backend together:
   ```sh
   npm run dev
   ```
   Open http://localhost:5173 . The Vite dev server proxies `/api` to the Node
   backend on :8787.

## Tests

```sh
npm test          # Vitest unit suite (providers, public API, cache, pricing, …)
npm run test:watch
```

## Production

```sh
npm run build     # tsc typecheck + vite build → dist/
npm start         # Node serves dist/ + /api on :8787 (NODE_ENV=production)
```

## Public API

URL-only extract (supported: PDF, JPG, JPEG, PNG, WEBP):

```sh
curl -sS "http://localhost:8787/api/v1/extract?url=https://example.com/invoice.pdf&model=deepseek-v4-flash&max_tokens=4000"
```

Optional query params: `model` (`deepseek-v4-flash` default | `deepseek-v4-pro` | `claude-sonnet-4-6` | `claude-haiku-4-5` | `claude-opus-4-8`), `max_tokens` (256–16000, default 8000).

Human docs: [http://localhost:5173/api-docs](http://localhost:5173/api-docs) · OpenAPI: `/api/openapi.json`.

## Notes / v1 scope

- **DeepSeek** is text-only: text-based / mixed PDFs with a native text layer work via
  local Markdown. Scanned PDFs and images need a **Claude** model (`ANTHROPIC_API_KEY` or BYOK).
- **Bring-your-own-key** supports **DeepSeek** and **Anthropic**. OpenAI / Google / Mistral
  appear in the picker but return "not wired up yet" for now.
- Structured output uses **forced tool-use** (`tool_choice: emit_extraction`) for
  version-stable JSON. The output schema lives in `server/extract.ts` (`OUTPUT_SCHEMA`).
- The document reader supports zoom + rotate; PDFs render page-by-page (pdf.js) so
  **Locate** can highlight a field’s bounding box on the page.
- Per-field **Locate** uses normalized `bbox` coordinates returned by the model.
- **Export** from the results toolbar: Cabane (`.md`), Notion (`.md`), Google Sheets (`.csv`).
