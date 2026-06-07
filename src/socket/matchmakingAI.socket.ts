import { Server, Socket } from "socket.io";
import redis from "../config/redis";
import { checkIsWin } from "../utils/gameLogic";

export function playgamewithAI(io: Server) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    console.log(`AI socket connected: ${socket.id}`);

    socket.on("move", async ({ index, board }) => {
      await redis.set(`board:${user.id}`, JSON.stringify(board));

      if (checkIsWin(board, index, "X")) {
        return io.to(socket.id).emit("AImove", {
          index,
          symbol: "X",
          isWin: true,
          winnerId: user.id,
          nextTurn: null,
        });
      }

      const aiMoveIndex = pickRandomMove(board);
      if (aiMoveIndex === null) {
        return io.to(socket.id).emit("AImove", {
          index,
          symbol: "X",
          isWin: false,
          isDraw: true,
          nextTurn: null,
        });
      }

      board[aiMoveIndex] = "O";
      await redis.set(`board:${user.id}`, JSON.stringify(board));

      const aiWin = checkIsWin(board, aiMoveIndex, "O");
      io.to(socket.id).emit("AImove", {
        index: aiMoveIndex,
        symbol: "O",
        isWin: aiWin,
        winnerId: aiWin ? "AI" : null,
        nextTurn: aiWin ? null : "X",
      });
    });
  });
}

function pickRandomMove(board: (string | null)[]) {
  const emptyIndexes = board
    .map((cell, index) => (cell === null ? index : null))
    .filter((index): index is number => index !== null);

  if (emptyIndexes.length === 0) return null;

  return emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
}

export function handleTimeout() {}
