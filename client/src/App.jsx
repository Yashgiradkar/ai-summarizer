import { useState } from 'react';
import { summarizeText } from './api';

export default function App() {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSummarize = async () => {
    if (!text.trim()) {
      setError('Please enter some text to summarize.');
      return;
    }

    setLoading(true);
    setError('');
    setSummary('');

    try {
      const summaryResult = await summarizeText(text);
      setSummary(summaryResult);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="gradient-text">AI Summarizer</h1>
        <p className="tagline">Condense your text into a clear, concise summary instantly.</p>
      </header>

      <main className="app-main">
        <div className="card">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here (minimum 30 characters recommended)..."
            rows={8}
            disabled={loading}
          />
          
          <div className="action-row">
            <button
              onClick={handleSummarize}
              disabled={loading || !text.trim()}
              className="btn btn-primary"
            >
              {loading ? 'Summarizing...' : 'Summarize'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-box">
            <p>{error}</p>
          </div>
        )}

        {summary && (
          <div className="card result-card animate-fadeIn">
            <h2>Summary</h2>
            <div className="divider" />
            <p className="summary-text">{summary}</p>
          </div>
        )}
      </main>
    </div>
  );
}