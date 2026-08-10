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

    // Calculate an appropriate summary length

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

    const model =
      process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    // Generate summary
    const response = await aiInstance.chat.completions.create({
      model,

      temperature: 0.2,

      messages: [
        {
          role: 'system',
          content: `
You are an expert summarizer. Create a concise summary of the following text in ${maxWords} words or less.
Focus on the main ideas and key points. Omit examples, anecdotes, and redundant information.
Do not include any information not present in the original text.
Output only the summary text, nothing else.
`.trim(),
        },
        {
          role: 'user',
          content: cleanedText,
        },
      ],
    });

    const summary =
      response.choices?.[0]?.message?.content?.trim();

    // Validate AI response
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

    if (err?.status === 429 || err?.code === 429) {
      return res.status(429).json({
        error:
          'Groq API rate limit or quota exceeded. Please try again later.',
      });
    }

    if (err?.status === 401 || err?.code === 401) {
      return res.status(401).json({
        error:
          'Groq API authentication failed. Please check your GROQ_API_KEY.',
      });
    }

    if (err?.status === 403 || err?.code === 403) {
      return res.status(403).json({
        error:
          'Groq API access was denied. Please check your API key and permissions.',
      });
    }

    return res.status(500).json({
      error: 'Failed to generate summary. Please try again.',
    });
  }
});

export default router;