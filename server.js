const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Load words dictionary
let wordsBank = { easy: [], medium: [], hard: [] };
try {
  const wordsPath = path.join(__dirname, 'data', 'words.json');
  wordsBank = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
} catch (e) {
  console.warn('Using fallback words dictionary');
  wordsBank = {
    easy: ['cat', 'dog', 'sun', 'tree', 'car', 'apple', 'star', 'house', 'fish', 'cake'],
    medium: ['dinosaur', 'astronaut', 'guitar', 'volcano', 'rainbow', 'octopus', 'helicopter'],
    hard: ['time machine', 'black hole', 'virtual reality', 'parallel universe', 'constellation']
  };
}

// In-memory room store
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRandomWords(count = 3) {
  const categories = ['easy', 'medium', 'hard'];
  const chosen = [];
  categories.forEach(cat => {
    const list = wordsBank[cat] || wordsBank.easy;
    const word = list[Math.floor(Math.random() * list.length)];
    chosen.push({ word, difficulty: cat });
  });
  return chosen;
}

function maskWord(word, revealIndices = []) {
  return word.split('').map((char, idx) => {
    if (char === ' ') return ' ';
    if (char === '-') return '-';
    if (revealIndices.includes(idx)) return char.toUpperCase();
    return '_';
  }).join(' ');
}

