// Main Application Coordinator for Zoodle
let socket = null;
let canvasEngine = null;
let webrtcManager = null;
let gameManager = null;

// Standard Doodle Palette
const DOODLE_PALETTE = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#f59e0b', '#84cc16', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
  '#78350f', '#94a3b8', '#334155', '#475569'
];

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function triggerHaptic(type = 'light') {
  if (window.navigator && window.navigator.vibrate) {
    if (type === 'light') window.navigator.vibrate(15);
    else if (type === 'medium') window.navigator.vibrate(35);
    else if (type === 'success') window.navigator.vibrate([40, 60, 90]);
    else if (type === 'error') window.navigator.vibrate([60, 40, 60]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Synchronously setup all UI components immediately so buttons are ALWAYS interactive
  try {
    setupAvatarUI();
  } catch (err) {
    console.error('setupAvatarUI error:', err);
  }

  try {
    setupCanvasUI();
  } catch (err) {
    console.error('setupCanvasUI error:', err);
  }

  try {
    setupLobbyActions();
  } catch (err) {
    console.error('setupLobbyActions error:', err);
  }

  try {
    setupInGameControls();
  } catch (err) {
    console.error('setupInGameControls error:', err);
  }

  // 2. Initialize Canvas Engine
  try {
    canvasEngine = new CanvasEngine('drawing-canvas');
    canvasEngine.onStrokeEmit = (stroke) => {
      if (socket && socket.connected) socket.emit('draw-stroke', stroke);
    };
    canvasEngine.onFillEmit = (fill) => {
      if (socket && socket.connected) socket.emit('draw-fill', fill);
    };

    const btnClear = document.getElementById('btn-clear');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        triggerHaptic('medium');
        if (canvasEngine && canvasEngine.isDrawerActive) {
          window.soundManager.playPop();
          canvasEngine.clear();
          if (socket && socket.connected) socket.emit('draw-clear');
        }
      });
    }

    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
      btnUndo.addEventListener('click', () => {
        triggerHaptic('light');
        if (canvasEngine && canvasEngine.isDrawerActive) {
          window.soundManager.playPop();
          if (socket && socket.connected) socket.emit('draw-undo');
        }
      });
    }
  } catch (err) {
    console.error('Canvas initialization error:', err);
  }

  // 3. Resolve Backend URL (Cloud Render server for Android APK & production web)
  let BACKEND_URL = 'https://zoodle-kqah.onrender.com';
  if (window.location.hostname === 'localhost' && window.location.port === '3000') {
    BACKEND_URL = 'http://localhost:3000';
  } else if (window.location.hostname.includes('onrender.com')) {
    BACKEND_URL = window.location.origin;
  }

  // 4. Initialize Socket.IO connection
  try {
    if (typeof io !== 'undefined') {
      socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 15,
        timeout: 10000
      });

      socket.on('connect', () => {
        console.log('Connected to Zoodle Server:', socket.id);
      });

      socket.on('connect_error', (err) => {
        console.warn('Socket connect error:', err.message);
      });
    } else {
      console.warn('Socket.IO client library not loaded yet');
    }
  } catch (err) {
    console.error('Socket initialization failed:', err);
  }

  // 5. Initialize WebRTC Manager & GameManager
  try {
    webrtcManager = new WebRTCManager(socket);
    gameManager = new GameManager(socket, canvasEngine, webrtcManager);

    // Asynchronously initialize local camera & mic preview without blocking UI
    webrtcManager.initLocalMedia('lobby-video-preview').catch(err => {
      console.warn('WebRTC local media init non-fatal:', err);
    });
  } catch (err) {
    console.error('WebRTC / GameManager initialization error:', err);
  }

  // 6. Check URL hash for direct room join (e.g. #ABCD12)
  if (window.location.hash && window.location.hash.length > 1) {
    const codeFromHash = window.location.hash.substring(1).toUpperCase().trim();
    const roomInput = document.getElementById('input-room-code');
    if (roomInput) {
      roomInput.value = codeFromHash;
    }
  }
});

