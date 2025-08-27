import React, { useState, useEffect } from 'react';
import VotingPhase from './VotingPhase';

function GameRoom({ roomData, setRoomData, playerName, setGameState, playerId, apiUrl }) {
  console.log('🎮 GameRoom rendered with:', { 
    roomData: roomData?.code, 
    playerName,
    playerId,
    gamePhase: 'waiting'
  });
  
  const [gamePhase, setGamePhase] = useState('waiting'); // waiting, hint-giving, decision, voting, imposter-guess, finished
  const [playerWord, setPlayerWord] = useState('');
  const [isOddOneOut, setIsOddOneOut] = useState(false);
  const [hints, setHints] = useState([]);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [turnOrder, setTurnOrder] = useState([]);
  const [timer, setTimer] = useState(0);
  const [hint, setHint] = useState('');
  const [gameResults, setGameResults] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showKickConfirm, setShowKickConfirm] = useState(null);
  const [selectedGame, setSelectedGame] = useState('oddword');
  const [showRules, setShowRules] = useState(false);
  const [showGameDropdown, setShowGameDropdown] = useState(false);
  const [gameSettings, setGameSettings] = useState({
    timerDuration: 30000,
    imposterKnowsRole: false,
    playerOrder: 'random'
  });
  
  // Ensure gameSettings is never undefined
  const safeGameSettings = gameSettings || {
    timerDuration: 30000,
    imposterKnowsRole: false,
    playerOrder: 'random'
  };
  const [showHostControls, setShowHostControls] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);
  const [imposterGuess, setImposterGuess] = useState('');
  const [pendingSettings, setPendingSettings] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [customPlayerOrder, setCustomPlayerOrder] = useState([]);
  const [draggedPlayer, setDraggedPlayer] = useState(null);

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

  // Update game phase when room data changes
  useEffect(() => {
    if (roomData?.gameData) {
      setGamePhase(roomData.gameData.phase || 'waiting');
      setHints(roomData.gameData.hints || []);
    }
  }, [roomData]);

  // Check if current player is host
  const isHost = roomData?.players?.find(p => p.id === playerId)?.isHost || false;

  const startGame = () => {
    console.log('🎮 Start game button clicked');
    console.log('Room data:', roomData);
    console.log('Player count:', roomData?.players?.length);
    
    if (!roomData?.players?.length || roomData?.players?.length < 3) {
      console.error('❌ Not enough players:', roomData?.players?.length || 0);
      return;
    }
    
    const currentSettings = getCurrentSettings();
    let finalSettings = { ...currentSettings };
    
    if (currentSettings.playerOrder === 'host-set' && customPlayerOrder.length > 0 && roomData?.players && Array.isArray(roomData.players)) {
      // Convert player IDs to player indices for the backend
      const playerIndices = customPlayerOrder.map(playerId => {
        const playerIndex = roomData.players.findIndex(p => p.id === playerId);
        return playerIndex;
      });
      finalSettings.customOrder = playerIndices;
    } else {
      finalSettings.customOrder = null;
    }
    
    console.log('📡 Emitting start-game event with settings:', finalSettings);
    fetch(`${apiUrl}/start-game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalSettings),
    })
    .then(response => response.json())
    .then(data => {
      console.log('🎉 Game started event received:', data);
      console.log('📝 Word data:', data.word);
      console.log('🎭 Is odd one out:', data.isOddOneOut);
      console.log('👁️ Knows role:', data.knowsRole);
      console.log('🔄 Turn order:', data.turnOrder);
      console.log('🔄 Turn order length:', data.turnOrder?.length);
      
      setPlayerWord(data.word);
      setIsOddOneOut(data.isOddOneOut);
      setTimer(data.timer);
      setCurrentTurnIndex(data.currentTurnIndex);
      setTurnOrder(data.turnOrder);
      setGameSettings(data.settings);
      setRoundNumber(1);
      setHints([]); // Reset hints for new game
      
      // Small delay to ensure all state is properly set before showing game
      setTimeout(() => {
        setGamePhase('hint-giving');
      }, 100);
      
      console.log('✅ Game phase set to hint-giving');
      console.log('✅ Player word set to:', data.word);
      console.log('✅ Turn order set to:', data.turnOrder);
    })
    .catch(error => {
      console.error('❌ Error starting game:', error);
    });
  };

  const giveHint = (e) => {
    e.preventDefault();
    if (!hint.trim()) return;
    
    fetch(`${apiUrl}/give-hint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hint: hint.trim() }),
    })
    .then(response => response.json())
    .then(data => {
      setHints(prev => [...prev, {
        playerName: data.playerName,
        hint: data.hint,
        playerId: data.playerId,
        playerIndex: data.playerIndex,
        timestamp: data.timestamp
      }]);
      setHint('');
    })
    .catch(error => {
      console.error('❌ Error giving hint:', error);
    });
  };

  const formatTime = (ms) => {
    const seconds = Math.ceil(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isMyTurn = () => {
    if (!Array.isArray(turnOrder) || !turnOrder.length || currentTurnIndex >= turnOrder.length || !roomData?.players) {
      console.log('❌ isMyTurn check failed:', { 
        turnOrderLength: turnOrder?.length, 
        currentTurnIndex, 
        playersCount: roomData?.players?.length 
      });
      return false;
    }
    const currentPlayerName = turnOrder[currentTurnIndex];
    const currentPlayer = roomData.players.find(p => p.name === currentPlayerName);
    const isMyTurn = currentPlayer?.id === playerId;
    console.log('🎯 Turn check:', { 
      currentPlayerName, 
      currentPlayerId: currentPlayer?.id, 
      myId: playerId, 
      isMyTurn 
    });
    return isMyTurn;
  };

  const getCurrentPlayer = () => {
    if (!Array.isArray(turnOrder) || !turnOrder.length || currentTurnIndex >= turnOrder.length || !roomData?.players) return null;
    const currentPlayerName = turnOrder[currentTurnIndex];
    return roomData.players.find(p => p.name === currentPlayerName);
  };

  const continueHints = () => {
    fetch(`${apiUrl}/decision-continue-hints`)
    .then(response => response.json())
    .then(data => {
      setGamePhase(data.phase);
      setCurrentTurnIndex(data.currentTurnIndex);
      setTimer(data.timer);
      setRoundNumber(data.roundNumber);
    })
    .catch(error => {
      console.error('❌ Error continuing hints:', error);
    });
  };

  const startVoting = () => {
    fetch(`${apiUrl}/decision-start-voting`)
    .then(response => response.json())
    .then(data => {
      setGamePhase(data.phase);
      setTimer(data.timer);
    })
    .catch(error => {
      console.error('❌ Error starting voting:', error);
    });
  };

  const submitImposterGuess = (e) => {
    e.preventDefault();
    if (!imposterGuess.trim()) return;
    fetch(`${apiUrl}/imposter-guess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ guess: imposterGuess.trim() }),
    })
    .then(response => response.json())
    .then(data => {
      setGameResults(data);
      setGamePhase('imposter-guess');
    })
    .catch(error => {
      console.error('❌ Error submitting imposter guess:', error);
    });
  };

  const transferHost = (newHostId) => {
    fetch(`${apiUrl}/transfer-host`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newHostId }),
    })
    .then(response => response.json())
    .then(data => {
      setRoomData(prev => ({ ...prev, players: data.players }));
    })
    .catch(error => {
      console.error('❌ Error transferring host:', error);
    });
  };

  const updatePendingSettings = (newSettings) => {
    const updatedPending = { ...safeGameSettings, ...pendingSettings, ...newSettings };
    setPendingSettings(updatedPending);
    setHasUnsavedChanges(true);
  };

  const saveSettings = () => {
    if (pendingSettings) {
      setGameSettings(pendingSettings);
      fetch(`${apiUrl}/update-game-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings: pendingSettings }),
      })
      .then(response => response.json())
      .then(data => {
        setGameSettings(data.settings);
        setPendingSettings(null);
        setHasUnsavedChanges(false);
      })
      .catch(error => {
        console.error('❌ Error saving settings:', error);
      });
    }
  };

  const discardChanges = () => {
    setPendingSettings(null);
    setHasUnsavedChanges(false);
  };

  const getCurrentSettings = () => {
    return pendingSettings || safeGameSettings;
  };

  // Initialize custom player order when players change
  useEffect(() => {
    if (roomData?.players && Array.isArray(roomData.players) && customPlayerOrder.length === 0) {
      setCustomPlayerOrder(roomData.players.map(p => p.id));
    }
  }, [roomData?.players, customPlayerOrder.length]);

  // Drag and drop functions
  const handleDragStart = (e, playerId) => {
    setDraggedPlayer(playerId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetPlayerId) => {
    e.preventDefault();
    if (draggedPlayer && draggedPlayer !== targetPlayerId && roomData?.players && Array.isArray(roomData.players)) {
      const newOrder = [...customPlayerOrder];
      const draggedIndex = newOrder.indexOf(draggedPlayer);
      const targetIndex = newOrder.indexOf(targetPlayerId);
      
      // Remove dragged item
      newOrder.splice(draggedIndex, 1);
      // Insert at new position
      newOrder.splice(targetIndex, 0, draggedPlayer);
      
      setCustomPlayerOrder(newOrder);
      // Convert player IDs to player indices for the backend
      const playerIndices = newOrder.map(playerId => {
        const playerIndex = roomData.players.findIndex(p => p.id === playerId);
        return playerIndex;
      });
      fetch(`${apiUrl}/set-player-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customOrder: playerIndices }),
      })
      .then(response => response.json())
      .then(data => {
        setRoomData(prev => ({ ...prev, players: data.players }));
      })
      .catch(error => {
        console.error('❌ Error setting player order:', error);
      });
    }
    setDraggedPlayer(null);
  };

  const handleDragEnd = () => {
    setDraggedPlayer(null);
  };

  const leaveRoom = () => {
    setGameState('lobby');
    window.location.reload();
  };

  const confirmLeave = () => {
    setShowLeaveConfirm(true);
  };

  const cancelLeave = () => {
    setShowLeaveConfirm(false);
  };

  const kickPlayer = (playerId) => {
    fetch(`${apiUrl}/kick-player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId }),
    })
    .then(response => response.json())
    .then(data => {
      setRoomData(prev => ({ ...prev, players: data.players }));
      setShowKickConfirm(null);
    })
    .catch(error => {
      console.error('❌ Error kicking player:', error);
    });
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
        roomData={roomData}
        timer={timer}
        formatTime={formatTime}
      />
    );
  }

  // Decision Phase - Host decides to continue hints or start voting
  if (gamePhase === 'decision') {
    return (
      <div className="game-room">
        <div className="decision-phase">
          <div className="decision-header animate-fade-in-down">
            <h2>🤔 Decision Time!</h2>
            <p className="decision-subtitle">Round {roundNumber} complete. What's next?</p>
          </div>

          <div className="hints-summary animate-fade-in-up">
            <h3>Hints Given This Round:</h3>
            <div className="hints-list">
              {hints && roomData?.players && hints.slice(-roomData.players.length).map((hint, index) => (
                <div key={index} className="hint-item">
                  <strong>{hint.playerName}:</strong> "{hint.hint}"
                </div>
              ))}
            </div>
          </div>

          {isHost ? (
            <div className="decision-actions animate-fade-in-up">
              <button onClick={continueHints} className="btn btn-secondary">
                <span className="btn-icon">🔄</span>
                Continue Hints (Round {roundNumber + 1})
              </button>
              <button onClick={startVoting} className="btn btn-primary">
                <span className="btn-icon">🗳️</span>
                Start Voting
              </button>
            </div>
          ) : (
            <div className="waiting-host animate-fade-in-up">
              <p>Waiting for host to decide...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Imposter Guess Phase
  if (gamePhase === 'imposter-guess') {
    const isImposter = isOddOneOut;
    
    return (
      <div className="game-room">
        <div className="imposter-guess-phase">
          <div className="guess-header animate-fade-in-down">
            <h2>🎯 Final Chance!</h2>
            {gameResults && (
              <p className="guess-subtitle">
                {gameResults.votedOutPlayer} was voted out and is the imposter!
              </p>
            )}
          </div>

          {timer > 0 && (
            <div className="timer animate-fade-in-up">
              <div className="timer-icon">⏰</div>
              <div className="timer-text">
                <span className="timer-label">Time Remaining</span>
                <span className="timer-value">{formatTime(timer)}</span>
              </div>
            </div>
          )}

          {isImposter ? (
            <div className="imposter-guess-form animate-fade-in-up">
              <p className="guess-instruction">
                You've been caught! Guess the majority's word to win:
              </p>
              <form onSubmit={submitImposterGuess} className="guess-form">
                <input
                  type="text"
                  placeholder="Enter your guess..."
                  value={imposterGuess}
                  onChange={(e) => setImposterGuess(e.target.value)}
                  className="guess-input"
                  autoFocus
                />
                <button type="submit" className="btn btn-primary" disabled={!imposterGuess.trim()}>
                  <span className="btn-icon">🎯</span>
                  Submit Guess
                </button>
              </form>
            </div>
          ) : (
            <div className="waiting-imposter animate-fade-in-up">
              <p>Waiting for the imposter to make their final guess...</p>
            </div>
          )}
        </div>
      </div>
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
          <h2>🎮 Room: {roomData.code}</h2>
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
                  {roomData?.players?.length || 0}/8
                </div>
              </div>
              <div className="players-grid">
                {roomData?.players?.map((player, index) => (
                  <div
                    key={player.id}
                    className={`player-card ${player.id === playerId ? 'you' : ''} ${
                      gamePhase === 'hint-giving' && isMyTurn() && player.id === playerId ? 'current-turn' : ''
                    }`}
                  >
                    {/* Player Controls (only visible to host) */}
                    {isHost && player.id !== playerId && (
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
                        {player.id === playerId && <span className="you-badge">(You)</span>}
                        {player.isHost && <span className="host-badge">Host</span>}
                        {gamePhase === 'hint-giving' && isMyTurn() && player.id === playerId && (
                          <span className="turn-indicator">Your Turn!</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Player Order Configuration */}
              {isHost && getCurrentSettings().playerOrder === 'host-set' && roomData?.players && Array.isArray(roomData.players) && (
                <div className="player-order-config">
                  <h4>🎯 Set Turn Order</h4>
                  <p className="order-instruction">Drag players to reorder the turn sequence:</p>
                  <div className="draggable-players">
                    {customPlayerOrder.map((playerId, index) => {
                      const player = roomData.players.find(p => p.id === playerId);
                      if (!player) return null;
                      
                      return (
                        <div
                          key={playerId}
                          draggable
                          onDragStart={(e) => handleDragStart(e, playerId)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, playerId)}
                          onDragEnd={handleDragEnd}
                          className={`draggable-player ${draggedPlayer === playerId ? 'dragging' : ''}`}
                        >
                          <div className="order-number">{index + 1}</div>
                          <div className="player-avatar-small">
                            {player.isHost ? '👑' : '👤'}
                          </div>
                          <div className="player-name-small">{player.name}</div>
                          <div className="drag-handle">⋮⋮</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
      {isHost && gamePhase === 'waiting' && (
        <div className="host-controls animate-fade-in-up">
          <div className="host-header">
            <h4>👑 Host Controls</h4>
            <div className="header-actions">
              {hasUnsavedChanges && (
                <button 
                  onClick={saveSettings}
                  className="save-settings-square-btn"
                  title="Save Settings"
                >
                  💾
                </button>
              )}
              <button 
                onClick={() => setShowHostControls(!showHostControls)}
                className="toggle-controls-btn"
              >
                {showHostControls ? '⬆️' : '⬇️'} {showHostControls ? 'Hide' : 'Show'} Settings
              </button>
            </div>
          </div>

          {showHostControls && (
            <div className="host-settings">
              {hasUnsavedChanges && (
                <div className="unsaved-changes-warning">
                  <span className="warning-icon">⚠️</span>
                  <span>You have unsaved changes</span>
                </div>
              )}

              <div className="setting-group">
                <label>Timer Duration (seconds):</label>
                <select 
                  value={getCurrentSettings().timerDuration / 1000}
                  onChange={(e) => updatePendingSettings({ timerDuration: parseInt(e.target.value) * 1000 })}
                >
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>60 seconds</option>
                  <option value={90}>90 seconds</option>
                </select>
              </div>

              <div className="setting-group">
                <label>
                  <input
                    type="checkbox"
                    checked={getCurrentSettings().imposterKnowsRole}
                    onChange={(e) => updatePendingSettings({ imposterKnowsRole: e.target.checked })}
                  />
                  Imposter knows they're the imposter
                </label>
              </div>

              <div className="setting-group">
                <label>Player Order:</label>
                <select 
                  value={getCurrentSettings().playerOrder}
                  onChange={(e) => updatePendingSettings({ playerOrder: e.target.value })}
                >
                  <option value="random">Random</option>
                  <option value="host-set">Host Sets Order</option>
                </select>
              </div>

              {hasUnsavedChanges && (
                <div className="settings-actions">
                  <button onClick={discardChanges} className="btn btn-secondary discard-settings-btn">
                    <span className="btn-icon">↩️</span>
                    Discard Changes
                  </button>
                </div>
              )}

              <div className="setting-group">
                <label>Transfer Host:</label>
                <select onChange={(e) => e.target.value && transferHost(e.target.value)}>
                  <option value="">Select new host...</option>
                  {roomData?.players?.filter(p => p.id !== playerId).map(player => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  )) || []}
                </select>
              </div>
            </div>
          )}

          <div className="host-actions">
            {(roomData?.players?.length || 0) >= 3 ? (
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
                    style={{ width: `${((roomData?.players?.length || 0) / 3) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Controls (for non-hosts) */}
      {!isHost && gamePhase === 'waiting' && (
        <div className="game-controls animate-fade-in-up">
          <div className="waiting-content">
            <div className="waiting-icon">⏳</div>
            <h3>Waiting for host to start...</h3>
            <p>The host will start the game when ready</p>
          </div>
        </div>
      )}

      {/* Game Starting - Loading State */}
      {gamePhase === 'hint-giving' && !playerWord && (
        <div className="game-content animate-fade-in-up">
          <div className="loading-game">
            <div className="loading-icon">🎮</div>
            <h3>Starting Game...</h3>
            <p>Please wait while the game is being set up...</p>
            <div className="loading-spinner"></div>
          </div>

        </div>
      )}

      {/* Hint Giving Phase */}
      {gamePhase === 'hint-giving' && playerWord && turnOrder && Array.isArray(turnOrder) && turnOrder.length > 0 && (
        <div className="game-content animate-fade-in-up">
          <div className="game-start-celebration">
            <h2>🎉 Game Started! 🎉</h2>
            <p>Let's play OddWord!</p>
          </div>

          <div className="game-status">
            <h3>Round {roundNumber}</h3>
            <div className="turn-order">
              <h4>Turn Order:</h4>
              <div className="player-order">
                {Array.isArray(turnOrder) && turnOrder.map((playerName, index) => (
                  <span 
                    key={index} 
                    className={`order-player ${index === currentTurnIndex ? 'current' : ''} ${index < currentTurnIndex ? 'completed' : ''}`}
                  >
                    {playerName}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="word-display">
            <h3>🎯 Your word:</h3>
            <div className="word-container">
              <span className="word">{playerWord}</span>
            </div>
          </div>

          {hints && hints.length > 0 && (
            <div className="hints-list">
              <h4>💡 Hints Given</h4>
              <div className="hints-container">
                {hints && hints.length > 0 ? hints.map((hintData, index) => (
                  <div key={index} className="hint-item" style={{ animationDelay: `${index * 0.1}s` }}>
                    <div className="hint-header">
                      <span className="hint-player">{hintData.playerName}</span>
                      <span className="hint-number">#{index + 1}</span>
                    </div>
                    <div className="hint-text">{hintData.hint}</div>
                  </div>
                )) : (
                  <div className="no-hints">No hints given yet...</div>
                )}
              </div>
            </div>
          )}

          <div className="hint-giving">
            <div className="turn-indicator-large">
              <div className="turn-icon">🎯</div>
              <p>
                Current turn: <strong>{getCurrentPlayer()?.name}</strong>
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
                <button type="submit" className="btn btn-primary" disabled={!hint.trim()}>
                  <span className="btn-icon">💭</span>
                  Submit Hint
                </button>
              </form>
            )}
            

            
            {!isMyTurn() && (
              <div className="waiting-turn">
                <p>Waiting for {getCurrentPlayer()?.name} to give their hint...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Results */}
      {gamePhase === 'finished' && gameResults && (
        <div className="game-results animate-scale-in">
          <div className="results-header">
            <h2>🎉 Game Over!</h2>
            <div className="winner-announcement">
              {gameResults.winner === 'majority' ? '🏆 Majority Wins!' : '🎭 Imposter Wins!'}
            </div>
            <div className="win-reason">
              {gameResults.reason === 'imposter-correct-guess' && '🎯 Imposter guessed correctly!'}
              {gameResults.reason === 'imposter-wrong-guess' && '❌ Imposter guessed incorrectly!'}
              {gameResults.reason === 'wrong-person-voted' && '🤷 Wrong person was voted out!'}
            </div>
          </div>
          
          <div className="results-content">
            <div className="result-item">
              <span className="result-label">Winner:</span>
              <span className="result-value">
                {gameResults.winner === 'majority' ? 'Majority Players' : 'Imposter'}
              </span>
            </div>
            
            <div className="result-item">
              <span className="result-label">Imposter:</span>
              <span className="result-value imposter-name">{gameResults.imposterName}</span>
            </div>
            
            <div className="result-item">
              <span className="result-label">Majority word:</span>
              <span className="result-value common-word">{gameResults.correctWord}</span>
            </div>
            
            <div className="result-item">
              <span className="result-label">Imposter word:</span>
              <span className="result-value odd-word">{gameResults.oddWord}</span>
            </div>

            {gameResults.votedOutPlayer && (
              <div className="result-item">
                <span className="result-label">Voted out:</span>
                <span className="result-value">{gameResults.votedOutPlayer}</span>
              </div>
            )}

            {gameResults.imposterGuess && (
              <div className="result-item">
                <span className="result-label">Imposter's guess:</span>
                <span className="result-value">{gameResults.imposterGuess}</span>
              </div>
            )}

            {gameResults.voteCounts && (
              <div className="vote-results">
                <h4>Vote Results:</h4>
                {Object.entries(gameResults.voteCounts || {}).map(([playerId, votes]) => {
                  const player = roomData?.players?.find(p => p.id === playerId);
                  return (
                    <div key={playerId} className="vote-result">
                      <span>{player?.name || 'Unknown'}: {votes} vote{votes !== 1 ? 's' : ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hints-recap">
            <h4>All Hints:</h4>
            <div className="hints-container">
              {gameResults.allHints?.map((hint, index) => (
                <div key={index} className="hint-item small">
                  <strong>{hint.playerName}:</strong> "{hint.hint}"
                </div>
              ))}
            </div>
          </div>
          
          <button onClick={() => {
            setGamePhase('waiting');
            setHints([]);
            setGameResults(null);
            setCurrentTurnIndex(0);
            setTurnOrder([]);
            setRoundNumber(1);
          }} className="btn btn-primary play-again-btn">
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
