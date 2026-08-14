import axios from 'axios';

// Single API layer for all client requests.
// Supports passing AbortSignal to cancel pending requests.

export const transformText = async (action, text, tone = 'default', signal = null) => {
  const { data } = await axios.post('/api/transform', { action, text, tone }, { signal });
  return data.suggestion;
};

export const sendChatMessage = async (messages, signal = null) => {
  const { data } = await axios.post('/api/chat', { messages }, { signal });
  return data.response;
};