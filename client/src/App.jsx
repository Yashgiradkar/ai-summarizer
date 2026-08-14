import { useState, useRef, useEffect } from 'react';
import { transformText, sendChatMessage } from './api';
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

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Sync cursor selection offsets & selected text content
  const handleTextSelect = () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    setSelectionStart(selectionStart);
    setSelectionEnd(selectionEnd);
    setSelectedText(value.substring(selectionStart, selectionEnd));
  };

  // Scroll chat messages thread to bottom on update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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

  // Handle submitting user message to chat assistant
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user', content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMessage];

    setChatMessages(updatedMessages);
    setChatInput('');
    setChatLoading(true);
    setChatError('');

    try {
      const responseText = await sendChatMessage(updatedMessages);
      setChatMessages([...updatedMessages, { role: 'assistant', content: responseText }]);
    } catch (err) {
      setChatError(err.response?.data?.error || err.message || 'Failed to send message. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  // Insert AI assistant reply at the current editor cursor position or append it
  const handleInsertResponse = (responseText) => {
    let newText = '';
    let newCursorPos = 0;

    if (text.length === 0) {
      newText = responseText;
      newCursorPos = responseText.length;
    } else {
      const isCursorAtStart = selectionStart === 0 && selectionEnd === 0;
      if (isCursorAtStart) {
        // Default behavior: append text to the end of editor
        newText = text + '\n\n' + responseText;
        newCursorPos = newText.length;
      } else {
        // Insert / replace at user selection bounds
        newText = text.slice(0, selectionStart) + responseText + text.slice(selectionEnd);
        newCursorPos = selectionStart + responseText.length;
      }
    }

    setText(newText);
    setSelectionStart(newCursorPos);
    setSelectionEnd(newCursorPos);

    // Refocus the textarea and update selection points
    textareaRef.current?.focus();
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
      }
    }, 10);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="gradient-text">AI Writing Workspace</h1>
        <p className="tagline">Compose text and refine sections instantly with AI assistance.</p>
      </header>

      <main className="app-main">
        <div className="workspace-grid">
          {/* Left Column: Writing Area */}
          <div className="editor-section">
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
                rows={12}
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
          </div>

          {/* Right Column: AI Chat Panel */}
          <div className="chat-section">
            <div className="card chat-card">
              <h2>AI Assistant</h2>
              <div className="divider" />

              <div className="chat-messages">
                {chatMessages.length === 0 ? (
                  <div className="chat-placeholder">
                    <span>💬</span>
                    <p>Ask the assistant to draft outlines, generate titles, brainstorm ideas, or review your text.</p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`message-bubble message-${msg.role}`}
                    >
                      <div className="message-text">{msg.content}</div>
                      {msg.role === 'assistant' && (
                        <div className="message-actions">
                          <button
                            type="button"
                            onClick={() => handleInsertResponse(msg.content)}
                            className="btn-inline"
                          >
                            📥 Insert into Editor
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {chatError && (
                <div className="error-box animate-fadeIn" style={{ marginBottom: '0.75rem', padding: '0.75rem' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>{chatError}</p>
                </div>
              )}

              <form onSubmit={handleSendChatMessage} className="chat-input-row">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={chatLoading ? 'Thinking...' : 'Ask the assistant...'}
                  className="chat-input"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="btn btn-primary"
                  style={{ padding: '0.75rem 1.25rem' }}
                >
                  {chatLoading ? 'Sending...' : 'Send'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}