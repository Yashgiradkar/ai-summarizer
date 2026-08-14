import { useState, useRef, useEffect } from 'react';
import { streamTransformText, streamChatMessage } from './api';
import { replaceTextSafe } from './utils/replaceText';

export default function App() {
  // ── 1. Document Manager State (Multiple Documents) ─────────────────────────
  const [documents, setDocuments] = useState(() => {
    const saved = localStorage.getItem('ai_workspace_documents');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Failed to parse documents', e);
      }
    }
    // Default initial document
    return [
      {
        id: 'doc-default',
        title: 'Draft Document',
        content: 'Welcome to the Writing Workspace. Highlight text to refine it, or ask the AI assistant questions on the right.',
        lastModified: new Date().toISOString(),
      },
    ];
  });

  const [activeDocId, setActiveDocId] = useState(() => {
    return localStorage.getItem('ai_workspace_active_doc_id') || 'doc-default';
  });

  // Editor text state corresponding to the active document
  const [text, setText] = useState(() => {
    const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0];
    return activeDoc ? activeDoc.content : '';
  });

  // Track renaming state
  const [editingDocId, setEditingDocId] = useState(null);
  const [editTitleInput, setEditTitleInput] = useState('');

  // ── 2. Selection Coordinates & Ref ─────────────────────────────────────────
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  const lastSelectionRef = useRef({ start: 0, end: 0 });

  // ── 3. Undo Stack ──────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState([]);

  // ── 4. Tone Selector ───────────────────────────────────────────────────────
  const [tone, setTone] = useState('default');

  // ── 5. Suggestion Preview & Regeneration State ─────────────────────────────
  const [suggestion, setSuggestion] = useState('');
  const [originalSelectedText, setOriginalSelectedText] = useState('');
  const [previewSelectionStart, setPreviewSelectionStart] = useState(0);
  const [previewSelectionEnd, setPreviewSelectionEnd] = useState(0);
  const [transformAction, setTransformAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep a reference of the parameters used in the last transform to enable regeneration
  const lastTransformParamsRef = useRef(null);

  // ── 6. Persistent Chat History ─────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  // ── 7. Usage Analytics ─────────────────────────────────────────────────────
  const [analytics, setAnalytics] = useState(() => {
    const saved = localStorage.getItem('ai_workspace_analytics');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      wordCountProcessed: 0,
      actionCounts: { summarize: 0, expand: 0, shorten: 0, fix_grammar: 0, chat: 0 },
    };
  });

  // ── 8. UI Notification Toasts ──────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState('');

  // ── 9. DOM Refs & Request Aborters ─────────────────────────────────────────
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const transformAbortRef = useRef(null);
  const chatAbortRef = useRef(null);

  // Auto-save the active document content whenever text changes
  useEffect(() => {
    setDocuments((prevDocs) => {
      const updated = prevDocs.map((doc) => {
        if (doc.id === activeDocId) {
          return { ...doc, content: text, lastModified: new Date().toISOString() };
        }
        return doc;
      });
      localStorage.setItem('ai_workspace_documents', JSON.stringify(updated));
      return updated;
    });
  }, [text, activeDocId]);

  // Sync active doc ID to storage
  useEffect(() => {
    localStorage.setItem('ai_workspace_active_doc_id', activeDocId);
    
    // Switch editor text to selected document
    const activeDoc = documents.find((d) => d.id === activeDocId);
    if (activeDoc) {
      setText(activeDoc.content);
    }
    
    // Clear preview suggestion when changing documents
    setSuggestion('');
    setOriginalSelectedText('');
    setTransformAction('');
    setUndoStack([]);

    // Load persistent chat history for this document
    const chatHistories = JSON.parse(localStorage.getItem('ai_workspace_chat_histories') || '{}');
    setChatMessages(chatHistories[activeDocId] || []);
  }, [activeDocId]);

  // Save persistent chat history on modification
  useEffect(() => {
    const chatHistories = JSON.parse(localStorage.getItem('ai_workspace_chat_histories') || '{}');
    chatHistories[activeDocId] = chatMessages;
    localStorage.setItem('ai_workspace_chat_histories', JSON.stringify(chatHistories));
  }, [chatMessages, activeDocId]);

  // Save analytics updates
  useEffect(() => {
    localStorage.setItem('ai_workspace_analytics', JSON.stringify(analytics));
  }, [analytics]);

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

  // Show a quick visual notification toast
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // ── Keyboard Shortcuts Listener ────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + Z: Revert replacement
      if (modifier && e.key.toLowerCase() === 'z') {
        if (undoStack.length > 0 && document.activeElement === textareaRef.current) {
          e.preventDefault();
          handleUndo();
          showToast('Undo completed');
        }
      }

      // Cmd/Ctrl + S: Manual Trigger Save
      if (modifier && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showToast('Document saved to browser storage!');
      }

      // Cmd/Ctrl + Enter: Trigger AI Action inside Editor, or Submit inside Chat
      if (modifier && e.key === 'Enter') {
        if (document.activeElement === textareaRef.current) {
          e.preventDefault();
          // Trigger fix_grammar as the default quick transform action
          handleTransform('fix_grammar');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [text, undoStack]);

  // ── Selection Tracking ─────────────────────────────────────────────────────
  const handleTextSelect = () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    setSelectionStart(selectionStart);
    setSelectionEnd(selectionEnd);
    setSelectedText(value.substring(selectionStart, selectionEnd));
    lastSelectionRef.current = { start: selectionStart, end: selectionEnd };
  };

  // ── Document List CRUD Operations ──────────────────────────────────────────
  const handleCreateDocument = () => {
    const newDocId = `doc-${Date.now()}`;
    const newDoc = {
      id: newDocId,
      title: `Untitled Draft ${documents.length + 1}`,
      content: '',
      lastModified: new Date().toISOString(),
    };
    const updated = [...documents, newDoc];
    setDocuments(updated);
    localStorage.setItem('ai_workspace_documents', JSON.stringify(updated));
    setActiveDocId(newDocId);
    showToast('New document created');
  };

  const handleDeleteDocument = (id, e) => {
    e.stopPropagation();
    if (documents.length <= 1) {
      showToast('Cannot delete the only remaining draft.');
      return;
    }
    const updated = documents.filter((doc) => doc.id !== id);
    setDocuments(updated);
    localStorage.setItem('ai_workspace_documents', JSON.stringify(updated));

    // Clear document-specific chat history
    const chatHistories = JSON.parse(localStorage.getItem('ai_workspace_chat_histories') || '{}');
    delete chatHistories[id];
    localStorage.setItem('ai_workspace_chat_histories', JSON.stringify(chatHistories));

    if (activeDocId === id) {
      setActiveDocId(updated[0].id);
    }
    showToast('Document deleted');
  };

  const handleStartRename = (doc, e) => {
    e.stopPropagation();
    setEditingDocId(doc.id);
    setEditTitleInput(doc.title);
  };

  const handleSaveRename = (id) => {
    if (!editTitleInput.trim()) return;
    setDocuments((prevDocs) => {
      const updated = prevDocs.map((doc) => {
        if (doc.id === id) {
          return { ...doc, title: editTitleInput.trim() };
        }
        return doc;
      });
      localStorage.setItem('ai_workspace_documents', JSON.stringify(updated));
      return updated;
    });
    setEditingDocId(null);
    showToast('Document renamed');
  };

  // ── AI Transform Handler (Streaming) ───────────────────────────────────────
  const handleTransform = async (action) => {
    if (!textareaRef.current) return;

    // Resolve parameters synchronously from DOM coordinates to avoid stale state delays
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

    // Lock transform params in Ref for future regeneration
    lastTransformParamsRef.current = { action, targetText, tone, start, end };

    // Abort active transforms
    transformAbortRef.current?.abort();
    transformAbortRef.current = new AbortController();

    setLoading(true);
    setError('');
    setSuggestion('');
    setOriginalSelectedText(targetText);
    setPreviewSelectionStart(start);
    setPreviewSelectionEnd(end);
    setTransformAction(action);

    let streamWordsCount = 0;

    try {
      await streamTransformText(
        action,
        targetText,
        tone,
        (chunk) => {
          setSuggestion((prev) => {
            const next = prev + chunk;
            streamWordsCount = next.trim().split(/\s+/).length;
            return next;
          });
        },
        transformAbortRef.current.signal
      );

      // Successfully processed. Increment analytics counters
      setAnalytics((prev) => ({
        wordCountProcessed: prev.wordCountProcessed + streamWordsCount,
        actionCounts: {
          ...prev.actionCounts,
          [action]: prev.actionCounts[action] + 1,
        },
      }));

    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        return; // Silent catch on user cancels
      }
      setError(err.message || 'Transformation failed. Please try again.');
      setSuggestion('');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateTransform = () => {
    if (!lastTransformParamsRef.current) return;
    const { action } = lastTransformParamsRef.current;
    handleTransform(action);
  };

  // ── Safe Override Handler ──────────────────────────────────────────────────
  const handleReplace = () => {
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
      setSuggestion('');
      setOriginalSelectedText('');
      setTransformAction('');
      setSelectedText('');
      showToast('Text replaced successfully! Press Cmd/Ctrl + Z to revert.');
    } else {
      setError(result.error);
    }
  };

  const handleCancel = () => {
    setSuggestion('');
    setOriginalSelectedText('');
    setTransformAction('');
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousText = undoStack[undoStack.length - 1];
    setText(previousText);
    setUndoStack((prev) => prev.slice(0, -1));
  };

  // ── AI Chat Assistant Submit (Streaming) ───────────────────────────────────
  const handleSendChatMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userQuery = chatInput.trim();
    const userMessage = { role: 'user', content: userQuery };
    const initialMessages = [...chatMessages, userMessage];

    // Push user message and a blank space bubble for incoming assistant stream
    setChatMessages([...initialMessages, { role: 'assistant', content: '' }]);
    setChatInput('');
    setChatLoading(true);
    setChatError('');

    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();

    let streamWordsCount = 0;

    try {
      await streamChatMessage(
        initialMessages,
        (chunk) => {
          setChatMessages((prev) => {
            const next = [...prev];
            const lastMsg = next[next.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content += chunk;
              streamWordsCount = lastMsg.content.trim().split(/\s+/).length;
            }
            return next;
          });
        },
        chatAbortRef.current.signal
      );

      // Increment analytics counters
      setAnalytics((prev) => ({
        wordCountProcessed: prev.wordCountProcessed + streamWordsCount,
        actionCounts: {
          ...prev.actionCounts,
          chat: prev.actionCounts.chat + 1,
        },
      }));

    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        return;
      }
      setChatError(err.message || 'Chat query failed. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleRegenerateChat = async () => {
    if (chatMessages.length < 2 || chatLoading) return;

    // Remove the last assistant message
    const filtered = chatMessages.slice(0, -1);
    const lastUserQuery = filtered[filtered.length - 1]?.content || '';
    
    // Reset state
    setChatMessages([...filtered, { role: 'assistant', content: '' }]);
    setChatLoading(true);
    setChatError('');

    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();

    let streamWordsCount = 0;

    try {
      await streamChatMessage(
        filtered.slice(0, -1), // query context without the empty assistant response placeholder
        (chunk) => {
          setChatMessages((prev) => {
            const next = [...prev];
            const lastMsg = next[next.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content += chunk;
              streamWordsCount = lastMsg.content.trim().split(/\s+/).length;
            }
            return next;
          });
        },
        chatAbortRef.current.signal
      );

      setAnalytics((prev) => ({
        wordCountProcessed: prev.wordCountProcessed + streamWordsCount,
        actionCounts: {
          ...prev.actionCounts,
          chat: prev.actionCounts.chat + 1,
        },
      }));
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        return;
      }
      setChatError(err.message || 'Regenerating response failed.');
    } finally {
      setChatLoading(false);
    }
  };

  // ── Smart Insertion Handler ────────────────────────────────────────────────
  const handleInsertResponse = (responseText) => {
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
        newText = text + '\n\n' + responseText;
        newCursorPos = newText.length;
      } else {
        newText = text.slice(0, start) + responseText + text.slice(end);
        newCursorPos = start + responseText.length;
      }
    }

    setText(newText);
    lastSelectionRef.current = { start: newCursorPos, end: newCursorPos };

    textareaRef.current?.focus();
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
      }
    }, 15);
  };

  const totalWords = text.trim() ? text.trim().split(/\s+/).length : 0;
  const totalChars = text.length;

  return (
    <div className="app-container">
      {/* Visual notifications */}
      {toastMessage && (
        <div className="toast-notification animate-fadeIn">
          <span>{toastMessage}</span>
        </div>
      )}

      <header className="app-header">
        <h1 className="gradient-text">AI Writing Workspace</h1>
        <p className="tagline">Compose text and refine sections instantly with streaming AI assistance.</p>
      </header>

      <main className="app-main">
        {/* Visual Analytics Widget */}
        <div className="card analytics-dashboard">
          <div className="analytics-header">
            <h3>⚡ Workspace Usage Statistics</h3>
            <span className="badge badge-accent">Auto-saving</span>
          </div>
          <div className="analytics-grid">
            <div className="stat-card">
              <span className="stat-value">{analytics.wordCountProcessed.toLocaleString()}</span>
              <span className="stat-label">AI Words Streamed</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {Object.values(analytics.actionCounts).reduce((a, b) => a + b, 0)}
              </span>
              <span className="stat-label">Total AI Computations</span>
            </div>
            <div className="stat-card">
              <div className="action-stats-mini">
                <div>🔍 Summarize: {analytics.actionCounts.summarize}</div>
                <div>➕ Expand: {analytics.actionCounts.expand}</div>
                <div>✂️ Shorten: {analytics.actionCounts.shorten}</div>
                <div>🛠️ Grammar: {analytics.actionCounts.fix_grammar}</div>
                <div>💬 Chat Queries: {analytics.actionCounts.chat}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="workspace-layout">
          {/* Column 1: Document Switcher Sidebar */}
          <div className="sidebar-section">
            <div className="card sidebar-card">
              <div className="sidebar-header">
                <h3>Drafts List</h3>
                <button onClick={handleCreateDocument} className="btn-add-doc" title="New document">
                  ＋ New
                </button>
              </div>
              <div className="divider" />
              <div className="doc-list">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    className={`doc-item ${doc.id === activeDocId ? 'active' : ''}`}
                  >
                    {editingDocId === doc.id ? (
                      <div className="rename-row" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitleInput}
                          onChange={(e) => setEditTitleInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(doc.id);
                          }}
                          className="rename-input"
                          autoFocus
                        />
                        <button onClick={() => handleSaveRename(doc.id)} className="btn-save-title">
                          ✓
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="doc-item-title">
                          <span className="doc-icon">📄</span>
                          <span className="doc-text">{doc.title}</span>
                        </div>
                        <div className="doc-item-actions">
                          <button
                            onClick={(e) => handleStartRename(doc, e)}
                            className="btn-item-action"
                            title="Rename"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => handleDeleteDocument(doc.id, e)}
                            className="btn-item-action delete"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Keyboard shortcut reference helper card */}
            <div className="card shortcut-help-card">
              <h4>⌨️ Hotkeys</h4>
              <div className="shortcut-row">
                <kbd>Cmd/Ctrl + Enter</kbd>
                <span>Quick Grammar Fix</span>
              </div>
              <div className="shortcut-row">
                <kbd>Cmd/Ctrl + Z</kbd>
                <span>Undo AI Edit</span>
              </div>
              <div className="shortcut-row">
                <kbd>Cmd/Ctrl + S</kbd>
                <span>Manual Save Check</span>
              </div>
            </div>
          </div>

          {/* Column 2: Writing Editor & Preview Panel */}
          <div className="editor-section">
            <div className="card">
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
                  <button
                    onClick={handleRegenerateTransform}
                    className="btn-inline"
                    disabled={loading}
                  >
                    🔄 Regenerate
                  </button>
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

          {/* Column 3: AI Chat Panel */}
          <div className="chat-section">
            <div className="card chat-card">
              <div className="chat-card-header">
                <h2>AI Assistant</h2>
                {chatMessages.length >= 2 && (
                  <button
                    onClick={handleRegenerateChat}
                    className="btn-inline"
                    disabled={chatLoading}
                    title="Regenerate last response"
                  >
                    🔄 Regenerate
                  </button>
                )}
              </div>
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
                      <div className="message-text">
                        {msg.content}
                        {chatLoading && idx === chatMessages.length - 1 && (
                          <span className="blinking-cursor">▋</span>
                        )}
                      </div>
                      {msg.role === 'assistant' && msg.content && (
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