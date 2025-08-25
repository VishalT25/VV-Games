const words = [
  // Normal words and their odd counterparts
  { normal: "PIZZA", odd: "BURGER" },
  { normal: "CAT", odd: "ELEPHANT" },
  { normal: "BEACH", odd: "MOUNTAIN" },
  { normal: "COFFEE", odd: "JUICE" },
  { normal: "WINTER", odd: "SUMMER" },
  { normal: "BOOK", odd: "MOVIE" },
  { normal: "CAR", odd: "AIRPLANE" },
  { normal: "DOCTOR", odd: "TEACHER" },
  { normal: "GUITAR", odd: "PIANO" },
  { normal: "APPLE", odd: "STEAK" }
];

class WordGame {
  constructor(room) {
    this.room = room;
    this.playerWords = [];
    this.hints = [];
    this.votes = {};
    this.currentTurn = 0;
    this.gameTimer = null;
    this.oddOneOutId = null;
  }

  startGame() {
    // Select random word pair
    const wordPair = words[Math.floor(Math.random() * words.length)];
    
    // Select random player to be odd one out
    const oddIndex = Math.floor(Math.random() * this.room.players.length);
    this.oddOneOutId = this.room.players[oddIndex].id;

    // Assign words
    this.playerWords = this.room.players.map((player, index) => ({
      playerId: player.id,
      word: index === oddIndex ? wordPair.odd : wordPair.normal,
      isOddOneOut: index === oddIndex
    }));

    return {
      playerWords: this.playerWords,
      timer: 180000 // 3 minutes for hint phase
    };
  }

  giveHint(playerId, hint) {
    const currentPlayer = this.room.players[this.currentTurn];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }

    this.hints.push({
      playerId,
      hint,
      timestamp: new Date()
    });

    this.currentTurn++;
    const nextPlayerId = this.currentTurn < this.room.players.length 
      ? this.room.players[this.currentTurn].id 
      : null;

    return {
      success: true,
      currentTurn: this.currentTurn,
      nextPlayerId,
      phaseComplete: this.currentTurn >= this.room.players.length
    };
  }

  castVote(voterId, votedPlayerId) {
    this.votes[voterId] = votedPlayerId;

    const allVoted = this.room.players.every(player => 
      this.votes.hasOwnProperty(player.id)
    );

    if (allVoted) {
      return this.calculateResults();
    }

    return {
      gameComplete: false,
      votes: this.votes
    };
  }

  calculateResults() {
    // Count votes
    const voteCounts = {};
    Object.values(this.votes).forEach(votedId => {
      voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
    });

    // Find most voted player
    const mostVotedId = Object.keys(voteCounts).reduce((a, b) => 
      voteCounts[a] > voteCounts[b] ? a : b
    );

    const oddOneOut = this.playerWords.find(pw => pw.isOddOneOut);
    const normalWord = this.playerWords.find(pw => !pw.isOddOneOut);

    return {
      gameComplete: true,
      winner: mostVotedId === this.oddOneOutId ? 'majority' : 'odd-one-out',
      oddOneOut: this.oddOneOutId,
      correctWord: normalWord.word,
      oddWord: oddOneOut.word,
      votes: this.votes,
      voteCounts
    };
  }
}

module.exports = WordGame;