// Levenshtein distance for close guesses
function getLevenshtein(a, b) {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

class Room {
  constructor(code, hostId, settings = {}) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map(); // socketId -> player obj
    this.state = 'LOBBY'; // LOBBY, WORD_SELECTION, DRAWING, ROUND_OVER, GAME_OVER
    this.settings = {
      maxPlayers: settings.maxPlayers || 8,
      rounds: settings.rounds || 3,
      drawTime: settings.drawTime || 75,
      customWords: settings.customWords || []
    };
    this.currentRound = 1;
    this.currentDrawerIndex = 0;
    this.currentWord = '';
    this.currentDifficulty = 'easy';
    this.revealedIndices = [];
    this.canvasHistory = [];
    this.timer = null;
    this.timeLeft = 0;
    this.guessedPlayerIds = new Set();
    this.drawerChoiceOptions = [];
  }

  addPlayer(socketId, playerData) {
    const isHost = this.players.size === 0;
    const player = {
      id: socketId,
      name: playerData.name || `Doodler_${Math.floor(Math.random() * 900 + 100)}`,
      avatar: playerData.avatar || { eyes: 1, mouth: 1, color: '#4ade80' },
      score: 0,
      roundScore: 0,
      isHost: isHost,
      hasGuessed: false,
      isDrawing: false,
      videoEnabled: !!playerData.videoEnabled,
      audioEnabled: !!playerData.audioEnabled
    };
    this.players.set(socketId, player);
    if (isHost) this.hostId = socketId;
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    this.players.delete(socketId);
    this.guessedPlayerIds.delete(socketId);

    // If host left, elect new host
    if (this.hostId === socketId && this.players.size > 0) {
      const nextHost = this.players.values().next().value;
      this.hostId = nextHost.id;
      nextHost.isHost = true;
    }

    // If active drawer left during drawing, advance turn
    if (this.state === 'DRAWING' || this.state === 'WORD_SELECTION') {
      const playerList = Array.from(this.players.values());
      if (player && player.isDrawing) {
        clearInterval(this.timer);
        this.nextTurn();
      }
    }
    return player;
  }

  getPlayersList() {
    return Array.from(this.players.values());
  }

  startGame() {
    if (this.players.size < 2) {
      return { success: false, message: 'Need at least 2 players to start the game!' };
    }
    this.currentRound = 1;
    this.currentDrawerIndex = 0;
    // Reset scores
    this.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
      p.isDrawing = false;
    });
    this.startTurn();
    return { success: true };
  }

  startTurn() {
    const playerList = Array.from(this.players.values());
    if (this.currentDrawerIndex >= playerList.length) {
      // Completed all players in current round
      this.currentDrawerIndex = 0;
      this.currentRound++;
      if (this.currentRound > this.settings.rounds) {
        this.endGame();
        return;
      }
    }

    const drawer = playerList[this.currentDrawerIndex];
    if (!drawer) {
      this.endGame();
      return;
    }

    playerList.forEach(p => {
      p.isDrawing = (p.id === drawer.id);
      p.hasGuessed = false;
      p.roundScore = 0;
    });
    this.guessedPlayerIds.clear();
    this.canvasHistory = [];
    this.revealedIndices = [];

    this.state = 'WORD_SELECTION';
    this.drawerChoiceOptions = getRandomWords(3);

    // 15 seconds to pick word
    this.timeLeft = 15;
    io.to(this.code).emit('turn-start', {
      drawer: { id: drawer.id, name: drawer.name },
      round: this.currentRound,
      maxRounds: this.settings.rounds,
      state: 'WORD_SELECTION',
      timeLeft: this.timeLeft
    });

    // Send word choices only to drawer
    io.to(drawer.id).emit('select-word-prompt', {
      words: this.drawerChoiceOptions,
      timeLeft: this.timeLeft
    });

    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.timeLeft--;
      io.to(this.code).emit('timer-tick', { timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        // Auto-select first word if drawer didn't choose
        const autoWord = this.drawerChoiceOptions[0]?.word || 'cat';
        const autoDiff = this.drawerChoiceOptions[0]?.difficulty || 'easy';
        this.beginDrawing(autoWord, autoDiff);
      }
    }, 1000);
  }

  beginDrawing(word, difficulty) {
    clearInterval(this.timer);
    this.state = 'DRAWING';
    this.currentWord = word.trim().toLowerCase();
    this.currentDifficulty = difficulty;
    this.timeLeft = this.settings.drawTime;
    this.revealedIndices = [];

    const drawer = Array.from(this.players.values()).find(p => p.isDrawing);

    // Notify all players that drawing has started
    io.to(this.code).emit('drawing-started', {
      drawer: { id: drawer.id, name: drawer.name },
      wordLength: this.currentWord.length,
      maskedWord: maskWord(this.currentWord, this.revealedIndices),
      timeLeft: this.timeLeft,
      difficulty: this.currentDifficulty
    });

    // Notify drawer with the exact secret word
    if (drawer) {
      io.to(drawer.id).emit('your-secret-word', {
        word: this.currentWord.toUpperCase(),
        difficulty: this.currentDifficulty
      });
    }

    // Schedule letter reveals at 60% and 30% time remaining
    const revealTime1 = Math.floor(this.timeLeft * 0.6);
    const revealTime2 = Math.floor(this.timeLeft * 0.3);

    this.timer = setInterval(() => {
      this.timeLeft--;
      io.to(this.code).emit('timer-tick', { timeLeft: this.timeLeft });

      // Progressive hints
      if (this.timeLeft === revealTime1 || this.timeLeft === revealTime2) {
        this.revealRandomLetter();
      }

      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        this.endTurn('Time is up!');
      }
    }, 1000);
  }

  revealRandomLetter() {
    const unrevealed = [];
    for (let i = 0; i < this.currentWord.length; i++) {
      if (this.currentWord[i] !== ' ' && this.currentWord[i] !== '-' && !this.revealedIndices.includes(i)) {
        unrevealed.push(i);
      }
    }
    if (unrevealed.length > 1) { // keep at least 1 hidden
      const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      this.revealedIndices.push(pick);
      io.to(this.code).emit('hint-update', {
        maskedWord: maskWord(this.currentWord, this.revealedIndices)
      });
    }
  }

  handleGuess(socketId, guessText) {
    const player = this.players.get(socketId);
    if (!player || this.state !== 'DRAWING') return;

    // Drawer cannot guess
    if (player.isDrawing) {
      socketId && io.to(socketId).emit('system-message', {
        type: 'warning',
        text: "You can't guess your own drawing! Keep illustrating!"
      });
      return;
    }

    // Already guessed
    if (player.hasGuessed) {
      socketId && io.to(socketId).emit('system-message', {
        type: 'info',
        text: "You have already guessed the word! Sshh!"
      });
      return;
    }

    const cleanGuess = guessText.trim().toLowerCase();
    const cleanWord = this.currentWord;

    if (cleanGuess === cleanWord) {
      // Correct guess!
      player.hasGuessed = true;
      this.guessedPlayerIds.add(socketId);

      // Score calculation based on speed
      const maxPoints = 500;
      const minPoints = 100;
      const ratio = this.timeLeft / this.settings.drawTime;
      const pointsEarned = Math.round(minPoints + (maxPoints - minPoints) * ratio);
      player.score += pointsEarned;
      player.roundScore = pointsEarned;

      // Drawer earns bonus points for each correct guesser
      const drawer = Array.from(this.players.values()).find(p => p.isDrawing);
      if (drawer) {
        drawer.score += 75;
        drawer.roundScore += 75;
      }

      // Notify room (mask the word, announce player guessed)
      io.to(this.code).emit('player-guessed', {
        playerId: socketId,
        playerName: player.name,
        points: pointsEarned,
        players: this.getPlayersList()
      });

      // Notify player privately
      io.to(socketId).emit('guess-success', {
        word: this.currentWord.toUpperCase(),
        points: pointsEarned
      });

      // If all non-drawing players have guessed, end turn immediately!
      const nonDrawers = Array.from(this.players.values()).filter(p => !p.isDrawing);
      if (this.guessedPlayerIds.size >= nonDrawers.length) {
        clearInterval(this.timer);
        this.endTurn('Everyone guessed the word!');
      }
    } else {
      // Check for close guess
      const distance = getLevenshtein(cleanGuess, cleanWord);
      if (distance <= 2 && cleanWord.length >= 4) {
        io.to(socketId).emit('close-guess', {
          guess: guessText,
          message: `'${guessText}' is very close!`
        });
      }

      // Broadcast public chat message
      io.to(this.code).emit('chat-message', {
        senderId: socketId,
        senderName: player.name,
        text: guessText,
        isGuessed: false
      });
    }
  }

  endTurn(reason = 'Round finished') {
    clearInterval(this.timer);
    this.state = 'ROUND_OVER';

    io.to(this.code).emit('round-over', {
      reason,
      word: this.currentWord.toUpperCase(),
      players: this.getPlayersList()
    });

    // 5 seconds summary before next turn
    setTimeout(() => {
      this.nextTurn();
    }, 5000);
  }

  nextTurn() {
    this.currentDrawerIndex++;
    this.startTurn();
  }

  endGame() {
    clearInterval(this.timer);
    this.state = 'GAME_OVER';

    // Sort players by score descending
    const ranked = this.getPlayersList().sort((a, b) => b.score - a.score);

    io.to(this.code).emit('game-over', {
      podium: ranked.slice(0, 3),
      allPlayers: ranked
    });
  }

  resetToLobby() {
    clearInterval(this.timer);
    this.state = 'LOBBY';
    this.currentRound = 1;
    this.currentDrawerIndex = 0;
    this.currentWord = '';
    this.canvasHistory = [];
    this.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
      p.isDrawing = false;
    });
    io.to(this.code).emit('room-reset', {
      players: this.getPlayersList(),
      settings: this.settings
    });
  }
}

