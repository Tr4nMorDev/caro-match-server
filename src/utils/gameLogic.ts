import { Server, Socket } from "socket.io";
import redis from "../config/redis";
import { finishGameByMatchId } from "../services/game-finish.service";
export function checkWinner(
  board: ("X" | "O" | null)[],
  index: number,
  symbol: "X" | "O",
  boardSize: number = 20,
  winLength: number = 5
): boolean {
  const directions = [
    { dx: 1, dy: 0 }, // ngang →
    { dx: 0, dy: 1 }, // dọc ↓
    { dx: 1, dy: 1 }, // chéo chính ↘
    { dx: -1, dy: 1 }, // chéo phụ ↙
  ];

  const row = Math.floor(index / boardSize);
  const col = index % boardSize;

  for (const { dx, dy } of directions) {
    let count = 1;

    // Đi về 1 phía
    for (let step = 1; step < winLength; step++) {
      const newRow = row + dy * step;
      const newCol = col + dx * step;

      if (
        newRow < 0 ||
        newRow >= boardSize ||
        newCol < 0 ||
        newCol >= boardSize
      )
        break;

      const newIndex = newRow * boardSize + newCol;
      if (board[newIndex] !== symbol) break;

      count++;
    }

    // Đi về phía ngược lại
    for (let step = 1; step < winLength; step++) {
      const newRow = row - dy * step;
      const newCol = col - dx * step;

      if (
        newRow < 0 ||
        newRow >= boardSize ||
        newCol < 0 ||
        newCol >= boardSize
      )
        break;

      const newIndex = newRow * boardSize + newCol;
      if (board[newIndex] !== symbol) break;

      count++;
    }

    if (count >= winLength) return true; // Đủ 5 ô liên tiếp
  }

  return false;
}

// Hàm xử lý timeout tự động sau 30s không đi
export async function scheduleTimeout(matchId: number, io: Server) {
  setTimeout(async () => {
    const matchStateStr = await redis.get(`match:${matchId}:state`);
    if (!matchStateStr) return;

    const state = JSON.parse(matchStateStr);
    if (Date.now() <= state.turnDeadline) return;

    const loserId = state.turn === "X" ? state.playerXId : state.playerOId;
    const winnerId = state.turn === "X" ? state.playerOId : state.playerXId;

    const loserSocketId = await redis.get(`socket:${loserId}`);
    const winnerSocketId = await redis.get(`socket:${winnerId}`);

    const payload = {
      winnerId,
      isDraw: false,
      reason: "timeout",
    };

    if (loserSocketId) io.to(loserSocketId).emit("gameEnd", payload);
    if (winnerSocketId) io.to(winnerSocketId).emit("gameEnd", payload);

    await finishGameByMatchId({
      matchId,
      winnerId,
      boardState: state.board,
    });

    await redis.del(`match:${matchId}:state`);
    await redis.del(`user:${loserId}:matchId`);
    await redis.del(`user:${winnerId}:matchId`);
  }, 30_000);
}
export function checkIsWin(board: (string | null)[], index: number, symbol: string): boolean {
  const size = 15; // hoặc truyền vào size nếu muốn động
  const directions = [
    [0, 1],       // ngang →
    [1, 0],       // dọc ↓
    [1, 1],       // chéo ↘
    [1, -1]       // chéo ↙
  ];

  const x = Math.floor(index / size);
  const y = index % size;

  for (let [dx, dy] of directions) {
    let count = 1;

    // Đếm về 1 phía
    for (let step = 1; step < 5; step++) {
      const nx = x + dx * step;
      const ny = y + dy * step;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;
      if (board[nx * size + ny] === symbol) {
        count++;
      } else {
        break;
      }
    }

    // Đếm về phía ngược lại
    for (let step = 1; step < 5; step++) {
      const nx = x - dx * step;
      const ny = y - dy * step;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) break;
      if (board[nx * size + ny] === symbol) {
        count++;
      } else {
        break;
      }
    }

    if (count >= 5) return true;
  }

  return false;
}
