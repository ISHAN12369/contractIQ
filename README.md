# T&C Analyzer 📄🤖

> Understand any terms & conditions, contract, or legal agreement in plain English — instantly.

**Live Demo:** [your-app.vercel.app](https://your-app.vercel.app) <!-- update after deploy -->

---

## What it does

Upload any legal document (PDF, DOCX, TXT) or paste raw text, then ask questions like:

- *"What happens if I cancel early?"*
- *"Which party takes on the most liability?"*
- *"Is there an auto-renewal clause?"*
- *"Summarize this in plain English"*
- *"Are there any unfair or one-sided clauses?"*

The AI reads the entire document and answers in simple, plain language — no legalese.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| AI Model | Mistral-7B-Instruct via HuggingFace Inference API |
| PDF parsing | `pdf-parse` |
| DOCX parsing | `mammoth` |
| Deployment | Vercel |

**Zero backend infrastructure** — all API calls proxied through Next.js API routes. Users bring their own free HuggingFace API key (stored only in their browser's localStorage).

---

## Getting Started

### 1. Clone

```bash
git clone https://github.com/yourusername/tnc-analyzer.git
cd tnc-analyzer
npm install
```

### 2. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Get a free HuggingFace API key

1. Go to [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Create a new token (free — no credit card)
3. Paste it into the app's "Add API Key" field

---

## Deploy to Vercel (one click)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/tnc-analyzer)

Or manually:

```bash
npm i -g vercel
vercel
```

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # Proxies questions to HuggingFace
│   │   └── extract/route.ts     # Extracts text from PDF/DOCX/TXT
│   ├── page.tsx                 # Main UI
│   ├── layout.tsx               # Root layout + metadata
│   └── globals.css
├── lib/
│   └── huggingface.ts           # HuggingFace API client + prompt builder
```

---

## Privacy

- Documents are **never stored** anywhere — processed in memory only
- API keys are stored **only in the user's browser** (localStorage)
- The only external service called is the HuggingFace Inference API

---

## License

MIT — use it, fork it, build on it.
