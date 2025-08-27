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
    origin: [
      'http://localhost:3000', 
      'http://localhost:3001', 
      'http://127.0.0.1:3000',
      'https://vv-games.vercel.app',
      'https://vv-games-vishalt25.vercel.app',
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.vercel\.app$/
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
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

  socket.on('start-game', (gameSettings = {}) => {
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

    // Initialize game settings with defaults
    const settings = {
      timerDuration: gameSettings.timerDuration || 30000, // 30 seconds default
      imposterKnowsRole: gameSettings.imposterKnowsRole !== undefined ? gameSettings.imposterKnowsRole : false,
      playerOrder: gameSettings.playerOrder || 'random', // 'random' or 'host-set'
      customOrder: gameSettings.customOrder || null
    };

    // Start the game
    console.log(`🎮 Starting game in room ${socket.roomCode} with ${room.players.length} players`);

    // Expanded word list for better gameplay
    const words = [
      'apple', 'banana', 'carrot', 'dog', 'elephant', 'flower', 'guitar', 'house',
      'ocean', 'mountain', 'forest', 'city', 'book', 'music', 'painting', 'dance',
      'coffee', 'pizza', 'chocolate', 'ice cream', 'rain', 'sunshine', 'snow', 'wind'
    ];
    const selectedWord = words[Math.floor(Math.random() * words.length)];
    let differentWord = words[Math.floor(Math.random() * words.length)];
    
    // Ensure different word is actually different
    while (differentWord === selectedWord) {
      differentWord = words[Math.floor(Math.random() * words.length)];
    }

    // Determine player order
    let turnOrder;
    if (settings.playerOrder === 'host-set' && settings.customOrder) {
      turnOrder = settings.customOrder;
    } else {
      // Random order
      turnOrder = [...Array(room.players.length).keys()];
      for (let i = turnOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
      }
    }

    // Randomly assign one player as the "odd one out"
    const oddOneOutIndex = Math.floor(Math.random() * room.players.length);
    const oddOneOutPlayer = room.players[oddOneOutIndex];

    console.log(`🎯 Word assignment: Normal="${selectedWord}", Odd="${differentWord}"`);
    console.log(`🎭 Odd one out: ${oddOneOutPlayer.name} (index ${oddOneOutIndex})`);
    console.log(`🔄 Turn order: ${turnOrder.map(i => room.players[i].name).join(', ')}`);

    // Initialize game state
    room.gameState = 'hint-giving';
    room.gameData = {
      normalWord: selectedWord,
      oddWord: differentWord,
      oddOneOutIndex: oddOneOutIndex,
      turnOrder: turnOrder,
      currentTurnIndex: 0,
      hints: [],
      hintsGiven: 0,
      settings: settings,
      votes: {},
      gamePhase: 'hint-giving'
    };

    room.players.forEach((player, index) => {
      const isOddOneOut = index === oddOneOutIndex;
      const word = isOddOneOut ? differentWord : selectedWord;
      const knowsRole = settings.imposterKnowsRole || !isOddOneOut;

      console.log(`📤 Sending to ${player.name}: word="${word}", isOdd=${isOddOneOut}, knowsRole=${knowsRole}`);

      io.to(player.id).emit('game-started', {
        word: word,
        isOddOneOut: isOddOneOut,
        knowsRole: knowsRole,
        timer: settings.timerDuration,
        currentTurnIndex: 0,
        turnOrder: turnOrder.map(i => room.players[i].name),
        players: room.players,
        settings: settings,
        roomCode: socket.roomCode
      });
    });

    console.log(`✅ Game started in room ${socket.roomCode}, state updated to 'hint-giving'`);
  });

  socket.on('give-hint', ({ hint }) => {
    console.log(`💡 Hint given by ${socket.id} in room ${socket.roomCode}: "${hint}"`);

    const room = rooms.get(socket.roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (!room.gameData || room.gameData.gamePhase !== 'hint-giving') {
      socket.emit('error', { message: 'Not currently in hint-giving phase' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }

    // Check if it's the player's turn
    const currentPlayerIndex = room.gameData.turnOrder[room.gameData.currentTurnIndex];
    const currentPlayer = room.players[currentPlayerIndex];
    
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: "It's not your turn" });
      return;
    }

    // Add hint to game data
    const hintData = {
      playerName: player.name,
      hint: hint,
      playerId: socket.id,
      playerIndex: room.gameData.currentTurnIndex,
      timestamp: Date.now()
    };

    room.gameData.hints.push(hintData);
    room.gameData.hintsGiven++;

    // Broadcast hint to all players
    io.to(socket.roomCode).emit('hint-given', hintData);

    // Move to next turn
    room.gameData.currentTurnIndex++;

    if (room.gameData.currentTurnIndex >= room.players.length) {
      // All players have given hints, transition to decision phase
      io.to(socket.roomCode).emit('all-hints-given', {
        hints: room.gameData.hints,
        roundNumber: 1
      });
      
      room.gameData.gamePhase = 'decision';
      console.log(`✅ All hints given in room ${socket.roomCode}, transitioning to decision phase`);
    } else {
      // Move to next player's turn
      const nextPlayerIndex = room.gameData.turnOrder[room.gameData.currentTurnIndex];
      const nextPlayer = room.players[nextPlayerIndex];
      
      io.to(socket.roomCode).emit('next-turn', {
        currentTurnIndex: room.gameData.currentTurnIndex,
        currentPlayer: nextPlayer,
        timer: room.gameData.settings.timerDuration
      });
      
      console.log(`✅ Next turn: ${nextPlayer.name} in room ${socket.roomCode}`);
    }
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

  // Decision phase: host decides to continue hints or start voting
  socket.on('decision-continue-hints', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameData) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer || !requestingPlayer.isHost) {
      socket.emit('error', { message: 'Only the host can make this decision' });
      return;
    }

    // Reset turn order for another round
    room.gameData.currentTurnIndex = 0;
    room.gameData.gamePhase = 'hint-giving';

    const firstPlayerIndex = room.gameData.turnOrder[0];
    const firstPlayer = room.players[firstPlayerIndex];

    io.to(socket.roomCode).emit('continue-hints', {
      currentTurnIndex: 0,
      currentPlayer: firstPlayer,
      timer: room.gameData.settings.timerDuration,
      roundNumber: Math.floor(room.gameData.hintsGiven / room.players.length) + 1
    });

    console.log(`🔄 Host decided to continue hints in room ${socket.roomCode}`);
  });

  socket.on('decision-start-voting', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameData) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer || !requestingPlayer.isHost) {
      socket.emit('error', { message: 'Only the host can make this decision' });
      return;
    }

    room.gameData.gamePhase = 'voting';
    room.gameData.votes = {};

    io.to(socket.roomCode).emit('voting-phase-start', {
      timer: 60000, // 1 minute for voting
      hints: room.gameData.hints
    });

    console.log(`🗳️ Voting phase started in room ${socket.roomCode}`);
  });

  // Voting system
  socket.on('cast-vote', ({ votedPlayerId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameData || room.gameData.gamePhase !== 'voting') return;

    const voter = room.players.find(p => p.id === socket.id);
    if (!voter) return;

    room.gameData.votes[socket.id] = votedPlayerId;

    io.to(socket.roomCode).emit('vote-cast', {
      votes: room.gameData.votes,
      voterName: voter.name
    });

    // Check if all players have voted
    if (Object.keys(room.gameData.votes).length === room.players.length) {
      processVotingResults(room, socket.roomCode);
    }

    console.log(`🗳️ Vote cast by ${voter.name} in room ${socket.roomCode}`);
  });

  // Imposter guess system
  socket.on('imposter-guess', ({ guess }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !room.gameData || room.gameData.gamePhase !== 'imposter-guess') return;

    const guessingPlayer = room.players.find(p => p.id === socket.id);
    const imposterIndex = room.gameData.oddOneOutIndex;
    
    if (!guessingPlayer || room.players.indexOf(guessingPlayer) !== imposterIndex) {
      socket.emit('error', { message: 'Only the imposter can make a guess' });
      return;
    }

    const correctGuess = guess.toLowerCase().trim() === room.gameData.normalWord.toLowerCase();
    
    io.to(socket.roomCode).emit('game-ended', {
      winner: correctGuess ? 'imposter' : 'majority',
      reason: correctGuess ? 'imposter-correct-guess' : 'imposter-wrong-guess',
      imposterName: guessingPlayer.name,
      imposterGuess: guess,
      correctWord: room.gameData.normalWord,
      oddWord: room.gameData.oddWord,
      allHints: room.gameData.hints
    });

    room.gameState = 'finished';
    console.log(`🎯 Imposter ${guessingPlayer.name} guessed "${guess}" - ${correctGuess ? 'CORRECT' : 'WRONG'}`);
  });

  // Host controls
  socket.on('transfer-host', ({ newHostId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;

    const currentHost = room.players.find(p => p.id === socket.id);
    const newHost = room.players.find(p => p.id === newHostId);
    
    if (!currentHost || !currentHost.isHost || !newHost) {
      socket.emit('error', { message: 'Invalid host transfer' });
      return;
    }

    currentHost.isHost = false;
    newHost.isHost = true;

    io.to(socket.roomCode).emit('host-transferred', {
      newHostName: newHost.name,
      players: room.players
    });

    console.log(`👑 Host transferred from ${currentHost.name} to ${newHost.name} in room ${socket.roomCode}`);
  });

  socket.on('update-game-settings', ({ settings }) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer || !requestingPlayer.isHost) {
      socket.emit('error', { message: 'Only the host can update settings' });
      return;
    }

    // Update room settings (only if game hasn't started)
    if (room.gameState === 'waiting') {
      room.gameSettings = { ...room.gameSettings, ...settings };
      
      io.to(socket.roomCode).emit('settings-updated', {
        settings: room.gameSettings
      });

      console.log(`⚙️ Game settings updated in room ${socket.roomCode}:`, settings);
    }
  });

  socket.on('set-player-order', ({ customOrder }) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;

    const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer || !requestingPlayer.isHost) {
      socket.emit('error', { message: 'Only the host can set player order' });
      return;
    }

    if (room.gameState === 'waiting') {
      room.customPlayerOrder = customOrder;
      
      io.to(socket.roomCode).emit('player-order-set', {
        customOrder: customOrder
      });

      console.log(`🔄 Custom player order set in room ${socket.roomCode}:`, customOrder);
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

// Helper function to process voting results
function processVotingResults(room, roomCode) {
  const votes = room.gameData.votes;
  const voteCounts = {};
  
  // Count votes
  Object.values(votes).forEach(votedPlayerId => {
    voteCounts[votedPlayerId] = (voteCounts[votedPlayerId] || 0) + 1;
  });
  
  // Find the player with most votes
  let maxVotes = 0;
  let votedOutPlayerId = null;
  
  Object.entries(voteCounts).forEach(([playerId, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      votedOutPlayerId = playerId;
    }
  });
  
  const votedOutPlayer = room.players.find(p => p.id === votedOutPlayerId);
  const imposterIndex = room.gameData.oddOneOutIndex;
  const imposter = room.players[imposterIndex];
  const isImposterVotedOut = votedOutPlayer && room.players.indexOf(votedOutPlayer) === imposterIndex;
  
  if (isImposterVotedOut) {
    // Imposter was voted out - give them a chance to guess the word
    room.gameData.gamePhase = 'imposter-guess';
    
    io.to(roomCode).emit('imposter-voted-out', {
      votedOutPlayer: votedOutPlayer.name,
      isImposter: true,
      voteCounts: voteCounts
    });
    
    // Send imposter guess prompt only to the imposter
    io.to(imposter.id).emit('imposter-guess-prompt', {
      normalWord: room.gameData.normalWord, // They need to guess this
      timeLimit: 30000 // 30 seconds to guess
    });
    
  } else {
    // Wrong person voted out - imposter wins
    io.to(roomCode).emit('game-ended', {
      winner: 'imposter',
      reason: 'wrong-person-voted',
      votedOutPlayer: votedOutPlayer?.name || 'No one',
      imposterName: imposter.name,
      correctWord: room.gameData.normalWord,
      oddWord: room.gameData.oddWord,
      allHints: room.gameData.hints,
      voteCounts: voteCounts
    });
    
    room.gameState = 'finished';
  }
  
  console.log(`🗳️ Voting results in room ${roomCode}: ${votedOutPlayer?.name || 'No one'} voted out (Imposter: ${isImposterVotedOut})`);
}

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
