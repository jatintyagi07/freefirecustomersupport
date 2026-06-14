const PROD_HOST = 'freefirecustomersupport.onrender.com';
const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const socketUrl = isLocal ? undefined : 'https://' + PROD_HOST;
const socketOptions = {
  transports: ['polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 20000
};
const socket = socketUrl ? io(socketUrl, socketOptions) : io(socketOptions);

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const nameInput = document.getElementById('nameInput');
const enterBtn = document.getElementById('enterBtn');
const messages = document.getElementById('messages');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const photoBtn = document.getElementById('photoBtn');
const fileInput = document.getElementById('fileInput');
const inputbar = document.getElementById('inputbar');
const adminStatus = document.getElementById('adminStatus');
const adminAvatar = document.getElementById('adminAvatar');
const toastEl = document.getElementById('toast');

let userId = localStorage.getItem('nebula_user_id') || null;
let userName = localStorage.getItem('nebula_user_name') || null;

// ---------- Socket connection status ----------
let connectRetryToastShown = false;
socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
  connectRetryToastShown = false;
});
socket.on('connect_error', (err) => {
  console.error('Socket connection error:', err);
  if (!connectRetryToastShown) {
    showToast('Server waking up... retrying connection');
    connectRetryToastShown = true;
  }
});

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toastEl.classList.remove('show'), 3000);
}

// ---------- Name gate ----------
if (userName) {
  nameInput.value = userName;
  enterBtn.disabled = false;
  // If the user is already marked authed (came from a login), auto-enter the room
  if (window.NebulaFlow && typeof NebulaFlow.isAuthed === 'function' && NebulaFlow.isAuthed()) {
    setTimeout(enterClicked, 250);
  }
}
nameInput.addEventListener('input', () => {
  enterBtn.disabled = nameInput.value.trim().length === 0;
});
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !enterBtn.disabled) enterClicked(); });
enterBtn.addEventListener('click', enterClicked);

function enterClicked(){
  userName = nameInput.value.trim();
  if (!userName) return;
  localStorage.setItem('nebula_user_name', userName);

  gate.style.opacity = '0';
  gate.style.transform = 'translateY(-30px) scale(.96)';
  gate.style.transition = '.4s ease';
  setTimeout(() => {
    gate.style.display = 'none';
    app.style.display = 'flex';
  }, 380);

  socket.emit('user_join', { userId, name: userName });
}

// ---------- Socket events ----------
socket.on('joined', ({ userId: id, name }) => {
  userId = id;
  localStorage.setItem('nebula_user_id', userId);
});

socket.on('admin_presence', ({ online }) => {
  if (online) {
    adminStatus.textContent = 'online';
    adminStatus.classList.remove('offline');
    adminAvatar.classList.remove('offline');
  } else {
    adminStatus.textContent = 'offline — we\'ll reply soon';
    adminStatus.classList.add('offline');
    adminAvatar.classList.add('offline');
  }
});

socket.on('history', (history) => {
  messages.innerHTML = '';
  history.forEach(renderMessage);
  scrollBottom();
});

socket.on('new_message', (msg) => {
  removeTyping();
  renderMessage(msg);
  scrollBottom();
});
socket.on('typing', ({ sender }) => {
  if (sender === 'admin') showTyping();
});

// ---------- Render ----------
function scrollBottom(){ messages.scrollTop = messages.scrollHeight; }

function fmtTime(ts){
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMessage(msg){
  const who = msg.sender === 'user' ? 'me' : 'them';
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

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ---------- Typing indicator ----------
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

// ---------- Sending text ----------
function sendText(){
  const val = textInput.value.trim();
  if (!val) return;
  socket.emit('user_message', { type: 'text', content: val });
  textInput.value = '';
}
sendBtn.addEventListener('click', () => {
  if (recording) { stopRecording(); return; }
  sendText();
});
textInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });

textInput.addEventListener('input', () => {
  socket.emit('typing', { sender: 'user' });
});

// ---------- Photo ----------
photoBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  resizeImage(file, 1000, 0.8).then(blob => {
    const fd = new FormData();
    fd.append('file', blob, 'photo.jpg');
    fetch('/upload', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(data => {
        if (data.url) socket.emit('user_message', { type: 'photo', content: data.url });
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
  if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showToast('⚠️ Mic needs HTTPS. Open the site on the PC (localhost) to use voice.');
    return;
  }
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
          if (data.url) socket.emit('user_message', { type: 'voice', content: data.url });
        })
        .catch(() => showToast('Upload failed. Try again.'));
    };
    mediaRecorder.start();
    recording = true;
    inputbar.classList.add('recording');
    micBtn.style.background = 'var(--danger)';
    micBtn.style.borderColor = 'var(--danger)';
  } catch (err) {
    if (location.protocol === 'http:' && location.hostname !== 'localhost') {
      showToast('Mic blocked on HTTP. Ask admin to enable HTTPS or use localhost.');
    } else {
      showToast('Microphone access denied — please allow mic in browser settings.');
    }
  }
}
function stopRecording(){
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  recording = false;
  inputbar.classList.remove('recording');
  micBtn.style.background = '';
  micBtn.style.borderColor = '';
}

// ---------- Calls & live photo ----------
NebulaCall.init({
  socket,
  role: 'user',
  getRoomId: () => userId,
  getPeerName: () => 'Support',
  onToast: showToast
});

document.getElementById('voiceCallBtn').addEventListener('click', () => {
  NebulaCall.startCall('audio');
});
document.getElementById('videoCallBtn').addEventListener('click', () => {
  NebulaCall.startCall('video');
});

document.getElementById('cameraBtn').addEventListener('click', () => {
  NebulaCall.openCamera(blob => {
    const fd = new FormData();
    fd.append('file', blob, 'live-photo.jpg');
    fetch('/upload', { method: 'POST', body: fd })
      .then(r => r.json())
      .then(data => {
        if (data.url) socket.emit('user_message', { type: 'photo', content: data.url });
      })
      .catch(() => showToast('Upload failed. Try again.'));
  });
});