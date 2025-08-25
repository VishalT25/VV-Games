import React, { useState, useEffect } from 'react';
import VotingPhase from './VotingPhase';

function GameRoom({ socket, roomData, setRoomData, playerName, setGameState }) {
  console.log('🎮 GameRoom rendered with:', { 
    socket: socket?.connected, 
    roomData: roomData?.roomCode, 
    playerName,
    gamePhase: 'waiting'
  });
  
  const [gamePhase, setGamePhase] = useState('waiting'); // waiting, game-selection, hint-giving, voting, finished
  const [playerWord, setPlayerWord] = useState('');
  const [isOddOneOut, setIsOddOneOut] = useState(false);
  const [hints, setHints] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [timer, setTimer] = useState(0);
  const [hint, setHint] = useState('');
  const [gameResults, setGameResults] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showKickConfirm, setShowKickConfirm] = useState(null);
  const [selectedGame, setSelectedGame] = useState('oddword');
  const [showRules, setShowRules] = useState(false);
  const [showGameDropdown, setShowGameDropdown] = useState(false);

  const games = [
    {
      id: 'oddword',
      name: 'OddWord',
      description: 'Find the player with the different word!',
      icon: '🎯',
      players: '3-8 players'
    }
    // Future games can be added here
  ];

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showGameDropdown && !event.target.closest('.game-dropdown-container')) {
        setShowGameDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGameDropdown]);

  useEffect(() => {
    socket.on('player-joined', (data) => {
      setRoomData(prev => ({ ...prev, players: data.players }));
    });

    socket.on('player-left', (data) => {
      setRoomData(prev => ({ ...prev, players: data.players }));
      
      // Show notification for kicked players
      if (data.kicked && data.kickedPlayerName) {
        // You can add a notification here if you want to show who was kicked
        console.log(`${data.kickedPlayerName} was kicked from the room`);
      }
    });

    socket.on('kicked', (data) => {
      // Handle being kicked
      setGameState('lobby');
      // You can show a notification here
      console.log('You have been kicked from the room');
    });

    socket.on('game-started', (data) => {
      console.log('🎉 Game started event received:', data);
      setPlayerWord(data.word);
      setIsOddOneOut(data.isOddOneOut);
      setGamePhase('hint-giving');
      setTimer(data.timer);
      console.log('✅ Game phase set to hint-giving');
    });

    socket.on('hint-given', (data) => {
      setHints(prev => [...prev, {
        playerName: data.playerName,
        hint: data.hint,
        playerId: data.playerId
      }]);
      setCurrentTurn(data.currentTurn);
    });

    socket.on('voting-phase-start', (data) => {
      setGamePhase('voting');
      setTimer(data.timer);
    });

    socket.on('game-ended', (data) => {
      setGameResults(data);
      setGamePhase('finished');
    });

    return () => {
      socket.off('player-joined');
      socket.off('player-left');
      socket.off('kicked');
      socket.off('game-started');
      socket.off('hint-given');
      socket.off('voting-phase-start');
      socket.off('game-ended');
    };
  }, [socket, setRoomData, setGameState]);

  // Timer countdown
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer(prev => prev - 1000);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const startGame = () => {
    console.log('🎮 Start game button clicked');
    console.log('Socket connected:', socket?.connected);
    console.log('Room data:', roomData);
    console.log('Player count:', roomData?.players?.length);
    
    if (!socket || !socket.connected) {
      console.error('❌ Socket not connected');
      return;
    }
    
    if (roomData?.players?.length < 3) {
      console.error('❌ Not enough players:', roomData.players.length);
      return;
    }
    
    console.log('📡 Emitting start-game event');
    socket.emit('start-game');
  };

  const giveHint = (e) => {
    e.preventDefault();
    if (!hint.trim()) return;
    
    socket.emit('give-hint', { hint: hint.trim() });
    setHint('');
  };

  const formatTime = (ms) => {
    const seconds = Math.ceil(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isMyTurn = () => {
    return roomData.players[currentTurn]?.id === socket.id;
  };

  const leaveRoom = () => {
    setGameState('lobby');
    socket.disconnect();
    window.location.reload();
  };

  const confirmLeave = () => {
    setShowLeaveConfirm(true);
  };

  const cancelLeave = () => {
    setShowLeaveConfirm(false);
  };

  const kickPlayer = (playerId) => {
    socket.emit('kick-player', { playerId });
    setShowKickConfirm(null);
  };

  const confirmKick = (player) => {
    setShowKickConfirm(player);
  };

  const cancelKick = () => {
    setShowKickConfirm(null);
  };

  if (gamePhase === 'voting') {
    return (
      <VotingPhase
        socket={socket}
        roomData={roomData}
        timer={timer}
        formatTime={formatTime}
      />
    );
  }

  return (
    <div className="game-room">
      {/* Global Info Icon */}
      <div className="global-info-icon" onClick={() => setShowRules(true)} title="Game Rules">
        <svg viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
      </div>

      {/* Room Header */}
      <div className="room-header animate-fade-in-down">
        <div className="room-info">
          <h2>🎮 Room: {roomData.roomCode}</h2>
          <p className="room-subtitle">OddWord</p>
        </div>
        <div className="room-actions">
          {/* Game Selection Dropdown */}
          {gamePhase === 'waiting' && (
            <div className="game-dropdown-container">
              <button
                onClick={() => setShowGameDropdown(!showGameDropdown)}
                className="game-select-btn"
              >
                <span className="btn-icon">🎯</span>
                {games.find(g => g.id === selectedGame)?.name || 'Select Game'}
                <span className="dropdown-arrow">▼</span>
              </button>
              {showGameDropdown && (
                <div className="game-dropdown-menu">
                  {games.map(game => (
                    <div
                      key={game.id}
                      className={`game-dropdown-item ${selectedGame === game.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedGame(game.id);
                        setShowGameDropdown(false);
                      }}
                    >
                      <span className="game-dropdown-icon">{game.icon}</span>
                      <div className="game-dropdown-info">
                        <div className="game-dropdown-name">{game.name}</div>
                        <div className="game-dropdown-desc">{game.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={confirmLeave} className="leave-room-btn">
            <span className="btn-icon">🚪</span>
            Leave
          </button>
        </div>
      </div>

      {/* Players Section */}
      {gamePhase === 'waiting' && (
        <div className="game-room-layout">
          <div className="players-section">
            <div className="players-list">
              <div className="players-header">
                <h3>👥 Players</h3>
                <div className="player-count-badge">
                  {roomData.players.length}/8
                </div>
              </div>
              <div className="players-grid">
                {roomData.players.map((player, index) => (
                  <div
                    key={player.id}
                    className={`player-card ${player.id === socket.id ? 'you' : ''} ${
                      gamePhase === 'hint-giving' && isMyTurn() && player.id === socket.id ? 'current-turn' : ''
                    }`}
                  >
                    {/* Player Controls (only visible to host) */}
                    {roomData.isHost && player.id !== socket.id && (
                      <div className="player-controls">
                        <button
                          className="player-control-btn kick-btn"
                          onClick={() => confirmKick(player)}
                          title="Kick player"
                        >
                          🚫
                        </button>
                      </div>
                    )}

                    <div className="player-avatar">
                      {player.isHost ? '👑' : '👤'}
                    </div>

                    <div className="player-info">
                      <div className="player-name">
                        {player.name}
                        {player.id === socket.id && <span className="you-badge">(You)</span>}
                        {player.isHost && <span className="host-badge">Host</span>}
                        {gamePhase === 'hint-giving' && isMyTurn() && player.id === socket.id && (
                          <span className="turn-indicator">Your Turn!</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timer */}
      {timer > 0 && (
        <div className="timer animate-fade-in-up">
          <div className="timer-icon">⏰</div>
          <div className="timer-text">
            <span className="timer-label">Time Remaining</span>
            <span className="timer-value">{formatTime(timer)}</span>
          </div>
        </div>
      )}

      {/* Host Controls */}
      {roomData.isHost && gamePhase === 'waiting' && (
        <div className="host-controls animate-fade-in-up">
          <h4>👑 Host Controls</h4>
          <div className="host-actions">
            {roomData.players.length >= 3 ? (
              <button onClick={startGame} className="start-game-btn">
                <span className="btn-icon">🚀</span>
                Start Game
              </button>
            ) : (
              <div className="player-requirement">
                <div className="requirement-icon">👥</div>
                <p>Need at least <strong>3 players</strong> to start</p>
                <div className="player-progress">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${(roomData.players.length / 3) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Controls (for non-hosts) */}
      {!roomData.isHost && gamePhase === 'waiting' && (
        <div className="game-controls animate-fade-in-up">
          <div className="waiting-content">
            <div className="waiting-icon">⏳</div>
            <h3>Waiting for host to start...</h3>
            <p>The host will start the game when ready</p>
          </div>
        </div>
      )}

      {/* Hint Giving Phase */}
      {gamePhase === 'hint-giving' && (
        <div className="game-content animate-fade-in-up">
          <div className="word-display">
            <h3>Your word:</h3>
            <div className="word-container">
              <span className="word">{playerWord}</span>
              {isOddOneOut && (
                <div className="odd-one-out-warning">
                  <span className="warning-icon">⚠️</span>
                  <span>You have the different word!</span>
                </div>
              )}
            </div>
          </div>

          {hints.length > 0 && (
            <div className="hints-list">
              <h4>💡 Hints Given</h4>
              <div className="hints-container">
                {hints.map((hintData, index) => (
                  <div key={index} className="hint-item" style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className="hint-header">
                      <span className="hint-player">{hintData.playerName}</span>
                      <span className="hint-number">#{index + 1}</span>
                    </div>
                    <div className="hint-text">{hintData.hint}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentTurn < roomData.players.length && (
            <div className="hint-giving">
              <div className="turn-indicator-large">
                <div className="turn-icon">🎯</div>
                <p>
                  Current turn: <strong>{roomData.players[currentTurn]?.name}</strong>
                  {isMyTurn() && <span className="your-turn-highlight"> (Your turn!)</span>}
                </p>
              </div>
              
              {isMyTurn() && (
                <form onSubmit={giveHint} className="hint-form">
                  <div className="hint-input-group">
                    <input
                      type="text"
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      placeholder="Give a hint about your word..."
                      maxLength={50}
                      autoFocus
                    />
                    <div className="hint-char-count">
                      {hint.length}/50
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary">
                    <span className="btn-icon">💭</span>
                    Submit Hint
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* Game Results */}
      {gamePhase === 'finished' && gameResults && (
        <div className="game-results animate-scale-in">
          <div className="results-header">
            <h2>🎉 Game Over!</h2>
            <div className="winner-announcement">
              {gameResults.winner === 'majority' ? '🏆 Majority Wins!' : '🎭 Odd One Out Wins!'}
            </div>
          </div>
          
          <div className="results-content">
            <div className="result-item">
              <span className="result-label">Winner:</span>
              <span className="result-value">
                {gameResults.winner === 'majority' ? 'Majority' : 'Odd One Out'}
              </span>
            </div>
            
            <div className="result-item">
              <span className="result-label">Different word:</span>
              <span className="result-value odd-word">{gameResults.oddWord}</span>
            </div>
            
            <div className="result-item">
              <span className="result-label">Common word:</span>
              <span className="result-value common-word">{gameResults.correctWord}</span>
            </div>
            
            <div className="result-item">
              <span className="result-label">Odd one out:</span>
              <span className="result-value">
                {roomData.players.find(p => p.id === gameResults.oddOneOut)?.name}
              </span>
            </div>
          </div>
          
          <button onClick={() => setGamePhase('waiting')} className="btn btn-primary play-again-btn">
            <span className="btn-icon">🔄</span>
            Play Again
          </button>
        </div>
      )}

      {/* Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="modal-overlay" onClick={cancelLeave}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🚪 Leave Room?</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to leave the room?</p>
              <p className="warning-text">This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button onClick={cancelLeave} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={leaveRoom} className="btn btn-leave">
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kick Confirmation Modal */}
      {showKickConfirm && (
        <div className="modal-overlay" onClick={cancelKick}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🚫 Kick Player?</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to kick <strong>{showKickConfirm.name}</strong> from the room?</p>
              <p className="warning-text">This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button onClick={cancelKick} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={() => kickPlayer(showKickConfirm.id)} className="btn btn-leave">
                Kick Player
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content rules-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📖 Game Rules</h3>
            </div>
            <div className="modal-body">
              <div className="rules-content">
                <div className="rules-section">
                  <h4><span className="rule-icon">🎯</span> OddWord</h4>
                  <p>Find the player with the different word in this exciting social deduction game!</p>
                </div>
                
                <div className="rules-section">
                  <h4><span className="rule-icon">🎭</span> How to Play</h4>
                  <ul className="rules-list">
                    <li>
                      <span className="rule-icon">👥</span>
                      <span>3-8 players can join a room</span>
                    </li>
                    <li>
                      <span className="rule-icon">📝</span>
                      <span>Most players get the same word, one player gets a different word</span>
                    </li>
                    <li>
                      <span className="rule-icon">💡</span>
                      <span>Players take turns giving hints about their word</span>
                    </li>
                    <li>
                      <span className="rule-icon">🗳️</span>
                      <span>After all hints, players vote on who has the different word</span>
                    </li>
                    <li>
                      <span className="rule-icon">🏆</span>
                      <span>Majority wins if they identify the odd one out, odd one out wins if they remain hidden</span>
                    </li>
                  </ul>
                </div>
                
                <div className="rules-section">
                  <h4><span className="rule-icon">💡</span> Tips</h4>
                  <ul className="rules-list">
                    <li>
                      <span className="rule-icon">🎯</span>
                      <span>Give hints that are specific enough to prove you know your word</span>
                    </li>
                    <li>
                      <span className="rule-icon">🤔</span>
                      <span>Pay attention to other players' hints to identify patterns</span>
                    </li>
                    <li>
                      <span className="rule-icon">🎭</span>
                      <span>If you're the odd one out, try to blend in with your hints</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowRules(false)} className="btn btn-primary">
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameRoom;
