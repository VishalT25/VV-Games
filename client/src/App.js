import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import Notification from './components/Notification';
import './styles/App.css';

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://vv-games.vercel.app' 
  : 'http://localhost:3001';

console.log('🔗 Connecting to:', SOCKET_URL);

function App() {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState('lobby'); // lobby, room, playing
  const [roomData, setRoomData] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [notifications, setNotifications] = useState([]);

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
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    console.log('🔗 Attempting to connect to:', SOCKET_URL);
    console.log('🌍 Environment:', process.env.NODE_ENV);
    console.log('🔧 Socket configuration:', { transports: ['websocket', 'polling'] });
    
    // First, let's check if the backend is accessible
    const checkBackendHealth = async () => {
      try {
        console.log('🏥 Checking backend health at:', `${SOCKET_URL}/api/health`);
        const response = await fetch(`${SOCKET_URL}/api/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
          const healthData = await response.json();
          console.log('✅ Backend health check passed:', healthData);
        } else {
          console.error('❌ Backend health check failed:', response.status, response.statusText);
        }
      } catch (healthError) {
        console.error('❌ Backend health check error:', healthError);
      }
    };
    
    checkBackendHealth();
    
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    setIsConnecting(true);

    // Add connection timeout
    const connectionTimeout = setTimeout(() => {
      if (!newSocket.connected) {
        setIsConnecting(false);
        const timeoutMessage = `Connection timeout after 10 seconds. Backend at ${SOCKET_URL} is not responding. Please check if the backend is deployed and running.`;
        setError(timeoutMessage);
        addNotification(timeoutMessage, 'error');
        console.error('⏰ Connection timeout:', timeoutMessage);
      }
    }, 10000); // 10 second timeout

    newSocket.on('connect', () => {
      console.log('✅ Connected to server');
      console.log('Socket ID:', newSocket.id);
      clearTimeout(connectionTimeout);
      setIsConnected(true);
      setIsConnecting(false);
      setError('');
      addNotification('Connected to server successfully!', 'success', 3000);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      setIsConnected(false);
      addNotification('Connection lost. Trying to reconnect...', 'warning');
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error details:', {
        message: error.message,
        description: error.description,
        context: error.context,
        type: error.type,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        address: error.address,
        port: error.port
      });
      
      clearTimeout(connectionTimeout);
      setIsConnected(false);
      setIsConnecting(false);
      
      // More descriptive error messages
      let errorMessage = 'Failed to connect to server. ';
      if (error.message) {
        errorMessage += `Error: ${error.message}. `;
      }
      if (error.code === 'ECONNREFUSED') {
        errorMessage += 'Server is not running or not accessible.';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage += 'Server domain not found. Check if backend is deployed.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage += 'Connection timed out. Server might be overloaded.';
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage += 'Network error. Check your internet connection.';
      } else {
        errorMessage += `Connection failed (Code: ${error.code || 'Unknown'}).`;
      }
      
      setError(errorMessage);
      addNotification(errorMessage, 'error');
    });

    newSocket.on('error', (data) => {
      console.error('❌ Socket error:', data);
      addNotification(data.message, 'error');
    });

    newSocket.on('joined-room', (data) => {
      console.log('🎉 Successfully joined room:', data);
      setRoomData(data);
      setGameState('room');
      setError('');
      addNotification(`Joined room ${data.roomCode}!`, 'success', 3000);
    });

    setSocket(newSocket);

    return () => {
      clearTimeout(connectionTimeout);
      newSocket.close();
    };
  }, [addNotification]);

  const createRoom = async () => {
    console.log('🚀 createRoom called');
    console.log('Player name:', playerName);
    console.log('Socket state:', socket ? { connected: socket.connected, id: socket.id } : 'null');
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!socket || !socket.connected) {
      setError('Not connected to server. Please wait...');
      return;
    }

    try {
      console.log('📡 Making API request to:', `${SOCKET_URL}/api/create-room`);
      const response = await fetch(`${SOCKET_URL}/api/create-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('📡 API response status:', response.status);
      console.log('📡 API response headers:', response.headers);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📡 API response data:', data);
      
      if (!data.roomCode) {
        throw new Error('Invalid room data received');
      }
      
      console.log('🎯 Emitting join-room event with:', { roomCode: data.roomCode, playerName: playerName.trim() });
      socket.emit('join-room', {
        roomCode: data.roomCode,
        playerName: playerName.trim()
      });
    } catch (err) {
      console.error('❌ Room creation error:', err);
      setError(`Failed to create room: ${err.message}`);
    }
  };

  const joinRoom = (roomCode) => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!socket || !socket.connected) {
      setError('Not connected to server. Please wait...');
      return;
    }

    socket.emit('join-room', {
      roomCode: roomCode.toUpperCase(),
      playerName: playerName.trim()
    });
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
        {SOCKET_URL && (
          <div className="server-info" style={{ 
            fontSize: '12px', 
            color: '#666', 
            marginBottom: '20px',
            fontFamily: 'monospace'
          }}>
            Server: {SOCKET_URL}
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

      {gameState === 'room' || gameState === 'playing' && (
        <>
          <GameRoom
            socket={socket}
            roomData={roomData}
            setRoomData={setRoomData}
            playerName={playerName}
            setGameState={setGameState}
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
