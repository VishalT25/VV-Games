const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create Express app FIRST
const app = express();
const server = http.createServer(app);

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Essential middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple in-memory room storage (instead of requiring external files for now)
const rooms = new Map();

function generateRoomCode() {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  return rooms.has(code) ? generateRoomCode() : code;
}

// API Routes - DEFINE THESE BEFORE SOCKET.IO
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'OK', message: 'Server is running', timestamp: new Date().toISOString() });
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
      gameInstance: null,
      createdAt: new Date()
    };
    
    rooms.set(roomCode, room);
    console.log('Room created:', roomCode);
    res.json({ roomCode, roomId: room.id });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    code: room.code,
    playerCount: room.players.length,
    gameState: room.gameState,
    gameType: room.gameType
  });
});

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  console.log('📊 Total connections:', io.engine.clientsCount);

  socket.on('join-room', ({ roomCode, playerName }) => {
    console.log(`🎯 ${playerName} trying to join room ${roomCode}`);
    console.log('📋 Available rooms:', Array.from(rooms.keys()));
    console.log('🔍 Room data:', rooms.get(roomCode));
    
    const room = rooms.get(roomCode);
    if (!room) {
      console.log(`❌ Room ${roomCode} not found`);
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.players.length >= 8) {
      console.log(`❌ Room ${roomCode} is full`);
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      isHost: room.players.length === 0
    };

    room.players.push(player);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    console.log(`✅ ${playerName} joined room ${roomCode}`);
    console.log(`👥 Room ${roomCode} players:`, room.players.map(p => p.name));

    io.to(roomCode).emit('player-joined', {
      players: room.players,
      newPlayer: player
    });

    socket.emit('joined-room', {
      roomCode,
      players: room.players,
      isHost: player.isHost,
      gameState: room.gameState
    });

    console.log(`🎉 ${playerName} successfully joined room ${roomCode}. Total players: ${room.players.length}`);
  });

  socket.on('start-game', () => {
    console.log(`🎮 Start game request from socket ${socket.id} in room ${socket.roomCode}`);

    if (!socket.roomCode) {
      console.log(`❌ Socket ${socket.id} has no room code`);
      socket.emit('error', { message: 'You are not in a room' });
      return;
    }

    const room = rooms.get(socket.roomCode);
    if (!room) {
      console.log(`❌ Room ${socket.roomCode} not found for start-game`);
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    console.log(`📋 Room ${socket.roomCode} current state:`, {
      players: room.players.length,
      gameState: room.gameState,
      playerNames: room.players.map(p => p.name)
    });

    // Check if the requesting player is the host
    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer) {
      console.log(`❌ Player ${socket.id} not found in room ${socket.roomCode}`);
      socket.emit('error', { message: 'Player not found in room' });
      return;
    }

    if (!requestingPlayer.isHost) {
      console.log(`❌ Non-host player ${requestingPlayer.name} tried to start game`);
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }

    // Check if there are enough players (at least 3)
    if (room.players.length < 3) {
      console.log(`❌ Not enough players in room ${socket.roomCode} (${room.players.length}/3)`);
      socket.emit('error', { message: 'Need at least 3 players to start' });
      return;
    }

    // Start the game
    console.log(`🎮 Starting game in room ${socket.roomCode} with ${room.players.length} players`);

    // Simple word assignment for OddWord game
    const words = ['apple', 'banana', 'carrot', 'dog', 'elephant', 'flower', 'guitar', 'house'];
    const selectedWord = words[Math.floor(Math.random() * words.length)];
    let differentWord = words[Math.floor(Math.random() * words.length)];
    
    // Ensure different word is actually different
    while (differentWord === selectedWord) {
      differentWord = words[Math.floor(Math.random() * words.length)];
    }

    // Randomly assign one player as the "odd one out"
    const oddOneOutIndex = Math.floor(Math.random() * room.players.length);
    const oddOneOutPlayer = room.players[oddOneOutIndex];

    console.log(`🎯 Word assignment: Normal="${selectedWord}", Odd="${differentWord}"`);
    console.log(`🎭 Odd one out: ${oddOneOutPlayer.name} (index ${oddOneOutIndex})`);

    room.players.forEach((player, index) => {
      const isOddOneOut = index === oddOneOutIndex;
      const word = isOddOneOut ? differentWord : selectedWord;

      console.log(`📤 Sending to ${player.name}: word="${word}", isOdd=${isOddOneOut}`);

      io.to(player.id).emit('game-started', {
        word: word,
        isOddOneOut: isOddOneOut,
        timer: 30000, // 30 seconds in milliseconds
        currentTurn: 0, // Start with first player
        players: room.players // Send the full players list
      });
    });

    room.gameState = 'playing';
    console.log(`✅ Game started in room ${socket.roomCode}, state updated to 'playing'`);
  });

  socket.on('give-hint', ({ hint }) => {
    console.log(`💡 Hint given by ${socket.id} in room ${socket.roomCode}: "${hint}"`);

    const room = rooms.get(socket.roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }

    // Broadcast hint to all players in the room
    io.to(socket.roomCode).emit('hint-given', {
      playerName: player.name,
      hint: hint,
      playerId: socket.id
    });

    console.log(`✅ Hint broadcasted to room ${socket.roomCode}`);
  });

  socket.on('kick-player', ({ playerId }) => {
    console.log(`🚫 Kick request for player ${playerId} in room ${socket.roomCode}`);

    const room = rooms.get(socket.roomCode);
    if (!room) return;

    // Check if the requesting player is the host
    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer || !requestingPlayer.isHost) {
      console.log(`❌ Non-host player ${requestingPlayer?.name} tried to kick someone`);
      return;
    }

    // Find the player to kick
    const playerToKick = room.players.find(p => p.id === playerId);
    if (!playerToKick) return;

    console.log(`🚫 ${requestingPlayer.name} kicked ${playerToKick.name} from room ${socket.roomCode}`);

    // Remove player from room
    room.players = room.players.filter(p => p.id !== playerId);

    // Notify the kicked player
    io.to(playerId).emit('kicked', { message: 'You have been kicked from the room' });

    // Remove kicked player from socket room
    io.sockets.sockets.get(playerId)?.leave(socket.roomCode);

    // Update other players
    io.to(socket.roomCode).emit('player-left', {
      players: room.players,
      leftPlayerId: playerId,
      kicked: true,
      kickedPlayerName: playerToKick.name
    });

    // If room becomes empty, delete it
    if (room.players.length === 0) {
      rooms.delete(socket.roomCode);
      console.log(`🗑️ Room ${socket.roomCode} deleted (empty after kick)`);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    console.log('📊 Total connections:', io.engine.clientsCount);
    
    if (socket.roomCode) {
      const room = rooms.get(socket.roomCode);
      if (room) {
        const disconnectedPlayer = room.players.find(p => p.id === socket.id);
        if (disconnectedPlayer) {
          console.log(`👋 ${disconnectedPlayer.name} disconnected from room ${socket.roomCode}`);
          
          room.players = room.players.filter(p => p.id !== socket.id);
          
          if (room.players.length === 0) {
            rooms.delete(socket.roomCode);
            console.log(`🗑️ Room ${socket.roomCode} deleted (empty)`);
          } else {
            // If host left, assign new host
            if (!room.players.find(p => p.isHost)) {
              room.players[0].isHost = true;
              console.log(`👑 New host assigned: ${room.players[0].name}`);
            }
            
            io.to(socket.roomCode).emit('player-left', {
              players: room.players,
              leftPlayerId: socket.id,
              leftPlayerName: disconnectedPlayer.name
            });
          }
        }
      }
    }
  });
});

// Catch all handler
app.get('*', (req, res) => {
  res.json({ 
    message: 'API is running',
    availableEndpoints: [
      'GET /api/health',
      'POST /api/create-room',
      'GET /api/room/:code'
    ]
  });
});

const PORT = process.env.PORT || 3001;

if (process.env.VERCEL) {
  module.exports = app;
} else {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.io ready`);
    console.log(`🎮 Game platform ready!`);
  });
}