// Serve public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API health and room info
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size, timestamp: Date.now() });
});

app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    code: room.code,
    playersCount: room.players.size,
    maxPlayers: room.settings.maxPlayers,
    state: room.state
  });
});

// Socket.IO Event Handlers
io.on('connection', (socket) => {
  let currentRoomCode = null;

  // Create Room
  socket.on('create-room', ({ playerData, settings }, callback) => {
    let code = generateRoomCode();
    while (rooms.has(code)) {
      code = generateRoomCode();
    }
    const room = new Room(code, socket.id, settings);
    const player = room.addPlayer(socket.id, playerData || {});
    rooms.set(code, room);
    currentRoomCode = code;

    socket.join(code);
    if (typeof callback === 'function') {
      callback({ success: true, roomCode: code, player, settings: room.settings });
    }
  });

  // Join Room
  socket.on('join-room', ({ roomCode, playerData }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      if (typeof callback === 'function') callback({ success: false, message: 'Room not found! Check your code.' });
      return;
    }
    if (room.players.size >= room.settings.maxPlayers) {
      if (typeof callback === 'function') callback({ success: false, message: 'Room is full!' });
      return;
    }

    const player = room.addPlayer(socket.id, playerData || {});
    currentRoomCode = code;
    socket.join(code);

    // Notify room of new player
    socket.to(code).emit('player-joined', { player, players: room.getPlayersList() });

    // Send initial state to joining player
    if (typeof callback === 'function') {
      callback({
        success: true,
        roomCode: code,
        player,
        players: room.getPlayersList(),
        state: room.state,
        settings: room.settings,
        canvasHistory: room.canvasHistory
      });
    }
  });

  // Start Game (Host only)
  socket.on('start-game', (callback) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;

    const result = room.startGame();
    if (typeof callback === 'function') callback(result);
  });

  // Drawer selects word
  socket.on('select-word', ({ word, difficulty }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'WORD_SELECTION') return;

    const drawer = Array.from(room.players.values()).find(p => p.isDrawing);
    if (drawer && drawer.id === socket.id) {
      room.beginDrawing(word, difficulty);
    }
  });

  // Drawing Events
  socket.on('draw-stroke', (strokeData) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'DRAWING') return;

    const drawer = Array.from(room.players.values()).find(p => p.isDrawing);
    if (drawer && drawer.id === socket.id) {
      room.canvasHistory.push(strokeData);
      socket.to(currentRoomCode).emit('draw-stroke', strokeData);
    }
  });

  socket.on('draw-clear', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'DRAWING') return;

    const drawer = Array.from(room.players.values()).find(p => p.isDrawing);
    if (drawer && drawer.id === socket.id) {
      room.canvasHistory = [];
      socket.to(currentRoomCode).emit('draw-clear');
    }
  });

  socket.on('draw-undo', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'DRAWING') return;

    const drawer = Array.from(room.players.values()).find(p => p.isDrawing);
    if (drawer && drawer.id === socket.id) {
      room.canvasHistory.pop();
      io.to(currentRoomCode).emit('canvas-restore', { history: room.canvasHistory });
    }
  });

  socket.on('draw-fill', (fillData) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'DRAWING') return;

    const drawer = Array.from(room.players.values()).find(p => p.isDrawing);
    if (drawer && drawer.id === socket.id) {
      room.canvasHistory.push(fillData);
      socket.to(currentRoomCode).emit('draw-fill', fillData);
    }
  });

  // Guess Chat
  socket.on('send-guess', ({ message }) => {
    if (!currentRoomCode || !message) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    room.handleGuess(socket.id, message);
  });

  // WebRTC Mesh Signaling
  socket.on('webrtc-offer', ({ targetId, sdp }) => {
    io.to(targetId).emit('webrtc-offer', {
      senderId: socket.id,
      sdp
    });
  });

  socket.on('webrtc-answer', ({ targetId, sdp }) => {
    io.to(targetId).emit('webrtc-answer', {
      senderId: socket.id,
      sdp
    });
  });

  socket.on('webrtc-ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc-ice-candidate', {
      senderId: socket.id,
      candidate
    });
  });

  socket.on('webrtc-media-toggle', ({ videoEnabled, audioEnabled }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (room) {
      const player = room.players.get(socket.id);
      if (player) {
        player.videoEnabled = videoEnabled;
        player.audioEnabled = audioEnabled;
      }
    }
    socket.to(currentRoomCode).emit('webrtc-peer-media-toggle', {
      peerId: socket.id,
      videoEnabled,
      audioEnabled
    });
  });

  socket.on('webrtc-reaction', ({ reaction }) => {
    if (!currentRoomCode) return;
    io.to(currentRoomCode).emit('webrtc-peer-reaction', {
      senderId: socket.id,
      reaction
    });
  });

  // Play Again / Reset
  socket.on('play-again', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    room.resetToLobby();
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentRoomCode) {
      const room = rooms.get(currentRoomCode);
      if (room) {
        const removed = room.removePlayer(socket.id);
        if (room.players.size === 0) {
          clearInterval(room.timer);
          rooms.delete(currentRoomCode);
        } else {
          io.to(currentRoomCode).emit('player-left', {
            playerId: socket.id,
            playerName: removed ? removed.name : 'A player',
            players: room.getPlayersList(),
            newHostId: room.hostId
          });
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🎨 Zoodle Server Live on http://localhost:${PORT}`);
  console.log(`📞 WhatsApp-grade WebRTC Video Conferencing Active`);
  console.log(`🎮 Scribble multiplayer engine ready!`);
  console.log(`=========================================`);
});
