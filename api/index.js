const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Create Express app
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:3001', 
    'http://127.0.0.1:3000',
    'https://vv-games.vercel.app',
    'https://vv-games-vishalt25.vercel.app',
    /^https:\/\/.*\.vercel\.app$/,
    /^https:\/\/.*\.vercel\.app$/
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Essential middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage (in production, you'd use a database)
const rooms = new Map();
const players = new Map();
const gameStates = new Map();

function generateRoomCode() {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  return rooms.has(code) ? generateRoomCode() : code;
}

// API Routes
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ 
    status: 'OK', 
    message: 'Server is running', 
    timestamp: new Date().toISOString(),
    rooms: rooms.size,
    players: players.size
  });
});

app.post('/api/create-room', (req, res) => {
  console.log('Create room requested');
  try {
    const roomCode = generateRoomCode();
    const room = {
      id: uuidv4(),
      code: roomCode,
      gameType: 'oddword',
      players: [],
      gameState: 'waiting',
      gameData: null,
      createdAt: new Date(),
      lastActivity: Date.now()
    };
    
    rooms.set(roomCode, room);
    console.log('Room created:', roomCode);
    res.json({ roomCode, roomId: room.id });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.post('/api/join-room', (req, res) => {
  const { roomCode, playerName } = req.body;
  console.log(`Join room requested: ${playerName} -> ${roomCode}`);
  
  const room = rooms.get(roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (room.players.length >= 8) {
    return res.status(400).json({ error: 'Room is full' });
  }
  
  const playerId = uuidv4();
  const player = {
    id: playerId,
    name: playerName,
    isHost: room.players.length === 0,
    joinedAt: new Date()
  };
  
  room.players.push(player);
  players.set(playerId, { ...player, roomCode });
  room.lastActivity = Date.now();
  
  console.log(`Player ${playerName} joined room ${roomCode}`);
  res.json({
    success: true,
    playerId,
    room: {
      code: room.code,
      playerCount: room.players.length,
      gameState: room.gameState,
      gameType: room.gameType,
      players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
      gameData: room.gameData
    }
  });
});

app.get('/api/room/:code/status', (req, res) => {
  const { code } = req.params;
  const room = rooms.get(code);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    code: room.code,
    playerCount: room.players.length,
    gameState: room.gameState,
    gameType: room.gameType,
    players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
    gameData: room.gameData,
    lastActivity: room.lastActivity
  });
});

// Game management endpoints
app.post('/start-game', (req, res) => {
  const { roomCode, playerId, settings } = req.body;
  console.log(`Start game requested for room: ${roomCode}`);
  
  // Find room by player ID
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (!room.players.find(p => p.id === playerId)?.isHost) {
    return res.status(403).json({ error: 'Only the host can start the game' });
  }
  
  if (room.players.length < 3) {
    return res.status(400).json({ error: 'Need at least 3 players to start' });
  }
  
  // Initialize game data
  const normalWord = 'apple';
  const oddWord = 'banana';
  const oddOneOutIndex = Math.floor(Math.random() * room.players.length);
  
  // Create turn order
  let turnOrder = room.players.map(p => p.name);
  if (settings?.playerOrder === 'host-set' && settings?.customOrder) {
    turnOrder = settings.customOrder.map(index => room.players[index]?.name).filter(Boolean);
  } else {
    // Randomize turn order
    for (let i = turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
    }
  }
  
  room.gameState = 'playing';
  room.gameData = {
    phase: 'hint-giving',
    normalWord,
    oddWord,
    oddOneOutIndex,
    currentTurnIndex: 0,
    turnOrder,
    hints: [],
    roundNumber: 1,
    timer: settings?.timerDuration || 30000,
    settings: settings || {
      timerDuration: 30000,
      imposterKnowsRole: false,
      playerOrder: 'random'
    }
  };
  
  room.lastActivity = Date.now();
  
  // Return game data for each player
  const currentPlayer = room.players.find(p => p.id === playerId);
  const isOddOneOut = room.players.indexOf(currentPlayer) === oddOneOutIndex;
  
  res.json({
    success: true,
    word: isOddOneOut ? oddWord : normalWord,
    isOddOneOut,
    knowsRole: settings?.imposterKnowsRole || false,
    turnOrder,
    currentTurnIndex: 0,
    timer: room.gameData.timer,
    settings: room.gameData.settings
  });
});

app.post('/give-hint', (req, res) => {
  const { hint, playerId } = req.body;
  console.log(`Hint submitted by player: ${playerId}`);
  
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room || room.gameState !== 'playing') {
    return res.status(400).json({ error: 'Game not in progress' });
  }
  
  const roomPlayer = room.players.find(p => p.id === playerId);
  if (!roomPlayer) {
    return res.status(404).json({ error: 'Player not in room' });
  }
  
  // Add hint
  const hintData = {
    playerId,
    playerName: roomPlayer.name,
    hint,
    playerIndex: room.players.indexOf(roomPlayer),
    timestamp: Date.now()
  };
  
  room.gameData.hints.push(hintData);
  room.lastActivity = Date.now();
  
  // Check if all players have given hints
  if (room.gameData.hints.length >= room.players.length) {
    room.gameData.phase = 'decision';
  } else {
    // Move to next player
    room.gameData.currentTurnIndex = (room.gameData.currentTurnIndex + 1) % room.players.length;
  }
  
  res.json({
    success: true,
    ...hintData
  });
});

app.post('/decision-continue-hints', (req, res) => {
  const { playerId } = req.body;
  console.log(`Continue hints requested by player: ${playerId}`);
  
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room || room.gameState !== 'playing') {
    return res.status(400).json({ error: 'Game not in progress' });
  }
  
  if (!room.players.find(p => p.id === playerId)?.isHost) {
    return res.status(403).json({ error: 'Only the host can continue hints' });
  }
  
  room.gameData.phase = 'hint-giving';
  room.gameData.currentTurnIndex = 0;
  room.gameData.roundNumber++;
  room.gameData.hints = [];
  room.lastActivity = Date.now();
  
  res.json({
    success: true,
    phase: room.gameData.phase,
    currentTurnIndex: room.gameData.currentTurnIndex,
    timer: room.gameData.timer,
    roundNumber: room.gameData.roundNumber
  });
});

