# AI Assisted Writing Workspace

A powerful, modern AI-assisted writing application built with **React + Vite** (frontend) and **Express + Groq SDK** (backend). This project allows writers to draft content, highlight specific sections for targeted AI modifications (Summarize, Expand, Shorten, Fix Grammar), preview differences, and chat with an interactive writing assistant.

---

## Architecture Flow

The application executes AI operations via a secure backend proxy to protect API keys:

```text
Browser (React App)
   ↓ (Sends payload to /api/transform or /api/chat)
Application Backend (Express Server)
   ↓ (Injects GROQ_API_KEY & System Persona)
AI Provider (Groq API)
```

---

## Features

### 📝 Core Writing Workspace
* **Integrated Text Editor**: Simple, lightweight writing area with inline word/character counting and helpers.
* **Granular Text Selection**: Highlight any word, sentence, or paragraph to trigger localized, selection-specific AI actions.
* **AI Transformation Menu**:
  * **Summarize**: Condense selected text while preserving key information.
  * **Expand**: Add descriptive details and context without inventing speculative facts.
  * **Shorten**: Trim unnecessary wordiness while keeping the core meaning.
  * **Fix Grammar**: Polish grammar, spelling, readability, and phrasing while maintaining the author's tone.
* **AI Suggestion Preview**: View the original selected text and suggested AI output side-by-side.
* **Safe Replacement**: Commits suggested text only if the editor content at those indices hasn't changed since the request was sent.
* **Cancel / Discard**: Easily reject suggestions and resume writing.

### 💬 Interactive AI Assistant
* **Workspace Chat Sidebar**: A side-by-side interactive panel on desktop, stacking vertically on mobile.
* **Session Conversation History**: Maintains multi-turn context (e.g., follow-up queries like "Make the second one more professional").
* **Smart Insertion**: One-click **Insert into Editor** button next to assistant responses to paste suggestions directly at your editor's cursor position or append them to the end of the text.

---

## Tech Stack

* **Frontend**: React 18, Vite 5, Axios, Vanilla CSS
* **Backend**: Node.js, Express, Groq SDK
* **AI Engine**: Groq API using the `llama-3.3-70b-versatile` model

---

## Setup & Running Locally

### Prerequisites
* Node.js (v18+)
* A Groq API Key

### 1. Environment Variables Configuration
Create a `.env` file inside the `server/` directory:
```env
GROQ_API_KEY=your_groq_api_key_here
PORT=5001
GROQ_MODEL=llama-3.3-70b-versatile
```

### 2. Run the Express Backend
```bash
cd server
npm install
npm start
# Backend starts on http://localhost:5001
```

### 3. Run the Vite Frontend Client
```bash
cd client
npm install
npm run dev
# Frontend starts on http://localhost:5173 (Proxies /api calls to port 5001)
```

---

## Verification & Testing

Verify the safe text replacement algorithm using the built-in Node assertion test suite:
```bash
node client/src/utils/replace.test.js
```

---

## Design Decisions

### 1. Editor Choice
Instead of introducing bloated libraries like Slate, Lexical, or Quill, we utilized a standard HTML5 `<textarea>`. It provides highly reliable cursor tracking, minimal load latency, and fits the simple draft-writing MVP perfectly.

### 2. Selection Tracking
Selection offsets are captured by binding `onSelect`, `onKeyUp`, `onMouseUp`, and `onChange` events to the `<textarea>`. We capture `selectionStart`, `selectionEnd`, and `selectedText` using a React `useRef`.

### 3. Locking Selection Coordinates
To solve the race-condition where a user keeps typing or clicking elsewhere *while* the AI API request is loading, we lock the coordinates `selectionStart` and `selectionEnd` immediately when a button is clicked, passing those static indices to the preview container.

### 4. Safe Replacement Strategy
To prevent stale AI recommendations from modifying the wrong content, we compare `text.substring(start, end)` with `originalSelectedText` before applying string slicing:
```javascript
const updatedText = fullText.slice(0, start) + replacement + fullText.slice(end);
```
If a mismatch is found, we cancel the overwrite and warn the user.

### 5. Chat History & Memory
Multi-turn conversations are handled by maintaining a transient state array `messages` inside the React parent component. When posting to `/api/chat`, this history array is submitted, enabling context-aware assistant responses.

---

## Trade-offs & Limitations

* **Session-Only Persistence**: Document state and chat logs are stored inside the transient React state. Refreshing the tab will reset the editor and chat logs.
* **Basic Text Formatting**: The `<textarea>` editor does not support rich text formats (like bold, italics, or headers).
* **Network Failures**: In the event of a network outage, requests fail gracefully and present instructions for starting the local server.
