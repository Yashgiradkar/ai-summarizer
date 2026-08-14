import axios from 'axios';

export const summarizeText = async (text) => {
  const { data } = await axios.post('/api/summarize', { text });
  return data.summary;
};

export const transformText = async (action, text) => {
  const { data } = await axios.post('/api/transform', { action, text });
  return data.suggestion;
};

export const sendChatMessage = async (messages) => {
  const { data } = await axios.post('/api/chat', { messages });
  return data.response;
};