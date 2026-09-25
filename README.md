# Sift

**Turn a document into structured fields — and keep the receipt.** Every value comes back
with the exact sentence it was read from and a box on the page showing where. A model that
just returns `"total": "$1,240.00"` asks you to trust it; a wrong answer here is one click
from being caught.

No signup, no account, your own keys. **[Try it →](https://fruitizz.github.io/hanfani-sift/)**
*(hosted demo runs in your browser — upload, preview, design a schema. The model call needs
a backend, so clone it for the full loop.)*

[![MIT](https://img.shields.io/badge/license-MIT-4a154b)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/fruitizz/hanfani-sift?style=social)](https://github.com/fruitizz/hanfani-sift)

---

## API

### `GET /api/v1/extract` — one call, no signup

```sh
curl -sS "http://localhost:8787/api/v1/extract?url=https://example.com/invoice.pdf"
```

No caller signup and no token — but no hosted endpoint either: point it at your own
instance ([Run it](#run-it)) or your own deployment.

| Param | | |
| --- | --- | --- |
| `url` | **required** | public URL ending in `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp` |
| `model` | optional | `deepseek-v4-flash` *(default)* · `deepseek-v4-pro` · `claude-sonnet-4-6` · `claude-haiku-4-5` · `claude-opus-4-8` |
| `max_tokens` | optional | 256–16000, default 8000 |

```jsonc
{
  "documentType": "invoice",
  "fields": [{
    "key": "total_due",
    "value": "$1,240.00",
    "source": "Total due $1,240.00",              // the sentence it came from
    "confidence": "high",
    "bbox": { "x": 0.59, "y": 0.57, "w": 0.24, "h": 0.02, "page": 1 }
  }],
  "plainText": "…",
  "json": { "total_due": { "value": "$1,240.00", "…": "…" } }   // same fields, keyed
}
```

`bbox` is normalized 0–1, top-left origin — drop it onto a rendered page at any zoom.
Errors are `{ "error": "…" }` with a 4xx/5xx status.

### `POST /api/extract` — uploads and custom schemas

`{ source, docType, schema, model }`: base64 uploads, your own JSON Schema, a per-request
BYOK key. Contract in [`shared/types.ts`](shared/types.ts).

### Spec

`GET /api/openapi.json` (OpenAPI 3.1) · reference at
[`/api-docs`](https://fruitizz.github.io/hanfani-sift/api-docs) · `GET /api/health`.

---

## Run it

```sh
npm install
cp .env.example .env     # DEEPSEEK_API_KEY=sk-…  (ANTHROPIC_API_KEY for scans)
npm run dev              # SPA on :5173, API on :8787
```

`npm test` · `npm run typecheck` · `npm run build` + `npm start` for production.

## How it works

A text PDF never pays a vision tax: `@firecrawl/pdf-inspector` classifies it and extracts
Markdown **locally**, then an open-source model fills your schema from that text. Only
scans and images reach a vision model. Two guards keep it honest:

- **The extractor is cross-checked** — it can return mangled text while reporting full
  confidence, so its Markdown is compared against pdf.js's independent reading of the same
  bytes ([`shared/text-fidelity.ts`](shared/text-fidelity.ts)).
- **Locate snaps to the page, not to the model** — quotes are matched against the real PDF
  text layer and the box is cut to the matched characters
  ([`src/lib/locate-pdf.ts`](src/lib/locate-pdf.ts)).

Vite + React + TypeScript, a small Hono server that holds the keys, pdf.js for the preview.

## Deploy

**GitHub Pages** — `npm run build:pages`; the workflow tests and publishes on every push to
`main` (everything works except the model call). **Any container host** — the `Dockerfile`
serves the SPA and `/api` from one Node process; give it `DEEPSEEK_API_KEY`, it reads `PORT`.

## Limits

DeepSeek is **text-only** — scans and images need a Claude model (`ANTHROPIC_API_KEY`, or
BYOK per request). BYOK covers DeepSeek and Anthropic; OpenAI, Google and Mistral are in
the picker but return "not wired up yet".

MIT · built by the [Hanfani ecosystem](https://github.com/fruitizz).
