import { Server, Socket } from "socket.io";
import {
  createMatch,
  findAvailableOpponent,
  isStillWaiting,
  removeUserFromQueue,
  enqueueUser,
  withMatchmakingLock,
} from "../services/matchmaking.service";
import { checkGameResultFromBoard } from "../services/game.service";
import redis from "../config/redis";
import { scheduleTimeout } from "../utils/gameLogic";

export function listAllConnectedSockets(io: Server) {
  const socketsMap = io.sockets.sockets;

  console.log(`Connected sockets: ${socketsMap.size}`);
  socketsMap.forEach((socket, socketId) => {
    const userId = socket.data.user?.id ?? "unknown";
    console.log(`Socket ID: ${socketId} - User ID: ${userId}`);
  });
}

export function matchmakingSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    console.log(`New connection: ${socket.id}`);
    listAllConnectedSockets(io);

    socket.on("waiting", async () => {
      const userId = user.id;

      try {
        await redis.set(`socket:${userId}`, socket.id);

        const result = await withMatchmakingLock(async () => {
          const currentMatchId = await redis.get(`user:${userId}:matchId`);
          if (currentMatchId) {
            await removeUserFromQueue(userId);
            return { type: "already_matched" as const };
          }

          await removeUserFromQueue(userId);

          const opponentId = await findAvailableOpponent(userId);
          if (!opponentId) {
            await enqueueUser(userId);
            return { type: "waiting" as const };
          }

          await removeUserFromQueue(userId);
          await removeUserFromQueue(opponentId);

          const match = await createMatch(userId, opponentId);
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

          return { type: "matched" as const, match, opponentId };
        });

        if (result.type === "matched") {
          const { match, opponentId } = result;
          const opponentSocketId = await redis.get(`socket:${opponentId}`);

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

          scheduleTimeout(match.id, io);
          return;
        }

        if (result.type === "waiting") {
          setTimeout(async () => {
            const stillWaiting = await isStillWaiting(userId);
            if (stillWaiting) {
              await removeUserFromQueue(userId);
              socket.emit("timeout");
            }
          }, 5000);
        }
      } catch (err: any) {
        console.error("Matchmaking error:", err.message);
        socket.emit("error", "Khong the ghep tran luc nay");
      }
    });

    socket.on("makeMove", async ({ matchId, index, symbol }) => {
      const userId = socket.data.user.id;
      console.log(
        `User ${userId} move in match ${matchId} at index ${index} with ${symbol}`
      );

      const matchIdStr = await redis.get(`user:${userId}:matchId`);
      if (!matchIdStr) {
        socket.emit("error", "Khong tim thay matchId cua ban");
        return;
      }

      if (Number(matchIdStr) !== Number(matchId)) {
        socket.emit("error", "MatchId khong hop le");
        return;
      }

      const matchStateStr = await redis.get(`match:${matchId}:state`);
      if (!matchStateStr) {
        socket.emit("error", "Khong tim thay trang thai tran dau");
        return;
      }

      const matchState = JSON.parse(matchStateStr);
      const { board, turn, playerXId, playerOId, turnDeadline } = matchState;

      if (!Number.isInteger(index) || index < 0 || index >= board.length) {
        socket.emit("error", "Index nuoc di khong hop le");
        return;
      }

      if (symbol !== "X" && symbol !== "O") {
        socket.emit("error", "Ky hieu quan co khong hop le");
        return;
      }

      if (Date.now() > turnDeadline) {
        socket.emit("error", "Ban da het thoi gian di");
        return;
      }

      const isUserX = userId === playerXId;
      const isUserO = userId === playerOId;
      const expectedSymbol = isUserX ? "X" : isUserO ? "O" : null;

      if (!expectedSymbol || symbol !== expectedSymbol) {
        socket.emit("error", "Ky hieu quan co khong dung voi nguoi choi");
        return;
      }

      if ((turn === "X" && !isUserX) || (turn === "O" && !isUserO)) {
        socket.emit("error", "Khong den luot ban");
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

          scheduleTimeout(matchId, io);
        }
      } catch (err: any) {
        console.error("Move error:", err.message);
        socket.emit("error", err.message);
      }
    });

    socket.on("timeout", async (userId) => {
      console.log(`timeout: ${socket.id}`);
      const matchId = await redis.get(`user:${userId}:matchId`);
      if (!matchId) {
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
