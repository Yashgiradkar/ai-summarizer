import { useState, useRef, useEffect, useCallback } from 'react';
import { transformText, sendChatMessage } from './api';
import { replaceTextSafe } from './utils/replaceText';

export default function App() {
  // ── 1. Document Draft State (Auto-save) ────────────────────────────────────
  const [text, setText] = useState(() => {
    return localStorage.getItem('ai_writing_workspace_draft') || '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── 2. Selection Coordinates & Stale Closure Ref ───────────────────────────
  // We keep a state for reactive selection UI highlighting
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  
  // Track last selection on focus loss to restore cursor position accurately
  const lastSelectionRef = useRef({ start: 0, end: 0 });

  // ── 3. Undo Stack ──────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState([]);

  // ── 4. Tone Selector ───────────────────────────────────────────────────────
  const [tone, setTone] = useState('default');

  // ── 5. Suggestion Preview State ────────────────────────────────────────────
  const [suggestion, setSuggestion] = useState('');
  const [originalSelectedText, setOriginalSelectedText] = useState('');
  const [previewSelectionStart, setPreviewSelectionStart] = useState(0);
  const [previewSelectionEnd, setPreviewSelectionEnd] = useState(0);
  const [transformAction, setTransformAction] = useState('');

  // ── 6. Chat Assistant State ────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  // ── 7. DOM Refs & Request Aborters ─────────────────────────────────────────
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const transformAbortRef = useRef(null);
  const chatAbortRef = useRef(null);

  // Auto-save draft on modification
  useEffect(() => {
    localStorage.setItem('ai_writing_workspace_draft', text);
  }, [text]);

  // Sync cursor selection offsets & selected text content
  const handleTextSelect = () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    
    // Save to React state for UI triggers
    setSelectionStart(selectionStart);
    setSelectionEnd(selectionEnd);
    setSelectedText(value.substring(selectionStart, selectionEnd));
    
    // Lock in Ref to avoid stale focus loss when clicking panel items
    lastSelectionRef.current = { start: selectionStart, end: selectionEnd };
  };

  // Scroll chat messages thread to bottom on update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Clean up aborted requests on component unmount
  useEffect(() => {
    return () => {
      transformAbortRef.current?.abort();
      chatAbortRef.current?.abort();
    };
  }, []);

  // ── AI Transform Handler ───────────────────────────────────────────────────
  const handleTransform = async (action) => {
    if (!textareaRef.current) return;

    // Resolve selection directly from the DOM to avoid async React state batching delays
    const el = textareaRef.current;
    const currentStart = el.selectionStart;
    const currentEnd = el.selectionEnd;
    const currentVal = el.value;
    
    const highlighted = currentVal.substring(currentStart, currentEnd);
    const isSelectionActive = highlighted.trim().length > 0;
    
    const targetText = isSelectionActive ? highlighted : currentVal;
    const start = isSelectionActive ? currentStart : 0;
    const end = isSelectionActive ? currentEnd : currentVal.length;

    if (!targetText.trim()) {
      setError(`Please select or write some text to ${action.replace('_', ' ')}.`);
      return;
    }

    // Abort any existing in-flight transform request
    transformAbortRef.current?.abort();
    transformAbortRef.current = new AbortController();

    setLoading(true);
    setError('');
    setSuggestion('');

    try {
      const result = await transformText(action, targetText, tone, transformAbortRef.current.signal);
      setSuggestion(result);
      setOriginalSelectedText(targetText);
      setPreviewSelectionStart(start);
      setPreviewSelectionEnd(end);
      setTransformAction(action);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        // Silent catch for user aborts
        return;
      }
      if (err.message && err.message.toLowerCase().includes('network error')) {
        setError('Network Error: Failed to contact the backend server. Please verify it is running on port 5001.');
      } else {
        setError(err.response?.data?.error || err.message || 'Transformation failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Safe Override Handler ──────────────────────────────────────────────────
  const handleReplace = () => {
    // Record current text in undo stack before making modifications
    setUndoStack((prev) => [...prev, text]);

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

  // ── Undo Action ────────────────────────────────────────────────────────────
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousText = undoStack[undoStack.length - 1];
    setText(previousText);
    setUndoStack((prev) => prev.slice(0, -1));
  };

  // ── AI Chat Assistant Submit ───────────────────────────────────────────────
  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user', content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMessage];

    setChatMessages(updatedMessages);
    setChatInput('');
    setChatLoading(true);
    setChatError('');

    // Cancel any previous pending chat query
    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();

    try {
      const responseText = await sendChatMessage(updatedMessages, chatAbortRef.current.signal);
      setChatMessages([...updatedMessages, { role: 'assistant', content: responseText }]);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        return;
      }
      if (err.message && err.message.toLowerCase().includes('network error')) {
        setChatError('Network Error: Connection to AI Assistant failed. Please start the backend.');
      } else {
        setChatError(err.response?.data?.error || err.message || 'Failed to send message. Please try again.');
      }
    } finally {
      setChatLoading(false);
    }
  };

  // ── Smart Insertion Handler ────────────────────────────────────────────────
  const handleInsertResponse = (responseText) => {
    // Record current text in undo stack
    setUndoStack((prev) => [...prev, text]);

    let newText = '';
    const start = lastSelectionRef.current.start;
    const end = lastSelectionRef.current.end;
    let newCursorPos = 0;

    if (text.length === 0) {
      newText = responseText;
      newCursorPos = responseText.length;
    } else {
      const isCursorAtStart = start === 0 && end === 0;
      if (isCursorAtStart) {
        // Appending to end is the default fallback
        newText = text + '\n\n' + responseText;
        newCursorPos = newText.length;
      } else {
        // Insert precisely at user's selection / cursor
        newText = text.slice(0, start) + responseText + text.slice(end);
        newCursorPos = start + responseText.length;
      }
    }

    setText(newText);
    
    // Save new cursor coords to prevent stale coordinates
    lastSelectionRef.current = { start: newCursorPos, end: newCursorPos };

    // Refocus the textarea and position cursor
    textareaRef.current?.focus();
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
      }
    }, 15);
  };

  // Document calculations
  const totalWords = text.trim() ? text.trim().split(/\s+/).length : 0;
  const totalChars = text.length;

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
              {/* Document metadata counters */}
              <div className="editor-meta-header">
                <span className="editor-label">Writing Board</span>
                <div className="document-counters">
                  <span>{totalWords.toLocaleString()} words</span>
                  <span className="dot-divider">·</span>
                  <span>{totalChars.toLocaleString()} characters</span>
                </div>
              </div>

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
                  <span>💡 Highlight any paragraph, sentence, or phrase to target it with AI actions.</span>
                )}
              </div>

              {/* Controls bar: Tones + Undo */}
              <div className="editor-control-panel">
                <div className="tone-wrapper">
                  <label htmlFor="tone-select" className="tone-label">Tone:</label>
                  <select
                    id="tone-select"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    disabled={loading}
                    className="tone-dropdown"
                  >
                    <option value="default">Default Tone</option>
                    <option value="professional">💼 Professional</option>
                    <option value="casual">💬 Casual</option>
                    <option value="creative">🎨 Creative</option>
                  </select>
                </div>

                {undoStack.length > 0 && (
                  <button
                    onClick={handleUndo}
                    className="btn btn-secondary btn-undo"
                    title="Undo last text override"
                  >
                    ↩️ Undo Edit ({undoStack.length})
                  </button>
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