function setupAvatarUI() {
  const avatarBox = document.getElementById('avatar-preview');
  const labelEyes = document.getElementById('label-eyes');
  const labelMouth = document.getElementById('label-mouth');
  const paletteBox = document.getElementById('avatar-color-palette');

  function renderCurrentAvatar() {
    if (avatarBox && window.avatarGen) {
      avatarBox.innerHTML = window.avatarGen.renderSVG();
    }
    if (window.avatarGen && typeof EYE_STYLES !== 'undefined') {
      const eyeObj = EYE_STYLES.find(e => e.id === window.avatarGen.current.eyes);
      const mouthObj = MOUTH_STYLES.find(m => m.id === window.avatarGen.current.mouth);
      if (labelEyes) labelEyes.innerText = eyeObj ? eyeObj.name : 'Style 1';
      if (labelMouth) labelMouth.innerText = mouthObj ? mouthObj.name : 'Smile';
    }
  }

  // Populate color swatches
  if (paletteBox && typeof AVATAR_COLORS !== 'undefined') {
    paletteBox.innerHTML = '';
    AVATAR_COLORS.forEach(c => {
      const swatch = document.createElement('div');
      swatch.className = `avatar-color-swatch ${window.avatarGen && c === window.avatarGen.current.color ? 'active' : ''}`;
      swatch.style.backgroundColor = c;
      swatch.addEventListener('click', () => {
        triggerHaptic('light');
        if (window.soundManager) window.soundManager.playPop();
        if (window.avatarGen) window.avatarGen.current.color = c;
        document.querySelectorAll('.avatar-color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        renderCurrentAvatar();
      });
      paletteBox.appendChild(swatch);
    });
  }

  // Steppers
  document.getElementById('btn-next-eyes')?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    if (window.avatarGen && typeof EYE_STYLES !== 'undefined') {
      let next = window.avatarGen.current.eyes + 1;
      if (next > EYE_STYLES.length) next = 1;
      window.avatarGen.current.eyes = next;
      renderCurrentAvatar();
    }
  });

  document.getElementById('btn-prev-eyes')?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    if (window.avatarGen && typeof EYE_STYLES !== 'undefined') {
      let prev = window.avatarGen.current.eyes - 1;
      if (prev < 1) prev = EYE_STYLES.length;
      window.avatarGen.current.eyes = prev;
      renderCurrentAvatar();
    }
  });

  document.getElementById('btn-next-mouth')?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    if (window.avatarGen && typeof MOUTH_STYLES !== 'undefined') {
      let next = window.avatarGen.current.mouth + 1;
      if (next > MOUTH_STYLES.length) next = 1;
      window.avatarGen.current.mouth = next;
      renderCurrentAvatar();
    }
  });

  document.getElementById('btn-prev-mouth')?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    if (window.avatarGen && typeof MOUTH_STYLES !== 'undefined') {
      let prev = window.avatarGen.current.mouth - 1;
      if (prev < 1) prev = MOUTH_STYLES.length;
      window.avatarGen.current.mouth = prev;
      renderCurrentAvatar();
    }
  });

  // Dice randomize
  document.getElementById('btn-random-avatar')?.addEventListener('click', () => {
    triggerHaptic('medium');
    if (window.soundManager) window.soundManager.playPop();
    if (window.avatarGen) {
      window.avatarGen.randomize();
      document.querySelectorAll('.avatar-color-swatch').forEach(s => {
        s.classList.toggle('active', s.style.backgroundColor === window.avatarGen.current.color);
      });
      renderCurrentAvatar();
    }
  });

  renderCurrentAvatar();
}

function setupCanvasUI() {
  const paletteContainer = document.getElementById('canvas-palette');
  if (paletteContainer) {
    paletteContainer.innerHTML = '';
    DOODLE_PALETTE.forEach((colorHex, idx) => {
      const swatch = document.createElement('div');
      swatch.className = `palette-color ${idx === 0 ? 'active' : ''}`;
      swatch.style.backgroundColor = colorHex;
      swatch.addEventListener('click', () => {
        triggerHaptic('light');
        if (window.soundManager) window.soundManager.playPop();
        if (canvasEngine) canvasEngine.currentColor = colorHex;
        document.querySelectorAll('.palette-color').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      });
      paletteContainer.appendChild(swatch);
    });
  }

  // Custom Color input
  const customColor = document.getElementById('custom-color-picker');
  if (customColor) {
    customColor.addEventListener('input', (e) => {
      if (canvasEngine) canvasEngine.currentColor = e.target.value;
      document.querySelectorAll('.palette-color').forEach(s => s.classList.remove('active'));
    });
  }

  // Tool switches (brush, fill, eraser)
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('light');
      if (window.soundManager) window.soundManager.playPop();
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (canvasEngine) canvasEngine.currentTool = btn.dataset.tool;
    });
  });

  // Brush Size buttons
  document.querySelectorAll('.size-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('light');
      if (window.soundManager) window.soundManager.playPop();
      document.querySelectorAll('.size-dot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (canvasEngine) canvasEngine.currentSize = parseInt(btn.dataset.size, 10);
    });
  });
}

