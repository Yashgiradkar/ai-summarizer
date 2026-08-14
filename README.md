# AI-Assisted Writing Workspace

A browser-based, AI-powered writing studio where writers can draft content, highlight sections for targeted AI operations (Summarize, Expand, Shorten, Fix Grammar), preview transformations, chat with an AI writing assistant, and manage multiple drafts. 

This project integrates real-time Server-Sent Events (SSE) token streaming, robust client-side cancellation, local database persistence, and an analytics dashboard.

---

## 🚀 Features

### 📝 Core Editor & AI Text Actions
* **Multi-Document Sidebar**: Create, switch, rename, and delete drafts. All drafts auto-save to `localStorage`.
* **Selection-Targeted Operations**: Highlight any sentence or paragraph to apply localized modifications:
  * **Summarize**: Condense text while preserving key information.
  * **Expand**: Add descriptive detail and context without introducing speculative facts.
  * **Shorten**: Trim unnecessary wordiness.
  * **Fix Grammar**: Polish grammar, spelling, and phrasing while keeping your tone.
* **Tone Selector**: Apply specific tones (Default, Professional, Casual, Creative) to your transforms.
* **Side-by-Side Preview**: Inspect original text and suggested AI output side-by-side.
* **Safe Replacement**: Overwrite target text only if it has not changed since the request was sent.
* **Undo Operations**: Press `Cmd/Ctrl + Z` or click **Undo Edit** to revert the last applied suggestion.

### 💬 Chat Assistant
* **Context-Aware Sidebar**: Conversational assistant maintaining session history.
* **Smart Insertion**: One-click **Insert into Editor** to insert the response at your last cursor position or selection.
* **Response Regeneration**: Trigger `🔄 Regenerate` to re-run the last chat message or text transformation.

### ⚡ Performance & Security
* **Server-Sent Events (SSE)**: Text streams word-by-word with zero delay.
* **AbortController**: Instantly cancels pending requests if you write/click again, preventing race conditions.
* **Express Rate Limiter**: Throttles route calls to 30 requests/minute per IP to prevent API key abuse.
* **Secure Key Handling**: Keep API keys locked on the backend.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, Browser Streams API, Vanilla CSS |
| **Backend** | Node.js, Express 4, Groq SDK |
| **AI Provider** | Groq API — `llama-3.3-70b-versatile` |
| **Storage** | Client-side `localStorage` database |
| **Security** | Express Rate Limit |

---

## 📡 Architecture Summary

```text
Browser (React Client)
   ↓  POST /api/transform (JSON Payload) or /api/chat
Vite Development Proxy (Routes /api requests to port 5001)
   ↓
Express Server (Applies IP-based Rate Limiter)
   ↓  Injects GROQ_API_KEY & dynamic system prompts
Groq API (Completions Stream)
   ↓  (Sends text/event-stream chunks back to Server)
Express Server (Pipes SSE lines: data: {"text": "..."})
   ↓
Browser (Parses chunks incrementally via TextDecoder & Reader)
```

---

## 🔧 Installation & Setup

### Prerequisites
* Node.js (v18+)
* Groq API Key

### 1. Environment Variables Configuration
Create a `.env` file in the `server/` directory:
```env
GROQ_API_KEY=your_groq_api_key_here
PORT=5001
GROQ_MODEL=llama-3.3-70b-versatile
```

### 2. Start the Express Backend
```bash
cd server
npm install
npm start
# Backend starts on http://localhost:5001
```

### 3. Start the Vite Frontend Client
```bash
cd client
npm install
npm run dev
# Frontend starts on http://localhost:5173
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Enter` | Instantly runs Grammar Correction on selection |
| `Cmd/Ctrl + Z` | Reverts last applied suggestion / chat insert |
| `Cmd/Ctrl + S` | Triggers a visual draft-saved notification |

---

## 💡 Design Decisions & Trade-offs

### 1. Controlled `<textarea>` vs. Rich Text Editor
* **Decision**: We chose a standard `<textarea>` rather than a rich text editor library (such as TipTap or Lexical).
* **Trade-off**: While this prevents rich formatting (bold, italics, images), it allows highly reliable, synchronous, character-offset selection tracking. Using a DOM ref (`textareaRef.current.selectionStart`) guarantees coordinates are 100% current at click-time, bypassing React state batching delays and avoiding stale closure bugs.

### 2. Client-Side Persistence (`localStorage`)
* **Decision**: All documents, chat history, and analytics are persistent through `localStorage`.
* **Trade-off**: This eliminates database overhead, backend auth requirements, and provides instant local writes. The trade-off is session-only boundary per browser (drafts don't sync across devices or browsers).

### 3. Server-Sent Events (SSE) vs. WebSockets
* **Decision**: We implemented streaming using lightweight SSE (standard HTTP chunked transfer).
* **Trade-off**: Highly performant and simple for unidirectional text streaming, avoiding the handshake/connection overhead of WebSockets.

---

## ⚠️ Known Limitations
* **Plain Text Only**: No support for markdown preview renders, bold, or underline styles inside the writing board.
* **Browser-Lock**: Clearing browser cache or switching devices will reset saved documents and logs.
* **Single Undo Step**: The undo stack supports reverting the last change, but does not support deep branches.

---

## 🌐 Deployment
* **Backend**: Hosted on [Render](https://render.com/) or equivalent.
* **Frontend**: Hosted on [Vercel](https://vercel.com/) / [Netlify](https://www.netlify.com/).
* **Deployment Link**: [https://github.com/Yashgiradkar/ai-summarizer](https://github.com/Yashgiradkar/ai-summarizer)
