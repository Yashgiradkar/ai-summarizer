import express from 'express';
import Groq from 'groq-sdk';

const router = express.Router();

let ai = null;

const getAI = () => {
  if (ai) {
    return ai;
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured.');
  }

  ai = new Groq({
    apiKey,
  });

  return ai;
};

router.post('/transform', async (req, res) => {
  try {
    const { action, text } = req.body;

    // Validate input
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Text is required for transformation.',
      });
    }

    const validActions = ['summarize', 'expand', 'shorten', 'fix_grammar'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
      });
    }

    const cleanedText = text.trim();

    // Prompts matching requirements
    const prompts = {
      summarize: `You are an expert editor. Make the selected text concise while preserving the key information. Omit examples, anecdotes, and redundant information. Do not include any information not present in the original text. Output only the summarized text, nothing else.`,
      expand: `You are an expert editor. Add meaningful detail to the selected text while maintaining the original context and meaning. Do not invent unsupported or speculative facts. Output only the expanded text, nothing else.`,
      shorten: `You are an expert editor. Make the selected text more concise while preserving its main meaning. Output only the shortened text, nothing else.`,
      fix_grammar: `You are an expert editor. Correct any grammar, spelling, punctuation, awkward phrasing, and readability issues in the selected text. Do not unnecessarily rewrite the author's message or change their tone. Output only the corrected text, nothing else.`
    };

    const systemPrompt = prompts[action];
    const aiInstance = getAI();
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    const response = await aiInstance.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: cleanedText,
        },
      ],
    });

    const suggestion = response.choices?.[0]?.message?.content?.trim();

    if (!suggestion) {
      console.error('Groq returned an empty transform response.');
      return res.status(502).json({
        error: 'The AI returned an empty response. Please try again.',
      });
    }

    return res.status(200).json({
      suggestion,
    });
  } catch (err) {
    console.error('[/api/transform error]', err);

    if (err?.status === 429 || err?.code === 429) {
      return res.status(429).json({
        error: 'Groq API rate limit or quota exceeded. Please try again later.',
      });
    }

    if (err?.status === 401 || err?.code === 401) {
      return res.status(401).json({
        error: 'Groq API authentication failed. Please check your GROQ_API_KEY.',
      });
    }

    return res.status(500).json({
      error: 'Failed to transform text. Please try again.',
    });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // Validate input
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'Messages history array is required.',
      });
    }

    // Validate each message format
    for (const msg of messages) {
      if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
        return res.status(400).json({
          error: 'Invalid message structure. Each message needs a role and content.',
        });
      }
    }

    const aiInstance = getAI();
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    const systemMessage = {
      role: 'system',
      content: 'You are a helpful and concise AI writing assistant. Help the user edit, write, brainstorm, or refine text. Keep your responses clear, helpful, and direct. Avoid unnecessary conversational fluff unless specifically requested.',
    };

    // Prepend system prompt to conversation context
    const fullMessages = [systemMessage, ...messages];

    const response = await aiInstance.chat.completions.create({
      model,
      temperature: 0.7,
      messages: fullMessages,
    });

    const reply = response.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      console.error('Groq returned an empty response for chat.');
      return res.status(502).json({
        error: 'The AI assistant failed to respond. Please try again.',
      });
    }

    return res.status(200).json({
      response: reply,
    });
  } catch (err) {
    console.error('[/api/chat error]', err);

    if (err?.status === 429 || err?.code === 429) {
      return res.status(429).json({
        error: 'Groq API rate limit or quota exceeded. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'Chat assistant error. Please try again.',
    });
  }
});

router.post('/summarize', async (req, res) => {
  try {
    const { text } = req.body;

    // Validate input
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        error: 'Text is required.',
      });
    }

    const cleanedText = text.trim();
    const wordCount = cleanedText.split(/\s+/).length;
    let maxWords;

    if (wordCount <= 100) {
      maxWords = 35;
    } else if (wordCount <= 300) {
      maxWords = 60;
    } else if (wordCount <= 700) {
      maxWords = 90;
    } else {
      maxWords = 120;
    }

    const aiInstance = getAI();
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    // Generate summary
    const response = await aiInstance.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You are an expert summarizer. Create a concise summary of the following text in ${maxWords} words or less. Focus on the main ideas and key points. Omit examples, anecdotes, and redundant information. Do not include any information not present in the original text. Output only the summary text, nothing else.`.trim(),
        },
        {
          role: 'user',
          content: cleanedText,
        },
      ],
    });

    const summary = response.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      console.error('Groq returned an empty response.');
      return res.status(502).json({
        error: 'The AI returned an empty response. Please try again.',
      });
    }

    return res.status(200).json({
      summary,
    });
  } catch (err) {
    console.error('[/api/summarize error]', err);
    return res.status(500).json({
      error: 'Failed to generate summary. Please try again.',
    });
  }
});

export default router;