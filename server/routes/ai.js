import express from 'express';
import Groq from 'groq-sdk';

const router = express.Router();
let ai = null;

const getAI = () => {
  if (ai) return ai;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured.');
  }
  ai = new Groq({ apiKey });
  return ai;
};

// ── GET /api/health ──────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── POST /api/transform (Streaming version) ──────────────────────────────────
router.post('/transform', async (req, res) => {
  try {
    const { action, text, tone = 'default' } = req.body;

    // Validate inputs
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required for transformation.' });
    }

    if (text.length > 50000) {
      return res.status(400).json({ error: 'Payload is too large. Selected text must be under 50,000 characters.' });
    }

    const validActions = ['summarize', 'expand', 'shorten', 'fix_grammar'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    const validTones = ['default', 'professional', 'casual', 'creative'];
    if (tone && !validTones.includes(tone)) {
      return res.status(400).json({ error: `Invalid tone. Must be one of: ${validTones.join(', ')}` });
    }

    const cleanedText = text.trim();

    const prompts = {
      summarize: `You are an expert editor. Make the selected text concise while preserving the key information. Omit examples, anecdotes, and redundant information. Do not include any information not present in the original text. Output only the summarized text, nothing else.`,
      expand: `You are an expert editor. Add meaningful detail to the selected text while maintaining the original context and meaning. Do not invent unsupported or speculative facts. Output only the expanded text, nothing else.`,
      shorten: `You are an expert editor. Make the selected text more concise while preserving its main meaning. Output only the shortened text, nothing else.`,
      fix_grammar: `You are an expert editor. Correct any grammar, spelling, punctuation, awkward phrasing, and readability issues in the selected text. Do not unnecessarily rewrite the author's message or change their tone. Output only the corrected text, nothing else.`
    };

    let systemPrompt = prompts[action];
    if (tone && tone !== 'default') {
      systemPrompt += ` Rewrite the output using a ${tone} tone.`;
    }

    const aiInstance = getAI();
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await aiInstance.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: cleanedText },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[/api/transform error]', err);
    // If headers already sent, write error info to the stream, otherwise send JSON status
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message || 'Stream processing failed.' })}\n\n`);
      res.end();
    } else {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Failed to transform text.' });
    }
  }
});

// ── POST /api/chat (Streaming version) ───────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages history array is required.' });
    }

    for (const msg of messages) {
      if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
        return res.status(400).json({ error: 'Invalid message structure. Each message needs a role and content.' });
      }
      if (msg.content.length > 10000) {
        return res.status(400).json({ error: 'Message content exceeds the 10,000 character limit.' });
      }
    }

    const aiInstance = getAI();
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    const systemMessage = {
      role: 'system',
      content: 'You are a helpful and concise AI writing assistant. Help the user edit, write, brainstorm, or refine text. Keep your responses clear, helpful, and direct. Avoid unnecessary conversational fluff unless specifically requested.',
    };

    const fullMessages = [systemMessage, ...messages];

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await aiInstance.chat.completions.create({
      model,
      temperature: 0.7,
      messages: fullMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[/api/chat error]', err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message || 'Stream processing failed.' })}\n\n`);
      res.end();
    } else {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Chat assistant error.' });
    }
  }
});

export default router;