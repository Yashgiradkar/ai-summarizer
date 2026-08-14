// Stream-capable API layer for the client.
// Reads text chunks incrementally using browser's ReadableStream Reader.

const readStream = async (response, onChunk) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the incomplete line in the buffer

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned.startsWith('data: ')) continue;

        const dataPayload = cleaned.slice(6);
        if (dataPayload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataPayload);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text) {
            onChunk(parsed.text);
          }
        } catch (err) {
          console.warn('Malformed stream payload:', dataPayload, err);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

/**
 * Stream text transformation suggestion from the backend.
 * @param {string} action - Action type
 * @param {string} text - Selected input text
 * @param {string} tone - Tone modifier
 * @param {function} onChunk - Callback triggered on each new text chunk
 * @param {AbortSignal} signal - Optional abort signal
 */
export const streamTransformText = async (action, text, tone = 'default', onChunk, signal = null) => {
  const response = await fetch('/api/transform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, text, tone }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server error (${response.status})`);
  }

  await readStream(response, onChunk);
};

/**
 * Stream chat assistant responses from the backend.
 * @param {array} messages - Full chat conversation context
 * @param {function} onChunk - Callback triggered on each response text chunk
 * @param {AbortSignal} signal - Optional abort signal
 */
export const streamChatMessage = async (messages, onChunk, signal = null) => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server error (${response.status})`);
  }

  await readStream(response, onChunk);
};