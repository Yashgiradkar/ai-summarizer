import { useState, useRef, useEffect } from 'react';
import { streamTransformText, streamChatMessage } from './api';
import { replaceTextSafe } from './utils/replaceText';

// ── Chat Storage Helpers ───────────────────────────────────────────────────────
const CHAT_STORE_KEY = 'ai_workspace_chat_store'; // { [docId]: { convs: [{id, title, messages}], activeConvId } }

const loadChatStore = () => {
  try {
    return JSON.parse(localStorage.getItem(CHAT_STORE_KEY) || '{}');
  } catch (e) {
    return {};
  }
};

const saveChatStore = (store) => {
  localStorage.setItem(CHAT_STORE_KEY, JSON.stringify(store));
};

const makeConvId = () => `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Returns { convs, activeConvId } for a given doc, creating defaults if missing */
const getDocChat = (store, docId) => {
  if (store[docId] && store[docId].convs?.length > 0) {
    return store[docId];
  }
  const firstConv = { id: makeConvId(), title: 'New Chat', messages: [] };
  return { convs: [firstConv], activeConvId: firstConv.id };
};

export default function App() {
  // ── 1. Document Manager State ──────────────────────────────────────────────
  const [documents, setDocuments] = useState(() => {
    const saved = localStorage.getItem('ai_workspace_documents');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return [
      {
        id: 'doc-default',
        title: 'Draft Document',
        content: 'Welcome to the Writing Workspace. Highlight text to refine it, or ask the AI assistant questions on the right.',
        lastModified: new Date().toISOString(),
      },
    ];
  });

  const [activeDocId, setActiveDocId] = useState(
    () => localStorage.getItem('ai_workspace_active_doc_id') || 'doc-default'
  );

  const [text, setText] = useState(() => {
    const docs = JSON.parse(localStorage.getItem('ai_workspace_documents') || '[]');
    const docId = localStorage.getItem('ai_workspace_active_doc_id') || 'doc-default';
    const activeDoc = docs.find((d) => d.id === docId) || docs[0];
    return activeDoc ? activeDoc.content : '';
  });

  const [editingDocId, setEditingDocId] = useState(null);
  const [editTitleInput, setEditTitleInput] = useState('');

  // ── 2. Selection ───────────────────────────────────────────────────────────
  const [selectedText, setSelectedText] = useState('');
  const lastSelectionRef = useRef({ start: 0, end: 0 });

  // ── 3. Undo Stack ──────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState([]);

  // ── 4. Tone ────────────────────────────────────────────────────────────────
  const [tone, setTone] = useState('default');

  // ── 5. Suggestion Preview ──────────────────────────────────────────────────
  const [suggestion, setSuggestion] = useState('');
  const [originalSelectedText, setOriginalSelectedText] = useState('');
  const [previewSelectionStart, setPreviewSelectionStart] = useState(0);
  const [previewSelectionEnd, setPreviewSelectionEnd] = useState(0);
  const [transformAction, setTransformAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastTransformParamsRef = useRef(null);

  // ── 6. Multi-Conversation Chat State ───────────────────────────────────────
  // conversations: [{ id, title, messages: [{role, content}] }]
  const [conversations, setConversations] = useState(() => {
    const store = loadChatStore();
    return getDocChat(store, localStorage.getItem('ai_workspace_active_doc_id') || 'doc-default').convs;
  });
  const [activeConvId, setActiveConvId] = useState(() => {
    const store = loadChatStore();
    return getDocChat(store, localStorage.getItem('ai_workspace_active_doc_id') || 'doc-default').activeConvId;
  });

  // chatMessages derived from the active conversation
  const activeConv = conversations.find((c) => c.id === activeConvId) || conversations[0];
  const chatMessages = activeConv ? activeConv.messages : [];

  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [showConvList, setShowConvList] = useState(false);

  // ── 7. Usage Analytics ─────────────────────────────────────────────────────
  const [analytics, setAnalytics] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ai_workspace_analytics') || 'null') || {
        wordCountProcessed: 0,
        actionCounts: { summarize: 0, expand: 0, shorten: 0, fix_grammar: 0, chat: 0 },
      };
    } catch (e) {
      return { wordCountProcessed: 0, actionCounts: { summarize: 0, expand: 0, shorten: 0, fix_grammar: 0, chat: 0 } };
    }
  });

  const [toastMessage, setToastMessage] = useState('');

  // ── DOM Refs ───────────────────────────────────────────────────────────────
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const transformAbortRef = useRef(null);
  const chatAbortRef = useRef(null);

  // ── Persist chat store to localStorage whenever conversations change ────────
  useEffect(() => {
    const store = loadChatStore();
    store[activeDocId] = { convs: conversations, activeConvId };
    saveChatStore(store);
  }, [conversations, activeConvId, activeDocId]);

  // ── Auto-save editor to documents ─────────────────────────────────────────
  useEffect(() => {
    setDocuments((prevDocs) => {
      const updated = prevDocs.map((doc) =>
        doc.id === activeDocId ? { ...doc, content: text, lastModified: new Date().toISOString() } : doc
      );
      localStorage.setItem('ai_workspace_documents', JSON.stringify(updated));
      return updated;
    });
  }, [text, activeDocId]);

  // ── Switch active document ─────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('ai_workspace_active_doc_id', activeDocId);

    const activeDoc = documents.find((d) => d.id === activeDocId);
    if (activeDoc) setText(activeDoc.content);

    setSuggestion('');
    setOriginalSelectedText('');
    setTransformAction('');
    setUndoStack([]);
    setChatError('');
    setShowConvList(false);

    // Load chat state for this doc
    const store = loadChatStore();
    const { convs, activeConvId: convId } = getDocChat(store, activeDocId);
    setConversations(convs);
    setActiveConvId(convId);
  }, [activeDocId]);

  // ── Scroll to latest message ───────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConvId]);

  // ── Save analytics ─────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('ai_workspace_analytics', JSON.stringify(analytics));
  }, [analytics]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      transformAbortRef.current?.abort();
      chatAbortRef.current?.abort();
    };
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // ── Keyboard Shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key.toLowerCase() === 'z') {
        if (undoStack.length > 0 && document.activeElement === textareaRef.current) {
          e.preventDefault();
          handleUndo();
          showToast('Undo completed');
        }
      }
      if (modifier && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showToast('Document saved to browser storage!');
      }
      if (modifier && e.key === 'Enter') {
        if (document.activeElement === textareaRef.current) {
          e.preventDefault();
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
    setSelectedText(value.substring(selectionStart, selectionEnd));
    lastSelectionRef.current = { start: selectionStart, end: selectionEnd };
  };

  // ── Helper: update messages of a conversation ──────────────────────────────
  const updateConvMessages = (convId, updater) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, messages: updater(c.messages) } : c))
    );
  };

  // ── Conversation CRUD ──────────────────────────────────────────────────────
  const handleNewConversation = () => {
    chatAbortRef.current?.abort();
    const newConv = { id: makeConvId(), title: 'New Chat', messages: [] };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);
    setChatInput('');
    setChatError('');
    setShowConvList(false);
    showToast('New conversation started');
  };

  const handleSelectConv = (convId) => {
    if (convId === activeConvId) { setShowConvList(false); return; }
    chatAbortRef.current?.abort();
    setActiveConvId(convId);
    setChatError('');
    setShowConvList(false);
  };

  const handleDeleteConv = (convId, e) => {
    e.stopPropagation();
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== convId);
      if (updated.length === 0) {
        const fallback = { id: makeConvId(), title: 'New Chat', messages: [] };
        setActiveConvId(fallback.id);
        return [fallback];
      }
      if (convId === activeConvId) {
        setActiveConvId(updated[0].id);
      }
      return updated;
    });
  };

  // ── Document CRUD ──────────────────────────────────────────────────────────
  const handleCreateDocument = () => {
    const newDocId = `doc-${Date.now()}`;
    const newDoc = { id: newDocId, title: `Untitled Draft ${documents.length + 1}`, content: '', lastModified: new Date().toISOString() };
    const updated = [...documents, newDoc];
    setDocuments(updated);
    localStorage.setItem('ai_workspace_documents', JSON.stringify(updated));
    setActiveDocId(newDocId);
    showToast('New document created');
  };

  const handleDeleteDocument = (id, e) => {
    e.stopPropagation();
    if (documents.length <= 1) { showToast('Cannot delete the only remaining draft.'); return; }
    const updated = documents.filter((doc) => doc.id !== id);
    setDocuments(updated);
    localStorage.setItem('ai_workspace_documents', JSON.stringify(updated));
    const store = loadChatStore();
    delete store[id];
    saveChatStore(store);
    if (activeDocId === id) setActiveDocId(updated[0].id);
    showToast('Document deleted');
  };

  const handleStartRename = (doc, e) => { e.stopPropagation(); setEditingDocId(doc.id); setEditTitleInput(doc.title); };
  const handleSaveRename = (id) => {
    if (!editTitleInput.trim()) return;
    setDocuments((prev) => {
      const updated = prev.map((d) => d.id === id ? { ...d, title: editTitleInput.trim() } : d);
      localStorage.setItem('ai_workspace_documents', JSON.stringify(updated));
      return updated;
    });
    setEditingDocId(null);
    showToast('Document renamed');
  };

  // ── AI Transform (Streaming) ───────────────────────────────────────────────
  const handleTransform = async (action) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const currentStart = el.selectionStart;
    const currentEnd = el.selectionEnd;
    const currentVal = el.value;
    const highlighted = currentVal.substring(currentStart, currentEnd);
    const isSelectionActive = highlighted.trim().length > 0;
    const targetText = isSelectionActive ? highlighted : currentVal;
    const start = isSelectionActive ? currentStart : 0;
    const end = isSelectionActive ? currentEnd : currentVal.length;

    if (!targetText.trim()) { setError(`Please select or write some text to ${action.replace('_', ' ')}.`); return; }

    lastTransformParamsRef.current = { action, targetText, tone, start, end };
    transformAbortRef.current?.abort();
    transformAbortRef.current = new AbortController();

    setLoading(true); setError(''); setSuggestion('');
    setOriginalSelectedText(targetText);
    setPreviewSelectionStart(start); setPreviewSelectionEnd(end);
    setTransformAction(action);

    let streamWordsCount = 0;
    try {
      await streamTransformText(action, targetText, tone, (chunk) => {
        setSuggestion((prev) => {
          const next = prev + chunk;
          streamWordsCount = next.trim().split(/\s+/).length;
          return next;
        });
      }, transformAbortRef.current.signal);

      setAnalytics((prev) => ({
        wordCountProcessed: prev.wordCountProcessed + streamWordsCount,
        actionCounts: { ...prev.actionCounts, [action]: prev.actionCounts[action] + 1 },
      }));
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError(err.message || 'Transformation failed. Please try again.');
      setSuggestion('');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateTransform = () => {
    if (!lastTransformParamsRef.current) return;
    handleTransform(lastTransformParamsRef.current.action);
  };

  const handleReplace = () => {
    setUndoStack((prev) => [...prev, text]);
    const result = replaceTextSafe(text, suggestion, previewSelectionStart, previewSelectionEnd, originalSelectedText);
    if (result.success) {
      setText(result.updatedText);
      setSuggestion(''); setOriginalSelectedText(''); setTransformAction(''); setSelectedText('');
      showToast('Text replaced successfully! Press Cmd/Ctrl + Z to revert.');
    } else {
      setError(result.error);
    }
  };

  const handleCancel = () => { setSuggestion(''); setOriginalSelectedText(''); setTransformAction(''); };
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    setText(undoStack[undoStack.length - 1]);
    setUndoStack((prev) => prev.slice(0, -1));
  };

  // ── Chat Send (Streaming) ──────────────────────────────────────────────────
  const handleSendChatMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const convId = activeConvId;
    const userMessage = { role: 'user', content: chatInput.trim() };
    const historyBefore = [...chatMessages, userMessage];

    // Optimistically update messages: add user + empty assistant bubble
    updateConvMessages(convId, () => [...historyBefore, { role: 'assistant', content: '' }]);

    // Auto-title the conversation from the first user message
    if (chatMessages.length === 0) {
      const autoTitle = userMessage.content.slice(0, 40) + (userMessage.content.length > 40 ? '…' : '');
      setConversations((prev) =>
        prev.map((c) => c.id === convId ? { ...c, title: autoTitle } : c)
      );
    }

    setChatInput(''); setChatLoading(true); setChatError('');
    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();

    let streamWordsCount = 0;
    try {
      await streamChatMessage(historyBefore, (chunk) => {
        updateConvMessages(convId, (msgs) => {
          const next = [...msgs];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + chunk };
            streamWordsCount = next[next.length - 1].content.trim().split(/\s+/).length;
          }
          return next;
        });
      }, chatAbortRef.current.signal);

      setAnalytics((prev) => ({
        wordCountProcessed: prev.wordCountProcessed + streamWordsCount,
        actionCounts: { ...prev.actionCounts, chat: prev.actionCounts.chat + 1 },
      }));
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setChatError(err.message || 'Chat query failed. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  // ── Chat Regenerate ────────────────────────────────────────────────────────
  const handleRegenerateChat = async () => {
    if (chatMessages.length < 2 || chatLoading) return;

    const convId = activeConvId;
    // Remove the stale last assistant message to get the conversation context
    const filtered = chatMessages.slice(0, -1);

    // Reset last assistant bubble to empty
    updateConvMessages(convId, () => [...filtered, { role: 'assistant', content: '' }]);
    setChatLoading(true); setChatError('');

    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();

    let streamWordsCount = 0;
    try {
      await streamChatMessage(
        filtered, // includes all messages up to and including the last user message
        (chunk) => {
          updateConvMessages(convId, (msgs) => {
            const next = [...msgs];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + chunk };
              streamWordsCount = next[next.length - 1].content.trim().split(/\s+/).length;
            }
            return next;
          });
        },
        chatAbortRef.current.signal
      );

      setAnalytics((prev) => ({
        wordCountProcessed: prev.wordCountProcessed + streamWordsCount,
        actionCounts: { ...prev.actionCounts, chat: prev.actionCounts.chat + 1 },
      }));
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setChatError(err.message || 'Regenerating response failed.');
    } finally {
      setChatLoading(false);
    }
  };

  // ── Smart Insertion ────────────────────────────────────────────────────────
  const handleInsertResponse = (responseText) => {
    setUndoStack((prev) => [...prev, text]);
    const { start, end } = lastSelectionRef.current;
    let newText, newCursorPos;

    if (text.length === 0) {
      newText = responseText; newCursorPos = responseText.length;
    } else if (start === 0 && end === 0) {
      newText = text + '\n\n' + responseText; newCursorPos = newText.length;
    } else {
      newText = text.slice(0, start) + responseText + text.slice(end);
      newCursorPos = start + responseText.length;
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
      {toastMessage && (
        <div className="toast-notification animate-fadeIn"><span>{toastMessage}</span></div>
      )}

      <header className="app-header">
        <h1 className="gradient-text">AI Writing Workspace</h1>
        <p className="tagline">Compose text and refine sections instantly with streaming AI assistance.</p>
      </header>

      <main className="app-main">
        {/* Analytics Dashboard */}
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
              <span className="stat-value">{Object.values(analytics.actionCounts).reduce((a, b) => a + b, 0)}</span>
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
          {/* Column 1: Document Sidebar */}
          <div className="sidebar-section">
            <div className="card sidebar-card">
              <div className="sidebar-header">
                <h3>Drafts List</h3>
                <button onClick={handleCreateDocument} className="btn-add-doc" title="New document">＋ New</button>
              </div>
              <div className="divider" />
              <div className="doc-list">
                {documents.map((doc) => (
                  <div key={doc.id} onClick={() => setActiveDocId(doc.id)} className={`doc-item ${doc.id === activeDocId ? 'active' : ''}`}>
                    {editingDocId === doc.id ? (
                      <div className="rename-row" onClick={(e) => e.stopPropagation()}>
                        <input type="text" value={editTitleInput} onChange={(e) => setEditTitleInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(doc.id); }}
                          className="rename-input" autoFocus />
                        <button onClick={() => handleSaveRename(doc.id)} className="btn-save-title">✓</button>
                      </div>
                    ) : (
                      <>
                        <div className="doc-item-title">
                          <span className="doc-icon">📄</span>
                          <span className="doc-text">{doc.title}</span>
                        </div>
                        <div className="doc-item-actions">
                          <button onClick={(e) => handleStartRename(doc, e)} className="btn-item-action" title="Rename">✏️</button>
                          <button onClick={(e) => handleDeleteDocument(doc.id, e)} className="btn-item-action delete" title="Delete">🗑️</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card shortcut-help-card">
              <h4>⌨️ Hotkeys</h4>
              <div className="shortcut-row"><kbd>Cmd/Ctrl + Enter</kbd><span>Quick Grammar Fix</span></div>
              <div className="shortcut-row"><kbd>Cmd/Ctrl + Z</kbd><span>Undo AI Edit</span></div>
              <div className="shortcut-row"><kbd>Cmd/Ctrl + S</kbd><span>Manual Save Check</span></div>
            </div>
          </div>

          {/* Column 2: Editor */}
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
                onChange={(e) => { setText(e.target.value); handleTextSelect(); }}
                onSelect={handleTextSelect}
                onKeyUp={handleTextSelect}
                onMouseUp={handleTextSelect}
                placeholder="Type or paste your text here. Highlight any portion to transform just that selection..."
                rows={12}
                disabled={loading}
              />

              <div className="selection-tip">
                {selectedText.trim()
                  ? <span>✨ <strong>Transforming selection</strong> ({selectedText.length} chars)</span>
                  : <span>💡 Highlight any paragraph, sentence, or phrase to target it with AI actions.</span>
                }
              </div>

              <div className="editor-control-panel">
                <div className="tone-wrapper">
                  <label htmlFor="tone-select" className="tone-label">Tone:</label>
                  <select id="tone-select" value={tone} onChange={(e) => setTone(e.target.value)} disabled={loading} className="tone-dropdown">
                    <option value="default">Default Tone</option>
                    <option value="professional">💼 Professional</option>
                    <option value="casual">💬 Casual</option>
                    <option value="creative">🎨 Creative</option>
                  </select>
                </div>
                {undoStack.length > 0 && (
                  <button onClick={handleUndo} className="btn btn-secondary btn-undo" title="Undo last text override">
                    ↩️ Undo Edit ({undoStack.length})
                  </button>
                )}
              </div>

              <div className="transform-actions">
                {['summarize', 'expand', 'shorten', 'fix_grammar'].map((action) => (
                  <button key={action} onClick={() => handleTransform(action)} disabled={loading || !text.trim()} className="btn btn-secondary">
                    {loading && transformAction === action
                      ? action.replace('_', ' ') + '...'
                      : action.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="error-box animate-fadeIn"><p>{error}</p></div>}

            {suggestion && (
              <div className="card preview-container animate-fadeIn">
                <div className="preview-header">
                  <h2 className="preview-title">AI Suggestion ({transformAction.replace('_', ' ')})</h2>
                  <button onClick={handleRegenerateTransform} className="btn-inline" disabled={loading}>🔄 Regenerate</button>
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
                  <button onClick={handleCancel} className="btn btn-secondary" disabled={loading}>Cancel</button>
                  <button onClick={handleReplace} className="btn btn-primary" disabled={loading}>Replace Text</button>
                </div>
              </div>
            )}
          </div>

          {/* Column 3: AI Chat Panel */}
          <div className="chat-section">
            <div className="card chat-card">
              {/* Chat Header */}
              <div className="chat-card-header">
                <div className="chat-header-left">
                  <h2>AI Assistant</h2>
                  <button
                    className="btn-conv-toggle"
                    onClick={() => setShowConvList((v) => !v)}
                    title="View chat history"
                  >
                    🗂️ {conversations.length} chat{conversations.length !== 1 ? 's' : ''}
                    <span className="conv-chevron">{showConvList ? '▲' : '▼'}</span>
                  </button>
                </div>
                <div className="chat-header-actions">
                  <button onClick={handleNewConversation} className="btn-new-chat" title="Start new conversation">＋ New Chat</button>
                  {chatMessages.length >= 2 && (
                    <button onClick={handleRegenerateChat} className="btn-inline" disabled={chatLoading} title="Regenerate last response">
                      🔄
                    </button>
                  )}
                </div>
              </div>

              {/* Conversation History Dropdown */}
              {showConvList && (
                <div className="conv-history-panel">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConv(conv.id)}
                      className={`conv-item ${conv.id === activeConvId ? 'active' : ''}`}
                    >
                      <div className="conv-item-body">
                        <span className="conv-icon">💬</span>
                        <div className="conv-item-info">
                          <span className="conv-title">{conv.title}</span>
                          <span className="conv-count">{conv.messages.length} message{conv.messages.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteConv(conv.id, e)}
                        className="btn-item-action delete"
                        title="Delete conversation"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="divider" />

              {/* Active Conversation Title */}
              <div className="active-conv-label">
                <span className="conv-active-indicator">●</span>
                <span className="conv-active-title">{activeConv?.title || 'New Chat'}</span>
              </div>

              {/* Messages Thread */}
              <div className="chat-messages">
                {chatMessages.length === 0 ? (
                  <div className="chat-placeholder">
                    <span>💬</span>
                    <p>Ask the assistant to draft outlines, generate titles, brainstorm ideas, or review your text.</p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div key={idx} className={`message-bubble message-${msg.role}`}>
                      <div className="message-text">
                        {msg.content}
                        {chatLoading && idx === chatMessages.length - 1 && (
                          <span className="blinking-cursor">▋</span>
                        )}
                      </div>
                      {msg.role === 'assistant' && msg.content && (
                        <div className="message-actions">
                          <button type="button" onClick={() => handleInsertResponse(msg.content)} className="btn-inline">
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
                <button type="submit" disabled={chatLoading || !chatInput.trim()} className="btn btn-primary" style={{ padding: '0.75rem 1.25rem' }}>
                  {chatLoading ? '...' : 'Send'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}