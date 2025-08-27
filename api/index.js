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
      gameType: 'word-game',
      players: [],
      gameState: 'waiting',
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
      players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
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
    lastActivity: room.lastActivity
  });
});

app.post('/api/room/:code/start-game', (req, res) => {
  const { code } = req.params;
  const { playerId } = req.body;
  
  const room = rooms.get(code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  const player = room.players.find(p => p.id === playerId);
  if (!player || !player.isHost) {
    return res.status(403).json({ error: 'Only the host can start the game' });
  }
  
  if (room.players.length < 3) {
    return res.status(400).json({ error: 'Need at least 3 players to start' });
  }
  
  // Initialize game
  room.gameState = 'playing';
  room.gameData = {
    normalWord: 'apple',
    oddWord: 'banana',
    oddOneOutIndex: Math.floor(Math.random() * room.players.length),
    currentTurn: 0,
    hints: [],
    phase: 'hint-giving'
  };
  
  room.lastActivity = Date.now();
  
  res.json({
    success: true,
    gameData: room.gameData,
    message: 'Game started successfully'
  });
});

app.post('/api/room/:code/give-hint', (req, res) => {
  const { code } = req.params;
  const { playerId, hint } = req.body;
  
  const room = rooms.get(code);
  if (!room || room.gameState !== 'playing') {
    return res.status(400).json({ error: 'Game not in progress' });
  }
  
  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  // Add hint
  room.gameData.hints.push({
    playerId,
    playerName: player.name,
    hint,
    timestamp: Date.now()
  });
  
  room.lastActivity = Date.now();
  
  res.json({
    success: true,
    hint: { playerId, playerName: player.name, hint, timestamp: Date.now() }
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
      'POST /api/room/:code/start-game',
      'POST /api/room/:code/give-hint',
      'GET /api/room/:code/poll'
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
