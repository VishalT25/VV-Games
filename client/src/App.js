import React, { useState, useEffect, useCallback, useRef } from 'react';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import Notification from './components/Notification';
import './styles/App.css';

const API_URL = process.env.NODE_ENV === 'production' 
  ? window.location.origin 
  : 'http://localhost:3001';

console.log('🔗 API URL:', API_URL);
console.log('🌍 Current origin:', window.location.origin);
console.log('🔧 Environment:', process.env.NODE_ENV);

function App() {
  const [gameState, setGameState] = useState('lobby'); // lobby, room, playing
  const [roomData, setRoomData] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [playerId, setPlayerId] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  
  // Use ref to store joinRoom function to avoid dependency issues
  const joinRoomRef = useRef();

  const addNotification = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    const notification = { id, message, type, duration };
    setNotifications(prev => [...prev, notification]);
    
    // Auto-remove after duration
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  }, []);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n !== id));
  };

  const createRoom = async () => {
    console.log('🚀 createRoom called');
    console.log('Player name:', playerName);
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!isConnected) {
      setError('Not connected to server. Please wait...');
      return;
    }

    try {
      console.log('📡 Making API request to:', `${API_URL}/api/create-room`);
      const response = await fetch(`${API_URL}/api/create-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('📡 API response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📡 API response data:', data);
      
      if (!data.roomCode) {
        throw new Error('Invalid room data received');
      }
      
      // Store player name for future use
      localStorage.setItem('playerName', playerName.trim());
      
      // Now join the room
      await joinRoomRef.current(data.roomCode);
      
    } catch (error) {
      console.error('❌ Error creating room:', error);
      setError(`Failed to create room: ${error.message}`);
      addNotification(`Failed to create room: ${error.message}`, 'error');
    }
  };

  const joinRoom = async (roomCode) => {
    console.log('🎯 joinRoom called with code:', roomCode);
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/join-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: roomCode,
          playerName: playerName.trim()
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Joined room successfully:', data);
      
      setPlayerId(data.playerId);
      setRoomData(data.room);
      setGameState('room');
      setError('');
      addNotification(`Joined room ${roomCode}!`, 'success', 3000);
      
      // Store player name for future use
      localStorage.setItem('playerName', playerName.trim());
      
      // Update URL to show room code
      window.history.pushState({}, '', `/${roomCode}`);
      
      // Start polling for room updates
      startRoomPolling(roomCode);
      
    } catch (error) {
      console.error('❌ Error joining room:', error);
      setError(`Failed to join room: ${error.message}`);
      addNotification(`Failed to join room: ${error.message}`, 'error');
    }
  };

  // Store joinRoom function in ref
  useEffect(() => {
    joinRoomRef.current = joinRoom;
  }, []); // No dependencies needed since we're using ref to avoid circular dependencies

  // Check if we're already in a room from URL
  const checkRoomAndJoin = useCallback(async (roomCode) => {
    try {
      const response = await fetch(`${API_URL}/api/room/${roomCode}/status`);
      if (response.ok) {
        const roomStatus = await response.json();
        console.log('✅ Room found:', roomStatus);
        
        // If we have a player name stored, try to join
        const storedPlayerName = localStorage.getItem('playerName');
        if (storedPlayerName) {
          setPlayerName(storedPlayerName);
          // Instead of calling joinRoom directly, we'll set the state to trigger a re-render
          // and the useEffect will handle the room joining
          setError(`Room ${roomCode} exists. Please refresh the page to join.`);
        } else {
          // Room exists but no player name, stay in lobby
          setError(`Room ${roomCode} exists. Please enter your name to join.`);
        }
      } else {
        console.log('❌ Room not found:', roomCode);
        setError(`Room ${roomCode} not found.`);
      }
    } catch (error) {
      console.error('❌ Error checking room:', error);
      setError(`Error checking room: ${error.message}`);
    }
  }, []); // No dependencies needed

  // Handle room joining when player name is available
  useEffect(() => {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length === 2 && pathParts[1] && pathParts[1] !== '' && playerName && joinRoomRef.current) {
      const roomCode = pathParts[1];
      console.log('🔍 Player name available, joining room:', roomCode);
      joinRoomRef.current(roomCode);
    }
  }, [playerName]); // Only depends on playerName, not joinRoom

  useEffect(() => {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length === 2 && pathParts[1] && pathParts[1] !== '') {
      const roomCode = pathParts[1];
      console.log('🔍 Found room code in URL:', roomCode);
      
      // Check if room exists
      checkRoomAndJoin(roomCode);
    }
  }, [checkRoomAndJoin]);

  useEffect(() => {
    console.log('🔗 Checking API connectivity at:', API_URL);
    console.log('🌍 Environment:', process.env.NODE_ENV);
    
    // Check if the backend is accessible
    const checkBackendHealth = async () => {
      try {
        console.log('🏥 Checking backend health at:', `${API_URL}/api/health`);
        const response = await fetch(`${API_URL}/api/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
          const healthData = await response.json();
          console.log('✅ Backend health check passed:', healthData);
          setIsConnected(true);
          setIsConnecting(false);
          setError('');
          addNotification('Connected to server successfully!', 'success', 3000);
        } else {
          console.error('❌ Backend health check failed:', response.status, response.statusText);
          setIsConnected(false);
          setIsConnecting(false);
          setError(`Backend health check failed: ${response.status} ${response.statusText}`);
        }
      } catch (healthError) {
        console.error('❌ Backend health check error:', healthError);
        setIsConnected(false);
        setIsConnecting(false);
        
        let errorMessage = 'Failed to connect to server. ';
        if (healthError.message) {
          errorMessage += `Error: ${healthError.message}. `;
        }
        if (healthError.code === 'ECONNREFUSED') {
          errorMessage += 'Server is not running or not accessible.';
        } else if (healthError.code === 'ENOTFOUND') {
          errorMessage += 'Server domain not found. Check if backend is deployed.';
        } else if (healthError.code === 'ETIMEDOUT') {
          errorMessage += 'Connection timed out. Server might be overloaded.';
        } else if (healthError.code === 'ERR_NETWORK') {
          errorMessage += 'Network error. Check your internet connection.';
        } else {
          errorMessage += `Connection failed (Code: ${healthError.code || 'Unknown'}).`;
        }
        
        setError(errorMessage);
        addNotification(errorMessage, 'error');
      }
    };
    
    checkBackendHealth();
  }, [addNotification]);

  const startRoomPolling = (roomCode) => {
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    // Start new polling
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/room/${roomCode}/poll`);
        if (response.ok) {
          const roomStatus = await response.json();
          setRoomData(roomStatus);
        }
      } catch (error) {
        console.error('❌ Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
    
    setPollingInterval(interval);
  };

  const stopRoomPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopRoomPolling();
    };
  }, [stopRoomPolling]);

  const leaveRoom = () => {
    // Stop polling
    stopRoomPolling();
    
    // Clear room data
    setRoomData(null);
    setPlayerId(null);
    setGameState('lobby');
    
    // Update URL back to root
    window.history.pushState({}, '', '/');
    
    // Clear error
    setError('');
    
    addNotification('Left the room', 'info');
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎮 VV Games</h1>
        {/* Connection Status Display */}
        <div className="connection-status" style={{ 
          padding: '8px 16px', 
          borderRadius: '20px', 
          fontSize: '14px', 
          fontWeight: 'bold',
          marginBottom: '20px',
          backgroundColor: isConnected ? '#4CAF50' : isConnecting ? '#FF9800' : '#f44336',
          color: 'white'
        }}>
          {isConnecting ? '🔄 Connecting...' : isConnected ? '✅ Connected' : '❌ Disconnected'}
        </div>
        {error && (
          <div className="error-message" style={{ 
            color: '#f44336', 
            backgroundColor: '#ffebee', 
            padding: '10px', 
            borderRadius: '5px', 
            marginBottom: '20px',
            maxWidth: '600px',
            textAlign: 'center'
          }}>
            <strong>Connection Error:</strong><br />
            {error}
          </div>
        )}
        {API_URL && (
          <div className="server-info" style={{ 
            fontSize: '12px', 
            color: '#666', 
            marginBottom: '20px',
            fontFamily: 'monospace'
          }}>
            API Server: {API_URL}
          </div>
        )}
      </header>
      {gameState === 'lobby' && (
        <>
          <Lobby
            playerName={playerName}
            setPlayerName={setPlayerName}
            createRoom={createRoom}
            joinRoom={joinRoom}
            error={error}
            setError={setError}
            isConnected={isConnected}
            isConnecting={isConnecting}
          />
          
          {/* Notification Container */}
          <div className="notification-container">
            {notifications.map(notification => (
              <Notification
                key={notification.id}
                message={notification.message}
                type={notification.type}
                duration={notification.duration}
                onClose={() => removeNotification(notification.id)}
              />
            ))}
          </div>
        </>
      )}

      {(gameState === 'room' || gameState === 'playing') && (
        <>
          <GameRoom
            roomData={roomData}
            setRoomData={setRoomData}
            playerName={playerName}
            setGameState={setGameState}
            playerId={playerId}
            apiUrl={API_URL}
            leaveRoom={leaveRoom}
          />
          
          {/* Notification Container */}
          <div className="notification-container">
            {notifications.map(notification => (
              <Notification
                key={notification.id}
                message={notification.message}
                type={notification.type}
                duration={notification.duration}
                onClose={() => removeNotification(notification.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
