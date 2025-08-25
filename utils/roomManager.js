const { v4: uuidv4 } = require('uuid');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  generateRoomCode() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }

  createRoom(code, gameType) {
    const room = {
      id: uuidv4(),
      code,
      gameType,
      players: [],
      gameState: 'waiting', // waiting, playing, finished
      gameInstance: null,
      createdAt: new Date()
    };
    
    this.rooms.set(code, room);
    return room;
  }

  getRoomByCode(code) {
    return this.rooms.get(code);
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }

  // Clean up old rooms (run periodically)
  cleanupOldRooms() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [code, room] of this.rooms.entries()) {
      if (room.createdAt < oneHourAgo && room.players.length === 0) {
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = RoomManager;
