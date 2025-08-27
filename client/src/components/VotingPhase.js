import React, { useState, useEffect } from 'react';

function VotingPhase({ socket, roomData, timer, formatTime }) {
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const [votes, setVotes] = useState({});
  const [showVoteConfirmation, setShowVoteConfirmation] = useState(false);

  useEffect(() => {
    socket.on('vote-cast', (data) => {
      setVotes(data.votes);
    });

    return () => {
      socket.off('vote-cast');
    };
  }, [socket]);

  const castVote = () => {
    if (!selectedPlayer || hasVoted) return;
    
    setShowVoteConfirmation(true);
  };

  const confirmVote = () => {
    socket.emit('cast-vote', { votedPlayerId: selectedPlayer });
    setHasVoted(true);
    setShowVoteConfirmation(false);
  };

  const cancelVote = () => {
    setShowVoteConfirmation(false);
  };

  const otherPlayers = roomData?.players?.filter(p => p.id !== socket.id) || [];

  return (
    <div className="voting-phase">
      <div className="voting-header animate-fade-in-down">
        <h2>🗳️ Voting Time!</h2>
        <p className="voting-subtitle">Who do you think has the different word?</p>
      </div>

      {/* Timer */}
      <div className="voting-timer animate-fade-in-up">
        <div className="timer-icon">⏰</div>
        <div className="timer-content">
          <span className="timer-label">Time Remaining</span>
          <span className="timer-value">{formatTime(timer)}</span>
        </div>
      </div>
      
      {/* Voting Form */}
      {!hasVoted ? (
        <div className="voting-form animate-fade-in-up">
          <div className="voting-instructions">
            <div className="instruction-icon">🎯</div>
            <p>Select the player you think has the different word:</p>
          </div>
          
          <div className="player-options">
            {otherPlayers.map((player, index) => (
              <label 
                key={player.id} 
                className={`player-option ${selectedPlayer === player.id ? 'selected' : ''}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <input
                  type="radio"
                  name="vote"
                  value={player.id}
                  onChange={(e) => setSelectedPlayer(e.target.value)}
                />
                <div className="player-option-content">
                  <div className="player-avatar">👤</div>
                  <span className="player-name">{player.name}</span>
                  {player.isHost && <span className="host-badge">👑</span>}
                </div>
                <div className="selection-indicator">
                  {selectedPlayer === player.id && <span className="checkmark">✓</span>}
                </div>
              </label>
            ))}
          </div>
          
          <button 
            onClick={castVote}
            disabled={!selectedPlayer}
            className="btn btn-primary cast-vote-btn"
          >
            <span className="btn-icon">🗳️</span>
            Cast Vote
          </button>
        </div>
      ) : (
        <div className="voted animate-scale-in">
          <div className="voted-content">
            <div className="voted-icon">✅</div>
            <h3>Vote Cast Successfully!</h3>
            <p>You voted for <strong>{otherPlayers.find(p => p.id === selectedPlayer)?.name}</strong></p>
            <p className="waiting-text">Waiting for other players to vote...</p>
          </div>
        </div>
      )}

      {/* Voting Progress */}
      <div className="voting-status animate-fade-in-up">
        <div className="status-header">
          <h4>📊 Voting Progress</h4>
          <div className="progress-badge">
            {Object.keys(votes).length} / {roomData.players.length} players
          </div>
        </div>
        
        <div className="progress-bar-container">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${(Object.keys(votes).length / roomData.players.length) * 100}%` }}
          ></div>
        </div>
        
        <div className="voting-stats">
          <div className="stat-item">
            <span className="stat-label">Voted:</span>
            <span className="stat-value">{Object.keys(votes).length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Remaining:</span>
            <span className="stat-value">{roomData.players.length - Object.keys(votes).length}</span>
          </div>
        </div>
      </div>

      {/* Vote Confirmation Modal */}
      {showVoteConfirmation && (
        <div className="modal-overlay" onClick={cancelVote}>
          <div className="modal-content vote-confirmation-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🗳️ Confirm Your Vote</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to vote for <strong>{otherPlayers.find(p => p.id === selectedPlayer)?.name}</strong>?</p>
              <p className="warning-text">This action cannot be changed once submitted.</p>
            </div>
            <div className="modal-actions">
              <button onClick={cancelVote} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={confirmVote} className="btn btn-primary">
                Confirm Vote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VotingPhase;
