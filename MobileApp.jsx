import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Trash2, Plus, Menu, X, Home, MessageSquare, Zap, Calendar, Settings } from 'lucide-react';

const API = '/api';

export default function MobileApp() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState('chat');
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState({});
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchSessions();
    fetchTasks();
    fetchEvents();
    fetchSettings();

    const handleResize = () => {
      if (window.visualViewport) {
        const offset = window.innerHeight - window.visualViewport.height;
        setKeyboardOpen(offset > 150);
      }
    };
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    try { const res = await fetch(`${API}/sessions`); setSessions(await res.json()); } catch {}
  };
  const fetchTasks = async () => {
    try { const res = await fetch(`${API}/tasks`); setTasks(await res.json()); } catch {}
  };
  const fetchEvents = async () => {
    try { const res = await fetch(`${API}/calendar/events`); setEvents(await res.json()); } catch {}
  };
  const fetchSettings = async () => {
    try { setSettings(await fetch(`${API}/settings`).then(r => r.json())); } catch {}
  };

  const loadSession = async (sessionId) => {
    setCurrentSession(sessionId);
    setMenuOpen(false);
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/messages`);
      const data = await res.json();
      setMessages(data.map(m => ({ ...m, id: `${m.ts}-${m.role}` })));
    } catch {}
    setPage('chat');
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { id: `user-${Date.now()}`, role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      const useDirect = !!settings.directModel;
      const endpoint = useDirect ? '/api/chat/openrouter' : '/api/chat';
      const body = useDirect
        ? { message: currentInput, model: settings.directModel || 'nvidia/nemotron-3.5-lightning' }
        : { message: currentInput, sessionId: currentSession };

      const response = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'خطأ في الشبكة' }));
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: err.error || 'حدث خطأ' }]);
        setLoading(false);
        return;
      }

      if (!useDirect) {
        const sessionId = response.headers.get('X-Session-Id');
        if (sessionId && !currentSession) {
          setCurrentSession(sessionId);
          fetchSessions();
        }
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let botMessage = { id: `bot-${Date.now()}`, role: 'assistant', content: '' };
      setMessages(prev => [...prev, botMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        setMessages(prev => prev.map(m =>
          m.id === botMessage.id ? { ...m, content: m.content + text } : m
        ));
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `خطأ: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (id) => {
    await fetch(`${API}/sessions/${id}`, { method: 'DELETE' });
    fetchSessions();
    if (currentSession === id) { setCurrentSession(null); setMessages([]); }
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await fetch(`${API}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setForm({ title: '', desc: '', time: '', priority: 'medium' });
    setShowTaskForm(false);
    fetchTasks();
  };

  const toggleTask = async (id) => {
    const task = tasks.find(t => t.id === id);
    await fetch(`${API}/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !task.completed }) });
    fetchTasks();
  };

  const deleteTask = async (id) => {
    await fetch(`${API}/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
  };

  const addEvent = async (e) => {
    e.preventDefault();
    if (!eventForm.title.trim()) return;
    await fetch(`${API}/calendar/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventForm) });
    setEventForm({ title: '', description: '', date: '', time: '' });
    setShowEventForm(false);
    fetchEvents();
  };

  const deleteEvent = async (id) => {
    await fetch(`${API}/calendar/events/${id}`, { method: 'DELETE' });
    fetchEvents();
  };

  const [form, setForm] = useState({ title: '', desc: '', time: '', priority: 'medium' });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', description: '', date: '', time: '' });
  const [showEventForm, setShowEventForm] = useState(false);

  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #24170F 0%, #38251B 100%)' }}>
      {menuOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} onClick={() => setMenuOpen(false)}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '280px', height: '100%', background: 'rgba(20,16,12,0.98)', backdropFilter: 'blur(20px)', borderLeft: '1px solid rgba(197,160,89,0.15)', padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid rgba(197,160,89,0.1)' }}>
              <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #c5a059, #e8d5a3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, color: '#1a1510' }}>i</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>icab <span style={{ color: '#c5a059' }}>AGENT</span></div>
            </div>
            <button onClick={() => { setCurrentSession(null); setMessages([]); setPage('chat'); setMenuOpen(false); }} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg, #c5a059, #e8d5a3)', color: '#1a1510', border: 'none', cursor: 'pointer', fontFamily: 'Tajawal', fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>
              + محادثة جديدة
            </button>
            <div style={{ marginBottom: '12px', fontSize: '13px', color: '#8A6548', fontWeight: 600 }}>المحادثات</div>
            <div style={{ display: 'grid', gap: '4px', maxHeight: '400px', overflowY: 'auto' }}>
              {sessions.map(session => (
                <div key={session.id} onClick={() => loadSession(session.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: currentSession === session.id ? 'rgba(197,160,89,0.1)' : 'transparent', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.lastMessage || 'محادثة جديدة'}</div>
                    <div style={{ fontSize: '12px', color: '#8A6548' }}>{new Date(session.updatedAt).toLocaleDateString('ar-SA')}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} style={{ background: 'none', border: 'none', color: '#8A6548', cursor: 'pointer', padding: '4px' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {page === 'chat' && (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(197,160,89,0.15)', background: 'rgba(20,16,12,0.75)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 900 }}>المساعد الذكي</h1>
              <div style={{ fontSize: '12px', color: '#8A6548' }}>مرحباً بك في icab Agent</div>
            </div>
            <button onClick={() => setMenuOpen(true)} style={{ background: 'none', border: 'none', color: '#c5a059', cursor: 'pointer' }}>
              <Menu size={24} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8A6548' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⭐</div>
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#c5a059' }}>مرحباً بك في icab Agent</div>
                <div style={{ fontSize: '14px', lineHeight: '1.6' }}>اكتب رسالة وسأرد عليك من خلال Hermes أو OpenRouter</div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={msg.id || i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-start' : 'flex-end', marginBottom: '12px' }}>
                <div style={{
                  maxWidth: '80%', padding: '12px 16px', borderRadius: '16px', fontSize: '15px', lineHeight: '1.6',
                  background: msg.role === 'user' ? 'rgba(197,160,89,0.15)' : 'linear-gradient(135deg, #c5a059, #e8d5a3)', color: msg.role === 'user' ? '#FFF9F2' : '#1a1510'
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <div style={{ background: 'rgba(197,160,89,0.15)', padding: '12px 16px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '13px', color: '#8A6548' }}>جاري الكتابة...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{
            position: keyboardOpen ? 'fixed' : 'relative', bottom: keyboardOpen ? 0 : 'auto', left: keyboardOpen ? 0 : 'auto', right: keyboardOpen ? 0 : 'auto',
            padding: '12px 16px', background: 'rgba(20,16,12,0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(197,160,89,0.15)', zIndex: keyboardOpen ? 50 : 'auto', display: 'flex', gap: '10px', alignItems: 'center'
          }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="تحدث مع icab..."
              style={{ flex: 1, padding: '12px 16px', borderRadius: '24px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff', outline: 'none' }}
              disabled={loading}
            />
            <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #c5a059, #e8d5a3)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={20} color="#1a1510" />
            </button>
          </div>
        </div>
      )}

      {page === 'tasks' && (
        <div style={{ minHeight: '100vh', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 900 }}>المهام</h1>
              <p style={{ color: '#b58b65', fontSize: '14px' }}>{activeTasks.length} نشطة، {completedTasks.length} منجزة</p>
            </div>
            <button onClick={() => setShowTaskForm(!showTaskForm)} style={{ padding: '10px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #c5a059, #e8d5a3)', color: '#1a1510', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} /> مهمة جديدة
            </button>
          </div>

          {showTaskForm && (
            <form onSubmit={addTask} style={{ marginBottom: '24px', padding: '16px', background: 'rgba(56,37,27,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(197,160,89,0.15)', borderRadius: '16px' }}>
              <input placeholder="عنوان المهمة" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff', marginBottom: '12px' }} />
              <input placeholder="الوصف" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff', marginBottom: '12px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}>
                  <option value="low">أولوية منخفضة</option>
                  <option value="medium">أولوية متوسطة</option>
                  <option value="high">أولوية عالية</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowTaskForm(false)} style={{ padding: '10px 20px', borderRadius: '12px', background: 'rgba(197,160,89,0.1)', color: '#c5a059', border: '1px solid rgba(197,160,89,0.2)', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" style={{ padding: '10px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #c5a059, #e8d5a3)', color: '#1a1510', border: 'none', cursor: 'pointer', fontWeight: 700 }}>إضافة</button>
              </div>
            </form>
          )}

          <div style={{ display: 'grid', gap: '12px' }}>
            {activeTasks.map((task, i) => (
              <div key={task.id} style={{ padding: '16px', background: 'rgba(56,37,27,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(197,160,89,0.15)', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => toggleTask(task.id)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '2px solid #c5a059', background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>{task.title}</div>
                  {task.desc && <div style={{ fontSize: '13px', color: '#b58b65' }}>{task.desc}</div>}
                </div>
                {task.time && <div style={{ fontSize: '12px', color: '#8A6548', background: 'rgba(197,160,89,0.1)', padding: '4px 10px', borderRadius: '8px' }}>{task.time}</div>}
                <button onClick={() => deleteTask(task.id)} style={{ background: 'none', border: 'none', color: '#8A6548', cursor: 'pointer' }}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {activeTasks.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8A6548' }}>لا توجد مهام نشطة ✨</div>}
          </div>
        </div>
      )}

      {page === 'calendar' && (
        <div style={{ minHeight: '100vh', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 900 }}>التقويم</h1>
              <p style={{ color: '#b58b65', fontSize: '14px' }}>{events.length} حدث</p>
            </div>
            <button onClick={() => setShowEventForm(!showEventForm)} style={{ padding: '10px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #c5a059, #e8d5a3)', color: '#1a1510', border: 'none', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} /> حدث جديد
            </button>
          </div>

          {showEventForm && (
            <form onSubmit={addEvent} style={{ marginBottom: '24px', padding: '16px', background: 'rgba(56,37,27,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(197,160,89,0.15)', borderRadius: '16px' }}>
              <input placeholder="عنوان الحدث" value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} required style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff', marginBottom: '12px' }} />
              <textarea placeholder="الوصف" value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} rows={3} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff', marginBottom: '12px', fontFamily: 'Tajawal' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <input type="date" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                <input type="time" value={eventForm.time} onChange={e => setEventForm({ ...eventForm, time: e.target.value })} style={{ padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowEventForm(false)} style={{ padding: '10px 20px', borderRadius: '12px', background: 'rgba(197,160,89,0.1)', color: '#c5a059', border: '1px solid rgba(197,160,89,0.2)', cursor: 'pointer' }}>إلغاء</button>
                <button type="submit" style={{ padding: '10px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #c5a059, #e8d5a3)', color: '#1a1510', border: 'none', cursor: 'pointer', fontWeight: 700 }}>إضافة</button>
              </div>
            </form>
          )}

          <div style={{ display: 'grid', gap: '12px' }}>
            {events.map((event, i) => (
              <div key={event.id} style={{ padding: '16px', background: 'rgba(56,37,27,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(197,160,89,0.15)', borderRadius: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>{event.title}</div>
                {event.description && <div style={{ fontSize: '14px', color: '#b58b65', marginBottom: '8px' }}>{event.description}</div>}
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#8A6548' }}>
                  {event.date && <span>📅 {event.date}</span>}
                  {event.time && <span>🕐 {event.time}</span>}
                </div>
                <button onClick={() => deleteEvent(event.id)} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#8A6548', cursor: 'pointer', fontSize: '13px' }}>حذف</button>
              </div>
            ))}
            {events.length === 0 && <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8A6548' }}>لا توجد أحداث 📅</div>}
          </div>
        </div>
      )}

      {page === 'settings' && (
        <div style={{ minHeight: '100vh', padding: '16px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 900, marginBottom: '24px' }}>الإعدادات</h1>

          <div style={{ padding: '16px', background: 'rgba(56,37,27,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(197,160,89,0.15)', borderRadius: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: '#c5a059' }}>المساعد</h2>
            {Object.entries({ autoReply: 'الرد التلقائي', autoCallReply: 'رد المكالمات', voiceReminders: 'التذكيرات الصوتية', learningMode: 'التعلم من السلوك', smartNotifications: 'الإشعارات الذكية' }).map(([key, label]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(197,160,89,0.08)' }}>
                <span style={{ fontSize: '15px' }}>{label}</span>
                <div onClick={() => { const newValue = !settings[key]; fetch(`${API}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: newValue }) }); setSettings(prev => ({ ...prev, [key]: newValue })); }} style={{ width: '48px', height: '24px', borderRadius: '12px', background: settings[key] ? '#c5a059' : 'rgba(197,160,89,0.2)', position: 'relative', cursor: 'pointer', transition: 'all 0.3s' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', right: settings[key] ? '26px' : '2px', transition: 'all 0.3s' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '16px', background: 'rgba(56,37,27,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(197,160,89,0.15)', borderRadius: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: '#c5a059' }}>المودل المباشر</h2>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', color: '#8A6548', marginBottom: '6px' }}>المودل</div>
              <select value={settings.directModel || 'nvidia/nemotron-3.5-lightning'} onChange={(e) => { setSettings(prev => ({ ...prev, directModel: e.target.value })); fetch(`${API}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directModel: e.target.value }) }); }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid rgba(197,160,89,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '14px', outline: 'none' }}>
                <option value="nvidia/nemotron-3.5-lightning">Nemotron 3.5 Lightning (مجاني)</option>
                <option value="meta-llama/llama-4-maverick:free">Llama 4 Maverick (مجاني)</option>
                <option value="mistralai/mistral-nemo:free">Mistral Nemo (مجاني)</option>
                <option value="qwen/qwen3-235b-a22b:free">Qwen 3 235B (مجاني)</option>
              </select>
            </div>
            <div style={{ fontSize: '13px', color: '#8A6548', lineHeight: '1.6' }}>
              عند تفعيل مودل، ستستخدم الواجهة مودل مجاني من OpenRouter. المفتاح محفوظ في الخادم بشكل آمن.
            </div>
          </div>

          <div style={{ padding: '16px', background: 'rgba(56,37,27,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(197,160,89,0.15)', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: '#c5a059' }}>التكاملات</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid rgba(197,160,89,0.08)' }}>
              <div style={{ fontSize: '24px' }}>🤖</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Hermes Agent</div>
                <div style={{ fontSize: '13px', color: '#4ade80' }}>متصل ✓</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0' }}>
              <div style={{ fontSize: '24px' }}>📱</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Telegram</div>
                <div style={{ fontSize: '13px', color: '#4ade80' }}>متصل ✓</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!keyboardOpen && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(20,16,12,0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(197,160,89,0.15)', display: 'flex', justifyContent: 'space-around', padding: '8px 0', zIndex: 40 }}>
          {[
            { id: 'chat', icon: MessageSquare, label: 'المساعد' },
            { id: 'tasks', icon: Zap, label: 'المهام' },
            { id: 'calendar', icon: Calendar, label: 'التقويم' },
            { id: 'settings', icon: Settings, label: 'الإعدادات' },
          ].map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{ flex: 1, background: 'none', border: 'none', color: page === item.id ? '#c5a059' : '#8A6548', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '4px' }}>
              <item.icon size={22} />
              <span style={{ fontSize: '11px' }}>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
