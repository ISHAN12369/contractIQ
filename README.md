# ContractIQ 📄✨

> **ContractIQ** is a premium, high-fidelity real estate contract auditing tool. Redesigned with a bold, kinetic brutalist layout inspired by the `wonjyou.studio` design system, it alternates between pitch-black and warm cream themes with dynamic text masking, scrolling marquees, and a custom mouse cursor.

Understand lease agreements, purchase deeds, and legal terms instantly—in plain English—using HuggingFace-powered AI.

---

## 🎨 Key Features

- **wonjyou.studio Aesthetic**: Rich, high-contrast panels, uppercase kinetic typography, and unique mouse tracking effects.
- **Widescreen Responsive Grid**: Layout elements stretch dynamically to utilize 95% of screen width.
- **AI Balance Scorecard**: Automatically parses the contract to extract the top benefits for both parties, plotting them as interactive gradient-filled bar graphs.
- **Connect Benefit Links**: Under-graph text link indices that instantly focus and scroll to the matching clause.
- **Frosted Glass Contract Viewer**: A collapsible bottom console (`backdrop-filter: blur(16px)`) displaying relevant key clauses that dynamically highlights active selections.
- **Privacy First**: Files are parsed in-memory (no databases), and HuggingFace API tokens are stored strictly in client-side localStorage.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | Vanilla CSS + Tailwind configuration |
| **Icons** | Lucide React |
| **AI Model** | Mistral-7B-Instruct (via HuggingFace Inference API) |
| **Parsing Engine** | `pdf-parse` (PDF) & `mammoth` (DOCX) |

---

## 💻 Getting Started

### 1. Clone & Setup

```bash
git clone https://github.com/ISHAN12369/contractIQ.git
cd contractIQ
npm install
```

### 2. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Add API Token

1. Create a free API token on [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
2. Click the **"API Key Setup »"** badge on the left navigation sidebar.
3. Paste the token and click **Save**.

---

## ☁️ Deployment

### 1-Click Deployment (Recommended)

Vercel is the native host for Next.js, compiling your API functions automatically.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ISHAN12369/contractIQ)

### Manual Deployment

```bash
npm i -g vercel
vercel
```

---

## 📂 Project Structure

```
contractIQ/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts      # Queries HuggingFace
│   │   │   └── extract/route.ts   # Parses PDF/DOCX uploads
│   │   ├── page.tsx               # Main visual template
│   │   ├── layout.tsx             # Document head & Outfit/Inter font imports
│   │   └── globals.css            # Custom cursor, scrolling ticker, frosted glass styles
│   └── lib/
│       └── huggingface.ts         # LLM prompt builder
├── package.json
└── tailwind.config.js
```

---

## 🔒 Privacy & Terms

- Documents are parsed strictly in serverless memory. **Zero data persistence**.
- No telemetry, analytics trackers, or third-party cookies.
- Direct connections from your browser/serverless route to HuggingFace.

---

## 📄 License

MIT License — feel free to fork, modify, and utilize.
