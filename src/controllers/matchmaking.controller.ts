import { RequestHandler } from "express";
import { Server } from "socket.io";
import redis from "../config/redis";
import { finishGameByMatchId } from "../services/game-finish.service";
import { removeUserFromQueue } from "../services/matchmaking.service";
import { AuthenticatedRequest } from "../types/express";

export const startmatching: RequestHandler = async (req, res) => {
  return res.status(200).json({
    message: "Waiting for opponent...",
    next: "Connect to WebSocket to receive match updates",
  });
};

export const cancelmatching: RequestHandler = async (req, res) => {
  const { id } = (req as AuthenticatedRequest).user;
  await removeUserFromQueue(id);
  await redis.del(`socket:${id}`);

  return res.status(200).json({
    message: "Cancel matching",
  });
};

export const exitmatch: RequestHandler = async (req, res) => {
  const { id } = (req as AuthenticatedRequest).user;
  const matchId = await redis.get(`user:${id}:matchId`);

  await removeUserFromQueue(id);
  await redis.del(`socket:${id}`);

  if (!matchId) {
    return res.status(200).json({
      message: "Exit match",
      cleaned: ["queue", "socket"],
    });
  }

  const matchStateStr = await redis.get(`match:${matchId}:state`);
  if (!matchStateStr) {
    await finishGameByMatchId({
      matchId: Number(matchId),
    });
    await redis.del(`user:${id}:matchId`);
    return res.status(200).json({
      message: "Exit match",
      matchId,
      cleaned: ["userMatch"],
    });
  }

  const matchState = JSON.parse(matchStateStr);
  const opponentId =
    id === matchState.playerXId ? matchState.playerOId : matchState.playerXId;
  const opponentSocketId = await redis.get(`socket:${opponentId}`);
  const io = req.app.locals.io as Server | undefined;

  if (io && opponentSocketId) {
    io.to(opponentSocketId).emit("gameEnd", {
      winnerId: opponentId,
      isDraw: false,
      reason: "opponent_exit",
    });
  }

  await finishGameByMatchId({
    matchId: Number(matchId),
    winnerId: opponentId,
    boardState: matchState.board,
  });

  await redis.del(`match:${matchId}:state`);
  await redis.del(`user:${id}:matchId`);
  await redis.del(`user:${opponentId}:matchId`);

  return res.status(200).json({
    message: "Exit match",
    matchId,
    opponentId,
    cleaned: ["matchState", "userMatch", "opponentMatch", "socket"],
  });
};

export default { startmatching, cancelmatching, exitmatch };