app.post('/decision-start-voting', (req, res) => {
  const { playerId } = req.body;
  console.log(`Start voting requested by player: ${playerId}`);
  
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room || room.gameState !== 'playing') {
    return res.status(400).json({ error: 'Game not in progress' });
  }
  
  if (!room.players.find(p => p.id === playerId)?.isHost) {
    return res.status(403).json({ error: 'Only the host can start voting' });
  }
  
  room.gameData.phase = 'voting';
  room.gameData.timer = 30000; // 30 seconds for voting
  room.lastActivity = Date.now();
  
  res.json({
    success: true,
    phase: room.gameData.phase,
    timer: room.gameData.timer
  });
});

app.post('/imposter-guess', (req, res) => {
  const { guess, playerId } = req.body;
  console.log(`Imposter guess submitted by player: ${playerId}`);
  
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room || room.gameState !== 'playing') {
    return res.status(400).json({ error: 'Game not in progress' });
  }
  
  const roomPlayer = room.players.find(p => p.id === playerId);
  if (!roomPlayer) {
    return res.status(404).json({ error: 'Player not in room' });
  }
  
  const isOddOneOut = room.players.indexOf(roomPlayer) === room.gameData.oddOneOutIndex;
  
  if (!isOddOneOut) {
    return res.status(400).json({ error: 'Only the imposter can submit a guess' });
  }
  
  // Determine game result
  const correctWord = room.gameData.normalWord;
  const oddWord = room.gameData.oddWord;
  const isCorrect = guess.toLowerCase() === correctWord.toLowerCase();
  
  const gameResult = {
    winner: isCorrect ? 'imposter' : 'majority',
    reason: isCorrect ? 'imposter-correct-guess' : 'imposter-wrong-guess',
    imposterName: roomPlayer.name,
    correctWord,
    oddWord,
    imposterGuess: guess,
    allHints: room.gameData.hints
  };
  
  room.gameData.phase = 'finished';
  room.gameData.gameResult = gameResult;
  room.lastActivity = Date.now();
  
  res.json(gameResult);
});

