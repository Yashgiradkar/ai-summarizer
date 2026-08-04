# AI Summarizer

A basic, foundational AI-powered text summarization web app built with **React + Vite** (frontend) and **Express + Google Gemini** (backend).

## Features
- ⚡ **Basic Summarization** — Send text to Gemini and receive a clear, concise summary instantly.


## Tech Stack
| Layer    | Tech                          |
|----------|-------------------------------|
| Frontend | React 18, Vite, CSS           |
| Backend  | Node.js, Express              |
| AI       | Google Gemini 2.0 Flash       |
| HTTP     | Axios                         |

## Project Structure
```
ai-summarizer/
├── server/                 ← Express API
│   ├── server.js           ← Entry point & middleware
│   ├── routes/ai.js        ← POST /api/summarize
│   └── .env                ← GOOGLE_API_KEY, PORT
│
└── client/                 ← React + Vite frontend
    ├── vite.config.js      ← Proxies /api → backend
    └── src/
        ├── api.js          ← API layer
        ├── App.jsx         ← UI and state management
        ├── index.css       ← Main CSS layout
        └── main.jsx        ← React entrypoint
```

## Getting Started

### 1. Backend
```bash
cd server
npm install
cp .env.example .env
npm start
# Server runs on http://localhost:5001
```

### 2. Frontend
```bash
cd client
npm install
npm run dev
# App runs on http://localhost:5173 
```

## API Reference

### `POST /api/summarize`
**Body:**
```json
{ "text": "..." }
```
**Response:**
```json
{ "summary": "..." }
```