function setupLobbyActions() {
  const inputNickname = document.getElementById('input-nickname');
  const inputRoomCode = document.getElementById('input-room-code');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');

  const btnToggleCam = document.getElementById('btn-toggle-cam');
  const btnToggleMic = document.getElementById('btn-toggle-mic');

  // Random placeholder nickname
  const coolNames = ['CaptainDoodle', 'PixelPanda', 'SketchFox', 'ArtisticOtter', 'TurboPencil', 'CosmicCat'];
  if (inputNickname) {
    inputNickname.placeholder = coolNames[Math.floor(Math.random() * coolNames.length)];
  }

  // Lobby cam & mic toggle buttons
  btnToggleCam?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    if (webrtcManager) {
      const active = webrtcManager.toggleCamera();
      btnToggleCam.classList.toggle('active', active);
      btnToggleCam.classList.toggle('muted', !active);
      const lbl = btnToggleCam.querySelector('.label');
      if (lbl) lbl.innerText = active ? 'Camera ON' : 'Camera OFF';
    }
  });

  btnToggleMic?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    if (webrtcManager) {
      const active = webrtcManager.toggleMicrophone();
      btnToggleMic.classList.toggle('active', active);
      btnToggleMic.classList.toggle('muted', !active);
      const lbl = btnToggleMic.querySelector('.label');
      if (lbl) lbl.innerText = active ? 'Mic ON' : 'Mic MUTED';
    }
  });

  // Create Room
  btnCreateRoom?.addEventListener('click', () => {
    triggerHaptic('success');
    if (window.soundManager) window.soundManager.playPop();
    if (!socket || !socket.connected) {
      showToast('Connecting to server... Please try in a second.', 'info');
      if (socket) socket.connect();
      return;
    }
    const nickname = (inputNickname?.value || '').trim() || inputNickname?.placeholder || 'Player';
    const roundsEl = document.getElementById('select-rounds');
    const drawTimeEl = document.getElementById('select-draw-time');
    const rounds = roundsEl ? parseInt(roundsEl.value, 10) : 3;
    const drawTime = drawTimeEl ? parseInt(drawTimeEl.value, 10) : 60;

    socket.emit('create-room', {
      playerData: {
        name: nickname,
        avatar: window.avatarGen ? window.avatarGen.current : { eyes: 1, mouth: 1, color: '#38bdf8' },
        videoEnabled: webrtcManager ? webrtcManager.videoEnabled : true,
        audioEnabled: webrtcManager ? webrtcManager.audioEnabled : true
      },
      settings: { rounds, drawTime }
    }, (res) => {
      if (res && res.success) {
        enterGameScreen(res);
      } else {
        showToast(res ? res.message : 'Error creating room', 'error');
      }
    });
  });

  // Join Room
  btnJoinRoom?.addEventListener('click', () => {
    const code = (inputRoomCode?.value || '').trim().toUpperCase();
    if (!code) {
      triggerHaptic('error');
      showToast('Please enter a 6-letter room code!', 'warning');
      return;
    }
    triggerHaptic('success');
    if (window.soundManager) window.soundManager.playPop();
    if (!socket || !socket.connected) {
      showToast('Connecting to server... Please try in a second.', 'info');
      if (socket) socket.connect();
      return;
    }
    const nickname = (inputNickname?.value || '').trim() || inputNickname?.placeholder || 'Player';

    socket.emit('join-room', {
      roomCode: code,
      playerData: {
        name: nickname,
        avatar: window.avatarGen ? window.avatarGen.current : { eyes: 1, mouth: 1, color: '#38bdf8' },
        videoEnabled: webrtcManager ? webrtcManager.videoEnabled : true,
        audioEnabled: webrtcManager ? webrtcManager.audioEnabled : true
      }
    }, (res) => {
      if (res && res.success) {
        enterGameScreen(res);
      } else {
        showToast(res ? res.message : 'Failed to join room', 'error');
      }
    });
  });
}

