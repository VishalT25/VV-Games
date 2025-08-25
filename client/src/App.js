import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import Notification from './components/Notification';
import './styles/App.css';

const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-app-name.vercel.app' 
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

  const addNotification = (message, type = 'info', duration = 4000) => {
    const id = Date.now();
    const notification = { id, message, type, duration };
    setNotifications(prev => [...prev, notification]);
    
    // Auto-remove after duration
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    setIsConnecting(true);

    // Add connection timeout
    const connectionTimeout = setTimeout(() => {
      if (!newSocket.connected) {
        setIsConnecting(false);
        addNotification('Connection timeout. Please refresh the page.', 'error');
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
      console.error('❌ Connection error:', error);
      clearTimeout(connectionTimeout);
      setIsConnected(false);
      setIsConnecting(false);
      addNotification('Failed to connect to server. Please check your connection.', 'error');
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
  }, []);

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

  if (gameState === 'lobby') {
    return (
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
    );
  }

  if (gameState === 'room' || gameState === 'playing') {
    return (
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
    );
  }

  return <div>Loading...</div>;
}

export default App;
