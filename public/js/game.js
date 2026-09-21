// Game Engine and UI Synchronizer
class GameManager {
  constructor(socket, canvasEngine, webrtcManager) {
    this.socket = socket;
    this.canvas = canvasEngine;
    this.webrtc = webrtcManager;

    this.roomCode = '';
    this.player = null;
    this.players = [];
    this.isHost = false;
    this.state = 'LOBBY';
    this.currentDrawerId = null;

    this.timerMax = 75;
    this.currentTimer = 0;

    this.initElements();
    this.bindSocketEvents();
  }

  initElements() {
    this.maskedWordDisplay = document.getElementById('masked-word-display');
    this.wordHintStatus = document.getElementById('word-hint-status');
    this.timerText = document.getElementById('timer-text');
    this.timerRing = document.getElementById('timer-progress-ring');
    this.canvasBanner = document.getElementById('canvas-banner');
    this.bannerText = document.getElementById('banner-text');

    this.playersListContainer = document.getElementById('players-list-container');
    this.playerCountBadge = document.getElementById('player-count-badge');
    this.chatMessagesBox = document.getElementById('chat-messages-box');
    this.chatForm = document.getElementById('chat-form');
    this.inputGuess = document.getElementById('input-guess');

    this.hostStartContainer = document.getElementById('host-start-container');
    this.btnStartGame = document.getElementById('btn-start-game');

    this.modalWordSelect = document.getElementById('modal-word-select');
    this.wordChoicesContainer = document.getElementById('word-choices-container');
    this.wordSelectTimer = document.getElementById('word-select-timer');

    this.modalRoundEnd = document.getElementById('modal-round-end');
    this.roundEndReason = document.getElementById('round-end-reason');
    this.roundRevealedWord = document.getElementById('round-revealed-word');
    this.roundPodiumContainer = document.getElementById('round-podium-container');
    this.nextTurnTimer = document.getElementById('next-turn-timer');

    this.modalGameOver = document.getElementById('modal-game-over');
    this.gamePodiumWrapper = document.getElementById('game-podium-wrapper');
    this.finalScoresList = document.getElementById('final-scores-list');
    this.btnPlayAgain = document.getElementById('btn-play-again');

    // Chat form submit
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.inputGuess.value.trim();
      if (!text) return;
      this.socket.emit('send-guess', { message: text });
      this.inputGuess.value = '';
    });

    // Host start game button
    this.btnStartGame.addEventListener('click', () => {
      window.soundManager.playPop();
      this.socket.emit('start-game', (res) => {
        if (res && !res.success) {
          showToast(res.message, 'warning');
        }
      });
    });

    // Host play again button
    this.btnPlayAgain.addEventListener('click', () => {
      this.socket.emit('play-again');
    });
  }

  setRoomData(data) {
    this.roomCode = data.roomCode;
    this.player = data.player;
    this.isHost = data.player.isHost;
    document.getElementById('display-room-code').innerText = this.roomCode;
    if (data.settings && data.settings.drawTime) {
      this.timerMax = data.settings.drawTime;
    }
    if (data.players) {
      this.updatePlayersList(data.players);
    }
    this.updateHostControls();
  }

  updateHostControls() {
    if (this.isHost && this.state === 'LOBBY') {
      this.hostStartContainer.classList.remove('hidden');
    } else {
      this.hostStartContainer.classList.add('hidden');
    }
  }

  updatePlayersList(players) {
    this.players = players;
    this.playerCountBadge.innerText = players.length;

    // Check if user is host now
    const me = players.find(p => p.id === this.socket.id);
    if (me) {
      this.isHost = me.isHost;
      this.updateHostControls();
    }

    // Sort players by score
    const sorted = [...players].sort((a, b) => b.score - a.score);

    this.playersListContainer.innerHTML = '';
    sorted.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = `player-card ${p.isDrawing ? 'is-drawer' : ''} ${p.hasGuessed ? 'has-guessed' : ''}`;

      const avatarSvg = window.avatarGen.renderSVG(p.avatar);
      card.innerHTML = `
        <span class="player-rank">#${idx + 1}</span>
        <div class="player-avatar-mini">${avatarSvg}</div>
        <div class="player-details">
          <div class="player-name">
            <span>${escapeHtml(p.name)}</span>
            ${p.isHost ? '<span class="host-crown" title="Host">👑</span>' : ''}
            ${p.isDrawing ? '<span class="drawing-pencil-icon" title="Drawing">✏️</span>' : ''}
          </div>
          <div class="player-score">${p.score} pts</div>
        </div>
        ${p.hasGuessed ? '<span class="guessed-check" title="Guessed the word!">✓</span>' : ''}
      `;
      this.playersListContainer.appendChild(card);

      // Also ensure video tile tags are in sync
      if (p.id !== this.socket.id) {
        const tag = document.getElementById(`tag-${p.id}`);
        if (tag) tag.innerText = p.name;
        const pAvatar = document.getElementById(`avatar-${p.id}`);
        if (pAvatar && !pAvatar.hasChildNodes()) {
          pAvatar.innerHTML = avatarSvg;
        }
      }
    });
  }

  updateTimer(timeLeft, maxTime = this.timerMax) {
    this.currentTimer = timeLeft;
    this.timerText.innerText = timeLeft;

    // Smooth dash offset for 44px circle (circumference ~ 113.1)
    const circumference = 2 * Math.PI * 18;
    const progress = Math.max(0, timeLeft / maxTime);
    const offset = circumference * (1 - progress);
    this.timerRing.style.strokeDashoffset = offset;

    // Change color as timer runs out
    if (timeLeft <= 10) {
      this.timerRing.style.stroke = '#ef4444';
      window.soundManager.playTick();
    } else if (timeLeft <= 25) {
      this.timerRing.style.stroke = '#f59e0b';
    } else {
      this.timerRing.style.stroke = '#10b981';
    }
  }

  appendChatMessage(senderName, text, type = 'normal') {
    const msgEl = document.createElement('div');
    if (type === 'system') {
      msgEl.className = 'system-chat-msg';
      msgEl.innerText = text;
    } else if (type === 'correct') {
      msgEl.className = 'chat-msg correct-guess';
      msgEl.innerHTML = `🎉 <strong>${escapeHtml(senderName)}</strong> guessed the word!`;
    } else if (type === 'close') {
      msgEl.className = 'chat-msg close-guess';
      msgEl.innerHTML = `💡 ${escapeHtml(text)}`;
    } else {
      msgEl.className = 'chat-msg';
      msgEl.innerHTML = `<span class="chat-sender">${escapeHtml(senderName)}:</span> ${escapeHtml(text)}`;
    }

    this.chatMessagesBox.appendChild(msgEl);
    this.chatMessagesBox.scrollTop = this.chatMessagesBox.scrollHeight;
  }

  bindSocketEvents() {
    // Player joined
    this.socket.on('player-joined', ({ player, players }) => {
      this.updatePlayersList(players);
      this.appendChatMessage(player.name, `${player.name} joined the room!`, 'system');
      window.soundManager.playPop();

      // Initiate WebRTC mesh call
      this.webrtc.callPeer(player.id, true);
    });

    // Player left
    this.socket.on('player-left', ({ playerId, playerName, players }) => {
      this.updatePlayersList(players);
      this.appendChatMessage(playerName, `${playerName} left the room.`, 'system');
      this.webrtc.removePeer(playerId);
    });

    // Timer tick
    this.socket.on('timer-tick', ({ timeLeft }) => {
      this.updateTimer(timeLeft);
    });

    // Word selection start
    this.socket.on('turn-start', ({ drawer, round, maxRounds, timeLeft }) => {
      this.state = 'WORD_SELECTION';
      this.currentDrawerId = drawer.id;
      document.getElementById('current-round-text').innerText = round;
      document.getElementById('max-rounds-text').innerText = maxRounds;
      this.updateHostControls();

      this.canvas.clear();
      this.canvas.setDrawerActive(false);

      this.modalRoundEnd.classList.add('hidden');
      this.modalGameOver.classList.add('hidden');

      if (drawer.id === this.socket.id) {
        this.bannerText.innerText = 'Choose a word to draw!';
        this.wordHintStatus.innerText = 'Selecting word...';
        this.maskedWordDisplay.innerText = '✏️ YOUR TURN';
      } else {
        this.bannerText.innerText = `${drawer.name} is choosing a word...`;
        this.wordHintStatus.innerText = 'Word selection';
        this.maskedWordDisplay.innerText = '🤔 THINKING...';
      }
    });

    // Drawer receives 3 words to choose from
    this.socket.on('select-word-prompt', ({ words, timeLeft }) => {
      this.wordChoicesContainer.innerHTML = '';
      this.wordSelectTimer.innerText = timeLeft;

      words.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'btn-word-choice';
        btn.innerHTML = `
          <span>${item.word.toUpperCase()}</span>
          <span class="diff-badge ${item.difficulty}">${item.difficulty}</span>
        `;
        btn.addEventListener('click', () => {
          window.soundManager.playPop();
          this.socket.emit('select-word', { word: item.word, difficulty: item.difficulty });
          this.modalWordSelect.classList.add('hidden');
        });
        this.wordChoicesContainer.appendChild(btn);
      });

      this.modalWordSelect.classList.remove('hidden');
    });

    // Drawing Started
    this.socket.on('drawing-started', ({ drawer, wordLength, maskedWord, timeLeft, difficulty }) => {
      this.state = 'DRAWING';
      this.modalWordSelect.classList.add('hidden');
      this.timerMax = timeLeft;
      this.updateTimer(timeLeft, timeLeft);

      const isMeDrawing = (drawer.id === this.socket.id);
      this.canvas.setDrawerActive(isMeDrawing);

      if (isMeDrawing) {
        this.bannerText.innerText = `You are drawing!`;
      } else {
        this.bannerText.innerText = `${drawer.name} is drawing!`;
        this.wordHintStatus.innerText = `Guess the word (${wordLength} letters)`;
        this.maskedWordDisplay.innerText = maskedWord;
      }
    });

    // Secret word sent to drawer
    this.socket.on('your-secret-word', ({ word, difficulty }) => {
      this.wordHintStatus.innerText = `Draw this word: (${difficulty})`;
      this.maskedWordDisplay.innerText = word;
      this.maskedWordDisplay.style.color = '#10b981';
    });

    // Progressive Hint update
    this.socket.on('hint-update', ({ maskedWord }) => {
      if (this.currentDrawerId !== this.socket.id) {
        this.maskedWordDisplay.innerText = maskedWord;
      }
    });

    // Remote Drawing Events
    this.socket.on('draw-stroke', (stroke) => {
      this.canvas.drawSmoothSegment(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY, stroke.color, stroke.size);
    });

    this.socket.on('draw-fill', (fill) => {
      this.canvas.floodFill(fill.x, fill.y, fill.color);
    });

    this.socket.on('draw-clear', () => {
      this.canvas.clear();
    });

    this.socket.on('canvas-restore', ({ history }) => {
      this.canvas.restoreHistory(history);
    });

    // Chat / Guessing
    this.socket.on('chat-message', ({ senderName, text }) => {
      this.appendChatMessage(senderName, text, 'normal');
    });

    this.socket.on('close-guess', ({ message }) => {
      this.appendChatMessage('Hint', message, 'close');
      window.soundManager.playTick();
    });

    this.socket.on('player-guessed', ({ playerName, points, players }) => {
      this.updatePlayersList(players);
      this.appendChatMessage(playerName, '', 'correct');
      window.soundManager.playCorrectGuess();
    });

    this.socket.on('guess-success', ({ word, points }) => {
      showToast(`Correct! You earned +${points} points! 🌟`, 'success');
      this.wordHintStatus.innerText = `You guessed it!`;
      this.maskedWordDisplay.innerText = word;
      this.maskedWordDisplay.style.color = '#10b981';
      window.soundManager.playCorrectGuess();
    });

    // Round Over Summary
    this.socket.on('round-over', ({ reason, word, players }) => {
      this.state = 'ROUND_OVER';
      this.updatePlayersList(players);
      this.canvas.setDrawerActive(false);

      this.roundEndReason.innerText = reason;
      this.roundRevealedWord.innerText = word;

      this.roundPodiumContainer.innerHTML = '';
      players.forEach(p => {
        if (p.roundScore > 0) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex; justify-content:space-between; padding:4px 8px; font-weight:700; color:#334155;';
          row.innerHTML = `<span>${escapeHtml(p.name)}</span><span style="color:#10b981;">+${p.roundScore} pts</span>`;
          this.roundPodiumContainer.appendChild(row);
        }
      });

      let countdown = 5;
      this.nextTurnTimer.innerText = countdown;
      const countInt = setInterval(() => {
        countdown--;
        this.nextTurnTimer.innerText = Math.max(0, countdown);
        if (countdown <= 0) clearInterval(countInt);
      }, 1000);

      this.modalRoundEnd.classList.remove('hidden');
      window.soundManager.playFanfare();
    });

    // Game Over Podium
    this.socket.on('game-over', ({ podium, allPlayers }) => {
      this.state = 'GAME_OVER';
      this.modalRoundEnd.classList.add('hidden');
      this.modalWordSelect.classList.add('hidden');

      this.gamePodiumWrapper.innerHTML = '';

      // Podium order: 2nd place (left), 1st place (center), 3rd place (right)
      const order = [1, 0, 2];
      order.forEach(rankIdx => {
        const p = podium[rankIdx];
        if (p) {
          const placeNum = rankIdx + 1;
          const col = document.createElement('div');
          col.className = `podium-place place-${placeNum}`;
          col.innerHTML = `
            <div class="podium-avatar">${window.avatarGen.renderSVG(p.avatar)}</div>
            <div class="podium-name">${escapeHtml(p.name)}</div>
            <div class="podium-block">
              <span>#${placeNum}</span>
              <span class="podium-score">${p.score}p</span>
            </div>
          `;
          this.gamePodiumWrapper.appendChild(col);
        }
      });

      this.finalScoresList.innerHTML = '';
      allPlayers.forEach((p, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; padding:6px 12px; background:#f8fafc; border-radius:8px; margin-bottom:4px; font-weight:700;';
        item.innerHTML = `<span>#${idx + 1} ${escapeHtml(p.name)}</span><span>${p.score} pts</span>`;
        this.finalScoresList.appendChild(item);
      });

      this.modalGameOver.classList.remove('hidden');
      window.soundManager.playFanfare();
    });

    // Reset to Lobby
    this.socket.on('room-reset', ({ players, settings }) => {
      this.state = 'LOBBY';
      this.modalGameOver.classList.add('hidden');
      this.modalRoundEnd.classList.add('hidden');
      this.modalWordSelect.classList.add('hidden');
      this.canvas.clear();
      this.canvas.setDrawerActive(false);
      this.updatePlayersList(players);
      this.updateHostControls();
      this.bannerText.innerText = 'Waiting for host to start game...';
      this.wordHintStatus.innerText = 'Waiting to start...';
      this.maskedWordDisplay.innerText = '_ _ _ _ _';
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
