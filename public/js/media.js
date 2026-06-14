/* ============================================================
   Nebula Call Manager
   Shared WebRTC (voice/video/screen-share) + live camera capture
   Used by both the user app and the admin dashboard.
   ============================================================ */

(function () {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // ---------- Build overlay DOM ----------
  const overlay = document.createElement('div');
  overlay.className = 'call-overlay';
  overlay.id = 'callOverlay';
  overlay.innerHTML = `
    <div class="call-bg"></div>
    <div class="call-top">
      <div class="call-status" id="callStatusText">Calling…</div>
      <div class="call-peer-name" id="callPeerName"></div>
      <div class="call-timer" id="callTimerText">00:00</div>
    </div>
    <div class="call-video-wrap">
      <video id="remoteVideo" autoplay playsinline></video>
      <div class="call-avatar-fallback" id="callAvatarFallback">
        <div class="call-ring r1"></div>
        <div class="call-ring r2"></div>
        <div class="sphere3d"></div>
      </div>
      <video id="localVideo" autoplay playsinline muted></video>
    </div>
    <div class="call-controls">
      <button class="call-btn" id="callMuteBtn" title="Mute">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      </button>
      <button class="call-btn" id="callCamBtn" title="Camera">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
      </button>
      <button class="call-btn" id="callShareBtn" title="Share screen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      </button>
      <button class="call-btn end" id="callEndBtn" title="End call">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path transform="rotate(135 12 12)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1 .34 1.99.62 2.94a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.14-1.14a2 2 0 0 1 2.11-.45c.95.28 1.94.49 2.94.62A2 2 0 0 1 22 16.92z"/></svg>
      </button>
    </div>
  `;

  const incomingModal = document.createElement('div');
  incomingModal.className = 'incoming-call-modal';
  incomingModal.id = 'incomingCallModal';
  incomingModal.innerHTML = `
    <div class="sphere3d"></div>
    <h3 id="incomingCallTitle">Incoming call</h3>
    <p id="incomingCallSub"></p>
    <div class="incoming-actions">
      <button class="call-btn end" id="rejectCallBtn" title="Decline">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path transform="rotate(135 12 12)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1 .34 1.99.62 2.94a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.14-1.14a2 2 0 0 1 2.11-.45c.95.28 1.94.49 2.94.62A2 2 0 0 1 22 16.92z"/></svg>
      </button>
      <button class="call-btn accept" id="acceptCallBtn" title="Accept">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1 .34 1.99.62 2.94a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.14-1.14a2 2 0 0 1 2.11-.45c.95.28 1.94.49 2.94.62A2 2 0 0 1 22 16.92z"/></svg>
      </button>
    </div>
  `;

  const cameraModal = document.createElement('div');
  cameraModal.className = 'camera-modal';
  cameraModal.id = 'cameraModal';
  cameraModal.innerHTML = `
    <video id="cameraPreview" autoplay playsinline muted></video>
    <canvas id="cameraCanvas"></canvas>
    <div class="camera-actions">
      <button class="call-btn end" id="cameraCloseBtn" title="Cancel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <button class="shutter-btn" id="cameraShutterBtn" title="Capture"></button>
      <button class="call-btn" id="cameraFlipBtn" title="Switch camera">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
      </button>
    </div>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(overlay);
    document.body.appendChild(incomingModal);
    document.body.appendChild(cameraModal);
    bindUI();
  });

  // ---------- State ----------
  let socket = null;
  let role = null;          // 'user' | 'admin'
  let getRoomId = () => null;
  let getPeerName = () => 'Contact';
  let onToast = (msg) => console.log(msg);

  let pc = null;
  let localStream = null;
  let screenTrack = null;
  let cameraVideoTrack = null;
  let currentRoomId = null;
  let currentCallType = null; // 'audio' | 'video'
  let isCaller = false;
  let pendingOffer = null;
  let pendingCandidates = [];
  let callTimer = null;
  let callSeconds = 0;
  let ringTimeout = null;
  let muted = false;
  let camOff = false;
  let sharingScreen = false;

  // DOM refs (filled on DOMContentLoaded)
  let remoteVideo, localVideo, callStatusText, callPeerName, callTimerText,
      callMuteBtn, callCamBtn, callShareBtn, callEndBtn,
      incomingCallTitle, incomingCallSub, acceptCallBtn, rejectCallBtn,
      cameraPreview, cameraCanvas, cameraShutterBtn, cameraCloseBtn, cameraFlipBtn;

  function bindUI() {
    remoteVideo = document.getElementById('remoteVideo');
    localVideo = document.getElementById('localVideo');
    callStatusText = document.getElementById('callStatusText');
    callPeerName = document.getElementById('callPeerName');
    callTimerText = document.getElementById('callTimerText');
    callMuteBtn = document.getElementById('callMuteBtn');
    callCamBtn = document.getElementById('callCamBtn');
    callShareBtn = document.getElementById('callShareBtn');
    callEndBtn = document.getElementById('callEndBtn');
    incomingCallTitle = document.getElementById('incomingCallTitle');
    incomingCallSub = document.getElementById('incomingCallSub');
    acceptCallBtn = document.getElementById('acceptCallBtn');
    rejectCallBtn = document.getElementById('rejectCallBtn');
    cameraPreview = document.getElementById('cameraPreview');
    cameraCanvas = document.getElementById('cameraCanvas');
    cameraShutterBtn = document.getElementById('cameraShutterBtn');
    cameraCloseBtn = document.getElementById('cameraCloseBtn');
    cameraFlipBtn = document.getElementById('cameraFlipBtn');

    callEndBtn.addEventListener('click', () => endCall(true));
    callMuteBtn.addEventListener('click', toggleMute);
    callCamBtn.addEventListener('click', toggleCamera);
    callShareBtn.addEventListener('click', toggleScreenShare);
    acceptCallBtn.addEventListener('click', acceptIncomingCall);
    rejectCallBtn.addEventListener('click', () => {
      if (pendingOffer) {
        socket.emit('call_reject', { roomId: pendingOffer.roomId, from: role });
      }
      hideIncoming();
    });

    cameraCloseBtn.addEventListener('click', closeCamera);
    cameraShutterBtn.addEventListener('click', capturePhoto);
    cameraFlipBtn.addEventListener('click', flipCamera);
  }

  // ---------- Public init ----------
  function init(opts) {
    socket = opts.socket;
    role = opts.role;
    getRoomId = opts.getRoomId || getRoomId;
    getPeerName = opts.getPeerName || getPeerName;
    onToast = opts.onToast || onToast;

    socket.on('call_offer', handleOffer);
    socket.on('call_answer', handleAnswer);
    socket.on('ice_candidate', handleRemoteIce);
    socket.on('call_reject', handleReject);
    socket.on('call_end', handleRemoteEnd);
    socket.on('call_busy', handleBusy);
  }

  // ---------- Helpers ----------
  function setStatus(text) { callStatusText.textContent = text; }
  function setPeerName() { callPeerName.textContent = getPeerName() || ''; }

  function showOverlay(type) {
    overlay.classList.add('active');
    overlay.classList.toggle('video', type === 'video');
    overlay.classList.remove('remote-video-active', 'screen-sharing');
    setPeerName();
  }
  function hideOverlay() {
    overlay.classList.remove('active', 'video', 'remote-video-active', 'screen-sharing');
  }
  function showIncoming(type, name) {
    incomingCallTitle.textContent = type === 'video' ? 'Incoming video call' : 'Incoming voice call';
    incomingCallSub.textContent = name || '';
    incomingModal.classList.add('active');
  }
  function hideIncoming() {
    incomingModal.classList.remove('active');
    pendingOffer = null;
  }

  function startTimer() {
    callSeconds = 0;
    callTimerText.textContent = '00:00';
    clearInterval(callTimer);
    callTimer = setInterval(() => {
      callSeconds++;
      const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
      const s = String(callSeconds % 60).padStart(2, '0');
      callTimerText.textContent = `${m}:${s}`;
    }, 1000);
  }
  function stopTimer() { clearInterval(callTimer); callTimer = null; }

  function syncCallButtons(active, type) {
    document.querySelectorAll('#voiceCallBtn').forEach(b => b.classList.toggle('in-call', active && type === 'audio'));
    document.querySelectorAll('#videoCallBtn').forEach(b => b.classList.toggle('in-call', active));
  }

  // ---------- Peer connection setup ----------
  function createPeerConnection(roomId) {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    conn.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice_candidate', { roomId, candidate: e.candidate, from: role });
      }
    };
    conn.ontrack = (e) => {
      if (remoteVideo.srcObject !== e.streams[0]) {
        remoteVideo.srcObject = e.streams[0];
      }
      if (e.track.kind === 'video') {
        overlay.classList.add('remote-video-active');
      }
      setStatus('Connected');
      startTimer();
    };
    conn.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(conn.connectionState)) {
        if (overlay.classList.contains('active')) endCall(false);
      }
    };
    return conn;
  }

  async function getLocalStream(type) {
    const constraints = { audio: true, video: type === 'video' ? { facingMode: 'user' } : false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (type === 'video') {
      const vt = stream.getVideoTracks()[0];
      cameraVideoTrack = vt;
    }
    return stream;
  }

  // ---------- Outgoing call ----------
  async function startCall(type) {
    const roomId = getRoomId();
    if (!roomId) { onToast('Open a conversation first.'); return; }
    if (overlay.classList.contains('active') || incomingModal.classList.contains('active')) {
      onToast('A call is already in progress.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onToast('Calling needs HTTPS or localhost.');
      return;
    }

    currentRoomId = roomId;
    currentCallType = type;
    isCaller = true;
    muted = false; camOff = false; sharingScreen = false;

    try {
      localStream = await getLocalStream(type);
    } catch (err) {
      onToast('Camera/microphone access denied.');
      return;
    }

    pc = createPeerConnection(roomId);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    localVideo.srcObject = localStream;
    showOverlay(type);
    setStatus('Calling…');
    syncCallButtons(true, type);
    updateControlButtons();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('call_offer', { roomId, sdp: offer, callType: type, from: role });

    ringTimeout = setTimeout(() => {
      if (overlay.classList.contains('active') && callStatusText.textContent === 'Calling…') {
        onToast('No answer.');
        endCall(true);
      }
    }, 35000);
  }

  // ---------- Incoming call ----------
  function handleOffer({ roomId, sdp, callType, from }) {
    if (overlay.classList.contains('active') || incomingModal.classList.contains('active')) {
      socket.emit('call_busy', { roomId, from: role });
      return;
    }
    pendingOffer = { roomId, sdp, callType, from };
    showIncoming(callType, getPeerName());
  }

  async function acceptIncomingCall() {
    if (!pendingOffer) return;
    const { roomId, sdp, callType } = pendingOffer;
    hideIncoming();

    currentRoomId = roomId;
    currentCallType = callType;
    isCaller = false;
    muted = false; camOff = false; sharingScreen = false;

    try {
      localStream = await getLocalStream(callType);
    } catch (err) {
      onToast('Camera/microphone access denied.');
      socket.emit('call_reject', { roomId, from: role });
      return;
    }

    pc = createPeerConnection(roomId);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    localVideo.srcObject = localStream;

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    flushCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('call_answer', { roomId, sdp: answer, from: role });

    showOverlay(callType);
    setStatus('Connected');
    syncCallButtons(true, callType);
    updateControlButtons();
    startTimer();
  }

  async function handleAnswer({ sdp }) {
    if (!pc) return;
    clearTimeout(ringTimeout);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    flushCandidates();
    setStatus('Connected');
    startTimer();
  }

  function handleRemoteIce({ candidate }) {
    if (pc && pc.remoteDescription) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    } else {
      pendingCandidates.push(candidate);
    }
  }
  function flushCandidates() {
    pendingCandidates.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
    pendingCandidates = [];
  }

  function handleReject() {
    clearTimeout(ringTimeout);
    if (isCaller) {
      onToast('Call declined.');
      cleanup();
    }
  }
  function handleBusy() {
    clearTimeout(ringTimeout);
    if (isCaller) {
      onToast('User is on another call.');
      cleanup();
    }
  }
  function handleRemoteEnd() {
    onToast('Call ended.');
    cleanup();
  }

  // ---------- End call ----------
  function endCall(notify) {
    if (notify && currentRoomId) {
      socket.emit('call_end', { roomId: currentRoomId, from: role });
    }
    cleanup();
  }

  function cleanup() {
    clearTimeout(ringTimeout);
    stopTimer();
    hideOverlay();
    hideIncoming();
    syncCallButtons(false, null);

    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (screenTrack) { try { screenTrack.stop(); } catch (e) {} screenTrack = null; }

    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    pendingCandidates = [];
    currentRoomId = null;
    currentCallType = null;
    isCaller = false;
    sharingScreen = false;
    overlay.classList.remove('screen-sharing');
  }

  // ---------- Controls ----------
  function updateControlButtons() {
    callMuteBtn.classList.toggle('toggled-off', muted);
    callCamBtn.classList.toggle('toggled-off', camOff);
    callCamBtn.style.display = currentCallType === 'video' ? 'flex' : 'none';
    callShareBtn.style.display = currentCallType === 'video' ? 'flex' : 'none';
    callShareBtn.classList.toggle('toggled-off', sharingScreen);
    setStatus(overlay.classList.contains('active') ? (callTimer ? 'Connected' : 'Calling…') : '');
  }

  function toggleMute() {
    if (!localStream) return;
    muted = !muted;
    localStream.getAudioTracks().forEach(t => t.enabled = !muted);
    updateControlButtons();
  }

  function toggleCamera() {
    if (!localStream || currentCallType !== 'video') return;
    camOff = !camOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !camOff);
    updateControlButtons();
  }

  async function toggleScreenShare() {
    if (!pc || currentCallType !== 'video') return;
    if (!sharingScreen) {
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenTrack = display.getVideoTracks()[0];
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);
        localVideo.srcObject = display;
        sharingScreen = true;
        overlay.classList.add('screen-sharing');
        screenTrack.onended = () => stopScreenShare();
        updateControlButtons();
      } catch (err) { /* user cancelled */ }
    } else {
      stopScreenShare();
    }
  }
  async function stopScreenShare() {
    if (!pc || !cameraVideoTrack) return;
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) await sender.replaceTrack(cameraVideoTrack);
    if (screenTrack) { try { screenTrack.stop(); } catch (e) {} screenTrack = null; }
    localVideo.srcObject = localStream;
    sharingScreen = false;
    overlay.classList.remove('screen-sharing');
    updateControlButtons();
  }

  // ---------- Live camera capture (send as photo) ----------
  let cameraStream = null;
  let captureCallback = null;
  let currentFacing = 'user';

  async function openCamera(onCapture) {
    captureCallback = onCapture;
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacing }, audio: false });
      cameraPreview.srcObject = cameraStream;
      cameraModal.classList.add('active');
    } catch (err) {
      onToast('Camera access denied.');
    }
  }
  function closeCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    cameraModal.classList.remove('active');
    captureCallback = null;
  }
  async function flipCamera() {
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacing }, audio: false });
      cameraPreview.srcObject = cameraStream;
    } catch (err) {
      currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    }
  }
  function capturePhoto() {
    const w = cameraPreview.videoWidth, h = cameraPreview.videoHeight;
    if (!w || !h) return;
    cameraCanvas.width = w;
    cameraCanvas.height = h;
    const ctx = cameraCanvas.getContext('2d');
    if (currentFacing === 'user') {
      ctx.translate(w, 0); ctx.scale(-1, 1);
    }
    ctx.drawImage(cameraPreview, 0, 0, w, h);
    cameraCanvas.toBlob(blob => {
      if (captureCallback) captureCallback(blob);
      closeCamera();
    }, 'image/jpeg', 0.85);
  }

  // ---------- Expose ----------
  window.NebulaCall = { init, startCall, endCall, openCamera };
})();