function enterGameScreen(roomData) {
  document.getElementById('lobby-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');

  // Attach local video stream to in-game video tile
  const localVideoEl = document.getElementById('local-video');
  if (localVideoEl && webrtcManager.localStream) {
    localVideoEl.srcObject = webrtcManager.localStream;
  }

  // Set user tag
  document.getElementById('local-user-tag').innerText = `${roomData.player.name} (You)`;
  document.getElementById('local-placeholder-avatar').innerHTML = window.avatarGen.renderSVG(roomData.player.avatar);

  // Update game state
  gameManager.setRoomData(roomData);

  // Update URL hash for easy sharing
  window.location.hash = roomData.roomCode;
}

function setupInGameControls() {
  // In-Game Copy room code button
  const btnCopy = document.getElementById('btn-copy-room');
  btnCopy?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    const code = gameManager ? gameManager.roomCode : '';
    const inviteUrl = `${window.location.origin}${window.location.pathname}#${code}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      showToast('Invite link copied to clipboard! 📋', 'success');
    }).catch(() => {
      navigator.clipboard.writeText(code);
      showToast(`Room code ${code} copied!`, 'success');
    });
  });

  // Leave room button
  document.getElementById('btn-leave-room')?.addEventListener('click', () => {
    triggerHaptic('medium');
    if (confirm('Are you sure you want to leave this game?')) {
      window.location.hash = '';
      window.location.reload();
    }
  });

  // In-game cam & mic circular toggles
  const inGameCamBtn = document.getElementById('in-game-cam-toggle');
  const inGameMicBtn = document.getElementById('in-game-mic-toggle');

  inGameCamBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    if (webrtcManager) {
      const active = webrtcManager.toggleCamera();
      inGameCamBtn.classList.toggle('active', active);
      inGameCamBtn.classList.toggle('muted', !active);
      inGameCamBtn.innerText = active ? '📹' : '🚫';
    }
  });

  inGameMicBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    if (window.soundManager) window.soundManager.playPop();
    if (webrtcManager) {
      const active = webrtcManager.toggleMicrophone();
      inGameMicBtn.classList.toggle('active', active);
      inGameMicBtn.classList.toggle('muted', !active);
      inGameMicBtn.innerText = active ? '🎙️' : '🔇';
    }
  });

  // Floating Reaction buttons (WhatsApp video call style)
  document.querySelectorAll('.btn-react').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic('light');
      const emoji = btn.dataset.reaction;
      if (window.soundManager) window.soundManager.playPop();
      if (webrtcManager && socket) {
        webrtcManager.triggerReactionAnimation(socket.id, emoji);
        socket.emit('webrtc-reaction', { reaction: emoji });
      }
    });
  });

  // Mobile Scoreboard Toggle & Close
  const btnToggleScoreboard = document.getElementById('btn-toggle-scoreboard');
  const btnCloseScoreboard = document.getElementById('btn-close-scoreboard');
  const scoreboardDrawer = document.getElementById('game-sidebar-left');

  if (btnToggleScoreboard && scoreboardDrawer) {
    btnToggleScoreboard.addEventListener('click', () => {
      triggerHaptic('light');
      if (window.soundManager) window.soundManager.playPop();
      scoreboardDrawer.classList.toggle('mobile-open');
    });
  }

  if (btnCloseScoreboard && scoreboardDrawer) {
    btnCloseScoreboard.addEventListener('click', () => {
      triggerHaptic('light');
      if (window.soundManager) window.soundManager.playPop();
      scoreboardDrawer.classList.remove('mobile-open');
    });
  }

  // Back to lobby from podium
  document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
    triggerHaptic('medium');
    window.location.hash = '';
    window.location.reload();
  });
}
