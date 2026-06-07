// src/socket/matchmaking.socket.ts
import { Server, Socket } from "socket.io";
import {
  tryFindOpponent,
  createMatch,
  isStillWaiting,
  removeUserFromQueue,
  enqueueUser,
} from "../services/matchmaking.service";
import { checkGameResultFromBoard } from "../services/game.service";
import redis from "../config/redis";
import { scheduleTimeout } from "../utils/gameLogic";

export function listAllConnectedSockets(io: Server) {
  const socketsMap = io.sockets.sockets; // Map<socketId, Socket>

  console.log(`🔌 Tổng số socket đang kết nối: ${socketsMap.size}`);
  socketsMap.forEach((socket, socketId) => {
    const userId = socket.data.user?.id ?? "unknown";
    console.log(`📡 Socket ID: ${socketId} - User ID: ${userId}`);
  });
}
// Hàm chính
export function matchmakingSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    console.log(`🔌 New connection: ${socket.id}`);
    listAllConnectedSockets(io);
    socket.on("waiting", async () => {
      const userId = user.id;
      // userSocketMap.set(userId, socket);
      await redis.set(`socket:${userId}`, socket.id);
      await enqueueUser(userId);

      const opponentId = await tryFindOpponent(userId);

      if (opponentId) {
        const match = await createMatch(userId, opponentId);
        const opponentSocketId = await redis.get(`socket:${opponentId}`);

        const initialBoard = Array(400).fill(null);
        const matchState = {
          board: initialBoard,
          turn: "X",
          playerXId: match.playerXId,
          playerOId: match.playerOId,
          turnDeadline: Date.now() + 30_000,
        };

        await redis.set(`match:${match.id}:state`, JSON.stringify(matchState));
        await redis.set(`user:${userId}:matchId`, match.id.toString());
        await redis.set(`user:${opponentId}:matchId`, match.id.toString());

        await removeUserFromQueue(userId);
        await removeUserFromQueue(opponentId);

        socket.emit("matched", {
          ...match,
          youAre: match.playerXId === userId ? "X" : "O",
        });
        if (opponentSocketId) {
          io.to(opponentSocketId).emit("matched", {
            ...match,
            youAre: match.playerXId === opponentId ? "X" : "O",
          });
        }

        // ⏱ Bắt đầu đếm thời gian cho người chơi đầu tiên
        scheduleTimeout(match.id, io);
      } else {
        setTimeout(async () => {
          const stillWaiting = await isStillWaiting(userId);
          if (stillWaiting) {
            await removeUserFromQueue(userId);
            socket.emit("timeout");
          }
        }, 5000);
      }
    });

    socket.on("makeMove", async ({ matchId, index, symbol }) => {
      const userId = socket.data.user.id;
      console.log(`🎮 User ${userId} move in match ${matchId} at index ${index} with ${symbol}`);

      const matchIdStr = await redis.get(`user:${userId}:matchId`);
      if (!matchIdStr) {
        socket.emit("error", "Không tìm thấy matchId của bạn");
        return;
      }

      const matchStateStr = await redis.get(`match:${matchId}:state`);
      if (!matchStateStr) {
        socket.emit("error", "Không tìm thấy trạng thái trận đấu");
        return;
      }

      const matchState = JSON.parse(matchStateStr);
      const { board, turn, playerXId, playerOId, turnDeadline } = matchState;

      if (Date.now() > turnDeadline) {
        socket.emit("error", "Bạn đã hết thời gian đi");
        return;
      }

      const isUserX = userId === playerXId;
      const isUserO = userId === playerOId;
      if ((turn === "X" && !isUserX) || (turn === "O" && !isUserO)) {
        socket.emit("error", "Không đến lượt bạn");
        return;
      }

      try {
        const result = await checkGameResultFromBoard(
          board,
          index,
          symbol,
          userId,
          playerXId,
          playerOId
        );

        const { isWin, isDraw, nextTurn, winnerId } = result;

        matchState.board[index] = symbol;

        const opponentId = isUserX ? playerOId : playerXId;
        const opponentSocketId = await redis.get(`socket:${opponentId}`);

        const payload = { index, symbol, nextTurn, isWin, winnerId };

        socket.emit("moveMade", payload);
        if (opponentSocketId) {
          io.to(opponentSocketId).emit("moveMade", payload);
        }

        if (isWin || isDraw) {
          const gameEndPayload = {
            winnerId,
            isDraw,
            reason: isDraw ? "draw" : "win",
          };

          socket.emit("gameEnd", gameEndPayload);
          if (opponentSocketId) {
            io.to(opponentSocketId).emit("gameEnd", gameEndPayload);
          }

          await redis.del(`match:${matchId}:state`);
          await redis.del(`user:${userId}:matchId`);
          await redis.del(`user:${opponentId}:matchId`);
        } else {
          matchState.turn = nextTurn;
          matchState.turnDeadline = Date.now() + 30_000;
          await redis.set(`match:${matchId}:state`, JSON.stringify(matchState));

          // ⏱ Đặt lại timeout cho người chơi tiếp theo
          scheduleTimeout(matchId, io);
        }
      } catch (err: any) {
        console.error("❌ Lỗi:", err.message);
        socket.emit("error", err.message);
      }
    });

    socket.on("timeout", async (userId) => {
      console.log(`❌ timeout: ${socket.id}`);
          const matchId = await redis.get(`user:${userId}:matchId`);
          if (!matchId) {
            // await handleMatchedUserDisconnect(userId, Number(matchId), io);
            await redis.del(`socket:${userId}`);
          }
    });

    socket.on("disconnect", async () => {
      const userId = user?.id;
      if (!userId) return;

      const socketId = await redis.get(`socket:${userId}`);
      if (socketId === socket.id) {
        await redis.del(`socket:${userId}`);
      }
      await removeUserFromQueue(userId);
    });
  });
}
