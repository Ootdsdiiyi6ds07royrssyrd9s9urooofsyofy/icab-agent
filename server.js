import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
const DATA_DIR = path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

app.use(express.static(FRONTEND_DIST));
app.get('/app/*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

async function ensureFile(file, defaultData = []) {
  try { await fs.access(file); } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(defaultData, null, 2));
  }
}
async function readJSON(file, fallback = []) {
  try { return JSON.parse(await fs.readFile(file, 'utf-8')); } catch { return fallback; }
}
async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const session = sessionId || uuidv4();
  const sessionFile = path.join(SESSIONS_DIR, `${session}.jsonl`);
  await fs.mkdir(SESSIONS_DIR, { recursive: true });

  const history = await readJSON(sessionFile, []);
  history.push({ role: 'user', content: message, ts: Date.now() });
  await writeJSON(sessionFile, history);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Session-Id', session);

  const hermes = spawn('hermes', ['chat', '-q', message, '--oneshot', '--no-restore-cwd'], {
    cwd: process.env.HERMES_HOME || '/opt/data/.hermes',
    env: { ...process.env, HERMES_HOME: process.env.HERMES_HOME || '/opt/data/.hermes' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let fullResponse = '';
  hermes.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    fullResponse += text;
    res.write(text);
  });

  hermes.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (!text.includes('hermes:') && !text.includes('sys.path')) res.write(`\n[${text}]`);
  });

  hermes.on('close', async (code) => {
    if (!res.writableEnded) {
      history.push({ role: 'assistant', content: fullResponse, ts: Date.now() });
      await writeJSON(sessionFile, history);
      res.end();
    }
  });

  hermes.on('error', async (err) => {
    if (!res.writableEnded) {
      res.write(`\n[خطأ في الاتصال بـ Hermes: ${err.message}]`);
      res.end();
    }
  });

  req.on('close', () => { hermes.kill('SIGTERM'); });
});

app.post('/api/chat/openrouter', async (req, res) => {
  try {
    const { message, model = 'nvidia/nemotron-3.5-lightning' } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'icab Agent'
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], stream: true })
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = errText;
      try {
        const parsed = JSON.parse(errText);
        errMsg = parsed.error?.message || errText;
      } catch {}
      return res.status(response.status).json({ error: `OpenRouter error: ${errMsg}` });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    const sessions = await Promise.all(
      files.filter(f => f.endsWith('.jsonl')).map(async f => {
        const file = path.join(SESSIONS_DIR, f);
        const stat = await fs.stat(file);
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1];
        let lastMessage = '';
        if (lastLine) {
          try { const last = JSON.parse(lastLine); lastMessage = last.content || ''; } catch {}
        }
        return { id: f.replace('.jsonl', ''), createdAt: stat.birthtime, updatedAt: stat.mtime, messageCount: lines.length, lastMessage: lastMessage.slice(0, 100) };
      })
    );
    res.json(sessions.sort((a, b) => b.updatedAt - a.updatedAt));
  } catch { res.json([]); }
});

app.get('/api/sessions/:id/messages', async (req, res) => {
  const sessionFile = path.join(SESSIONS_DIR, `${req.params.id}.jsonl`);
  try {
    const content = await fs.readFile(sessionFile, 'utf-8');
    const messages = content.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    res.json(messages);
  } catch { res.json([]); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  const sessionFile = path.join(SESSIONS_DIR, `${req.params.id}.jsonl`);
  try { await fs.unlink(sessionFile); res.json({ success: true }); }
  catch { res.status(404).json({ error: 'Session not found' }); }
});

app.get('/api/tasks', async (req, res) => { await ensureFile(TASKS_FILE, []); res.json(await readJSON(TASKS_FILE, [])); });
app.post('/api/tasks', async (req, res) => {
  const tasks = await readJSON(TASKS_FILE, []);
  const task = { id: uuidv4(), ...req.body, createdAt: Date.now(), completed: false };
  tasks.push(task); await writeJSON(TASKS_FILE, tasks); res.status(201).json(task);
});
app.patch('/api/tasks/:id', async (req, res) => {
  const tasks = await readJSON(TASKS_FILE, []);
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  tasks[idx] = { ...tasks[idx], ...req.body }; await writeJSON(TASKS_FILE, tasks); res.json(tasks[idx]);
});
app.delete('/api/tasks/:id', async (req, res) => {
  let tasks = await readJSON(TASKS_FILE, []);
  tasks = tasks.filter(t => t.id !== req.params.id); await writeJSON(TASKS_FILE, tasks); res.json({ success: true });
});

app.get('/api/calendar/events', async (req, res) => { await ensureFile(EVENTS_FILE, []); res.json(await readJSON(EVENTS_FILE, [])); });
app.post('/api/calendar/events', async (req, res) => {
  const events = await readJSON(EVENTS_FILE, []);
  const event = { id: uuidv4(), ...req.body, createdAt: Date.now() };
  events.push(event); await writeJSON(EVENTS_FILE, events); res.status(201).json(event);
});
app.delete('/api/calendar/events/:id', async (req, res) => {
  let events = await readJSON(EVENTS_FILE, []);
  events = events.filter(e => e.id !== req.params.id); await writeJSON(EVENTS_FILE, events); res.json({ success: true });
});

app.get('/api/settings', async (req, res) => {
  await ensureFile(SETTINGS_FILE, { autoReply: true, autoCallReply: true, voiceReminders: true, smartNotifications: true, learningMode: false, language: 'ar', directModel: 'nvidia/nemotron-3.5-lightning' });
  res.json(await readJSON(SETTINGS_FILE, {}));
});
app.patch('/api/settings', async (req, res) => {
  const settings = await readJSON(SETTINGS_FILE, {});
  Object.assign(settings, req.body); await writeJSON(SETTINGS_FILE, settings); res.json(settings);
});

app.get('/api/integrations', (req, res) => {
  res.json({ hermes: { connected: true, version: 'latest', model: 'stepfun/step-3.7-flash:free', provider: 'nous' }, telegram: { connected: true, username: 'icab_agent_bot' }, email: { connected: false }, calendar: { connected: false } });
});

app.listen(PORT, '0.0.0.0', () => console.log(`icab Agent backend running on http://0.0.0.0:${PORT}`));
