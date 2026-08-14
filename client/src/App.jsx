import { useState, useRef } from 'react';
import { transformText } from './api';
import { replaceTextSafe } from './utils/replaceText';

export default function App() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Selection tracking state
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [selectedText, setSelectedText] = useState('');

  // Suggestion preview state
  const [suggestion, setSuggestion] = useState('');
  const [originalSelectedText, setOriginalSelectedText] = useState('');
  const [previewSelectionStart, setPreviewSelectionStart] = useState(0);
  const [previewSelectionEnd, setPreviewSelectionEnd] = useState(0);
  const [transformAction, setTransformAction] = useState('');

  const textareaRef = useRef(null);

  // Sync cursor selection offsets & selected text content
  const handleTextSelect = () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    setSelectionStart(selectionStart);
    setSelectionEnd(selectionEnd);
    setSelectedText(value.substring(selectionStart, selectionEnd));
  };

  const handleTransform = async (action) => {
    // If text has been selected, transform only the selection; otherwise full document.
    const isSelectionActive = selectedText.trim().length > 0;
    const targetText = isSelectionActive ? selectedText : text;

    if (!targetText.trim()) {
      setError(`Please select or write some text to ${action.replace('_', ' ')}.`);
      return;
    }

    setLoading(true);
    setError('');
    setSuggestion('');

    try {
      const result = await transformText(action, targetText);
      setSuggestion(result);
      setOriginalSelectedText(targetText);
      setPreviewSelectionStart(isSelectionActive ? selectionStart : 0);
      setPreviewSelectionEnd(isSelectionActive ? selectionEnd : text.length);
      setTransformAction(action);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Transformation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReplace = () => {
    const result = replaceTextSafe(
      text,
      suggestion,
      previewSelectionStart,
      previewSelectionEnd,
      originalSelectedText
    );

    if (result.success) {
      setText(result.updatedText);
      // Reset preview state
      setSuggestion('');
      setOriginalSelectedText('');
      setTransformAction('');
      setSelectedText('');
    } else {
      setError(result.error);
    }
  };

  const handleCancel = () => {
    setSuggestion('');
    setOriginalSelectedText('');
    setTransformAction('');
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="gradient-text">AI Writing Workspace</h1>
        <p className="tagline">Compose text and refine sections instantly with AI assistance.</p>
      </header>

      <main className="app-main">
        <div className="card">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleTextSelect();
            }}
            onSelect={handleTextSelect}
            onKeyUp={handleTextSelect}
            onMouseUp={handleTextSelect}
            placeholder="Type or paste your text here. Highlight any portion of the text to transform just that selection..."
            rows={10}
            disabled={loading}
          />

          <div className="selection-tip">
            {selectedText.trim() ? (
              <span>✨ <strong>Transforming selection</strong> ({selectedText.length} chars)</span>
            ) : (
              <span>💡 Select a portion of the text to transform just that section, or do not select to transform the entire document.</span>
            )}
          </div>

          <div className="transform-actions">
            <button
              onClick={() => handleTransform('summarize')}
              disabled={loading || !text.trim()}
              className="btn btn-secondary"
            >
              {loading && transformAction === 'summarize' ? 'Summarizing...' : 'Summarize'}
            </button>
            <button
              onClick={() => handleTransform('expand')}
              disabled={loading || !text.trim()}
              className="btn btn-secondary"
            >
              {loading && transformAction === 'expand' ? 'Expanding...' : 'Expand'}
            </button>
            <button
              onClick={() => handleTransform('shorten')}
              disabled={loading || !text.trim()}
              className="btn btn-secondary"
            >
              {loading && transformAction === 'shorten' ? 'Shortening...' : 'Shorten'}
            </button>
            <button
              onClick={() => handleTransform('fix_grammar')}
              disabled={loading || !text.trim()}
              className="btn btn-secondary"
            >
              {loading && transformAction === 'fix_grammar' ? 'Fixing...' : 'Fix Grammar'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-box animate-fadeIn">
            <p>{error}</p>
          </div>
        )}

        {suggestion && (
          <div className="card preview-container animate-fadeIn">
            <div className="preview-header">
              <h2 className="preview-title">
                AI Suggestion ({transformAction.replace('_', ' ')})
              </h2>
            </div>
            <div className="preview-split">
              <div className="preview-box">
                <div className="preview-label">Original Text</div>
                <p className="preview-text">{originalSelectedText}</p>
              </div>
              <div className="preview-box">
                <div className="preview-label">Suggested Version</div>
                <p className="preview-text">{suggestion}</p>
              </div>
            </div>
            <div className="preview-actions">
              <button onClick={handleCancel} className="btn btn-secondary" disabled={loading}>
                Cancel
              </button>
              <button onClick={handleReplace} className="btn btn-primary" disabled={loading}>
                Replace Text
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}