// Player management endpoints
app.post('/kick-player', (req, res) => {
  const { playerId, targetPlayerId } = req.body;
  console.log(`Kick player requested: ${playerId} -> ${targetPlayerId}`);
  
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (!room.players.find(p => p.id === playerId)?.isHost) {
    return res.status(403).json({ error: 'Only the host can kick players' });
  }
  
  if (playerId === targetPlayerId) {
    return res.status(400).json({ error: 'Cannot kick yourself' });
  }
  
  // Remove player from room
  const targetPlayerIndex = room.players.findIndex(p => p.id === targetPlayerId);
  if (targetPlayerIndex === -1) {
    return res.status(404).json({ error: 'Target player not found in room' });
  }
  
  const removedPlayer = room.players.splice(targetPlayerIndex, 1)[0];
  players.delete(targetPlayerId);
  
  // If the removed player was the host, transfer host to the first remaining player
  if (removedPlayer.isHost && room.players.length > 0) {
    room.players[0].isHost = true;
  }
  
  room.lastActivity = Date.now();
  
  res.json({
    success: true,
    players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
  });
});

app.post('/transfer-host', (req, res) => {
  const { playerId, newHostId } = req.body;
  console.log(`Transfer host requested: ${playerId} -> ${newHostId}`);
  
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (!room.players.find(p => p.id === playerId)?.isHost) {
    return res.status(403).json({ error: 'Only the host can transfer host' });
  }
  
  const newHost = room.players.find(p => p.id === newHostId);
  if (!newHost) {
    return res.status(404).json({ error: 'New host not found in room' });
  }
  
  // Transfer host
  room.players.forEach(p => p.isHost = false);
  newHost.isHost = true;
  
  room.lastActivity = Date.now();
  
  res.json({
    success: true,
    players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
  });
});

app.post('/update-game-settings', (req, res) => {
  const { playerId, settings } = req.body;
  console.log(`Update game settings requested by player: ${playerId}`);
  
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (!room.players.find(p => p.id === playerId)?.isHost) {
    return res.status(403).json({ error: 'Only the host can update settings' });
  }
  
  // Update settings
  if (room.gameData) {
    room.gameData.settings = { ...room.gameData.settings, ...settings };
  }
  
  room.lastActivity = Date.now();
  
  res.json({
    success: true,
    settings: room.gameData?.settings || settings
  });
});

app.post('/set-player-order', (req, res) => {
  const { playerId, customOrder } = req.body;
  console.log(`Set player order requested by player: ${playerId}`);
  
  const player = players.get(playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const room = rooms.get(player.roomCode);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (!room.players.find(p => p.id === playerId)?.isHost) {
    return res.status(403).json({ error: 'Only the host can set player order' });
  }
  
  // Update player order in game data
  if (room.gameData) {
    room.gameData.customPlayerOrder = customOrder;
  }
  
  room.lastActivity = Date.now();
  
  res.json({
    success: true,
    players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
  });
});

app.get('/api/room/:code/poll', (req, res) => {
  const { code } = req.params;
  const room = rooms.get(code);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  // Return current room state for polling
  res.json({
    code: room.code,
    playerCount: room.players.length,
    gameState: room.gameState,
    gameType: room.gameType,
    players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
    gameData: room.gameData || null,
    lastActivity: room.lastActivity
  });
});

// Cleanup old rooms (optional)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > oneHour) {
      rooms.delete(code);
      console.log(`Cleaned up old room: ${code}`);
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

// Catch all handler
app.get('*', (req, res) => {
  res.json({ 
    message: 'VV Games API is running',
    availableEndpoints: [
      'GET /api/health',
      'POST /api/create-room',
      'POST /api/join-room',
      'GET /api/room/:code/status',
      'GET /api/room/:code/poll',
      'POST /start-game',
      'POST /give-hint',
      'POST /decision-continue-hints',
      'POST /decision-start-voting',
      'POST /imposter-guess',
      'POST /kick-player',
      'POST /transfer-host',
      'POST /update-game-settings',
      'POST /set-player-order'
    ]
  });
});

const PORT = process.env.PORT || 3001;

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🎮 Game platform ready!`);
  });
}
