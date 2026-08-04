import axios from 'axios';

export const summarizeText = async (text) => {
  const { data } = await axios.post('/api/summarize', { text });
  return data.summary;
};