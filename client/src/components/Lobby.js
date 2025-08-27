import React, { useState } from 'react';

function Lobby({ playerName, setPlayerName, createRoom, joinRoom, error, setError, isConnected, isConnecting }) {
  const [roomCode, setRoomCode] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }
    joinRoom(roomCode.trim());
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    try {
      await createRoom();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-container">
        <h1><span className="emoji">🎮</span> VV Games</h1>
        <p>Welcome to the ultimate multiplayer gaming experience!</p>
        
        {/* Error Display */}
        {error && (
          <div className="error" role="alert">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}
        
        {/* Player Name Input */}
        <div className="name-input">
          <label htmlFor="playerName" className="input-label">
            <span className="label-icon">👤</span>
            Your Name
          </label>
          <input
            id="playerName"
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            className={playerName.trim() ? 'has-value' : ''}
          />
          <div className="input-char-count">
            {playerName.length}/20
          </div>
        </div>

        {/* Action Buttons */}
        <div className="lobby-actions">
          <button 
            onClick={handleCreateRoom}
            className="btn btn-primary"
            disabled={!playerName.trim() || !isConnected || isCreating}
          >
            {isCreating ? (
              <>
                <div className="btn-spinner"></div>
                Creating...
              </>
            ) : (
              <>
                <span className="btn-icon">✨</span>
                Create New Room
              </>
            )}
          </button>

          <button 
            onClick={() => setShowJoinForm(!showJoinForm)}
            className="btn btn-secondary"
            disabled={!isConnected}
          >
            <span className="btn-icon">🚪</span>
            Join Room
          </button>
        </div>

        {/* Join Room Form */}
        {showJoinForm && (
          <form onSubmit={handleJoinRoom} className="join-form animate-slide-in-up">
            <div className="join-input-group">
              <label htmlFor="roomCode" className="input-label">
                <span className="label-icon">🔑</span>
                Room Code
              </label>
              <input
                id="roomCode"
                type="text"
                placeholder="ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoComplete="off"
                className={roomCode.trim() ? 'has-value' : ''}
              />
              <div className="input-char-count">
                {roomCode.length}/6
              </div>
            </div>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={!playerName.trim() || !roomCode.trim() || !isConnected}
            >
              <span className="btn-icon">🎯</span>
              Join
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="lobby-footer">
          <p>Created by <a href="https://github.com/VishalT25" target="_blank" rel="noopener noreferrer">Vishal</a> & <a href="https://github.com/varshannnn" target="_blank" rel="noopener noreferrer">Varshan</a></p>
        </div>
      </div>
    </div>
  );
}

export default Lobby;
