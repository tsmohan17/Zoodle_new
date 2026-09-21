const { io } = require('socket.io-client');

async function testGameLoop() {
  console.log('🧪 Starting Zoodle E2E Verification Test...');
  const URL = 'http://localhost:3000';

  // Connect Player 1 (Host)
  const p1 = io(URL, { forceNew: true });
  // Connect Player 2 (Friend)
  const p2 = io(URL, { forceNew: true });

  await new Promise((resolve) => p1.on('connect', resolve));
  await new Promise((resolve) => p2.on('connect', resolve));
  console.log('✅ Both players connected via Socket.IO');

  // Player 1 creates room
  const createRes = await new Promise((resolve) => {
    p1.emit('create-room', {
      playerData: {
        name: 'SpeedyArtist',
        avatar: { eyes: 1, mouth: 1, color: '#4ade80' },
        videoEnabled: true,
        audioEnabled: true
      },
      settings: { rounds: 2, drawTime: 30 }
    }, resolve);
  });

  console.log('✅ Room created with code:', createRes.roomCode);
  const roomCode = createRes.roomCode;

  // Player 2 joins room
  const joinRes = await new Promise((resolve) => {
    p2.emit('join-room', {
      roomCode: roomCode,
      playerData: {
        name: 'MasterGuesser',
        avatar: { eyes: 2, mouth: 2, color: '#38bdf8' },
        videoEnabled: true,
        audioEnabled: true
      }
    }, resolve);
  });

  console.log('✅ Player 2 joined successfully. Current players count:', joinRes.players.length);

  // Setup turn start listener
  const turnPromise = new Promise((resolve) => {
    p1.on('turn-start', resolve);
  });

  // Host starts game
  const startRes = await new Promise((resolve) => {
    p1.emit('start-game', resolve);
  });
  console.log('✅ Game started by host:', startRes);

  const turnData = await turnPromise;
  console.log('✅ Turn started! Current drawer:', turnData.drawer.name);

  // Drawer chooses a word
  const secretWord = 'dinosaur';
  p1.emit('select-word', { word: secretWord, difficulty: 'medium' });

  // Wait for drawing started event
  const drawingStarted = await new Promise((resolve) => {
    p2.on('drawing-started', resolve);
  });
  console.log('✅ Drawing started! Masked hint for Player 2:', drawingStarted.maskedWord);

  // Drawer draws a stroke
  const stroke = { fromX: 10, fromY: 10, toX: 50, toY: 50, color: '#000000', size: 4 };
  const strokePromise = new Promise((resolve) => {
    p2.on('draw-stroke', resolve);
  });
  p1.emit('draw-stroke', stroke);
  const receivedStroke = await strokePromise;
  console.log('✅ Stroke successfully synchronized to Player 2:', receivedStroke);

  // Player 2 submits a close guess
  const closeGuessPromise = new Promise((resolve) => {
    p2.on('close-guess', resolve);
  });
  p2.emit('send-guess', { message: 'dinosaus' });
  const closeGuessMsg = await closeGuessPromise;
  console.log('✅ Close-guess hint triggered:', closeGuessMsg.message);

  // Player 2 submits the exact correct guess
  const guessPromise = new Promise((resolve) => {
    p1.on('player-guessed', resolve);
  });
  p2.emit('send-guess', { message: 'dinosaur' });
  const guessResult = await guessPromise;
  console.log('✅ Player guessed successfully! Points awarded to:', guessResult.playerName);

  // Wait for round over
  const roundOver = await new Promise((resolve) => {
    p1.on('round-over', resolve);
  });
  console.log('✅ Round finished smoothly! Revealed word:', roundOver.word);

  p1.disconnect();
  p2.disconnect();
  console.log('🎉 ALL E2E VERIFICATIONS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testGameLoop().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
