import express from 'express';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();

let ai;
const getAI = () => {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }
  return ai;
};

// ── POST /api/summarize ──────────────────────────────────────────────────────
router.post('/summarize', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required.' });
    }

    const aiInstance = getAI();
    const response = await aiInstance.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Summarize the following text:\n\n${text.trim()}`,
    });

    const summary = response.text?.trim();

    if (!summary) {
      return res.status(502).json({ error: 'The AI returned an empty response. Please try again.' });
    }

    return res.json({ summary });
  } catch (err) {
    console.error('[/api/summarize error]', err);
    return res.status(500).json({ error: 'Failed to generate summary. Please try again.' });
  }
});

export default router;
