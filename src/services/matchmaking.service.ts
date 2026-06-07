import redis from "../config/redis";
import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient();
const MATCH_QUEUE_KEY = "matchmaking_queue";
const MATCHMAKING_LOCK_KEY = "matchmaking:lock";
const MATCHMAKING_LOCK_TTL_MS = 15_000;
const MATCHMAKING_LOCK_RETRIES = 400;
const MATCHMAKING_LOCK_RETRY_DELAY_MS = 25;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireMatchmakingLock(): Promise<string> {
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;

  for (let attempt = 0; attempt < MATCHMAKING_LOCK_RETRIES; attempt += 1) {
    const locked = await redis.set(MATCHMAKING_LOCK_KEY, token, {
      NX: true,
      PX: MATCHMAKING_LOCK_TTL_MS,
    });

    if (locked === "OK") {
      return token;
    }

    await sleep(MATCHMAKING_LOCK_RETRY_DELAY_MS);
  }

  throw new Error("MATCHMAKING_LOCK_TIMEOUT");
}

async function releaseMatchmakingLock(token: string) {
  await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    {
      keys: [MATCHMAKING_LOCK_KEY],
      arguments: [token],
    }
  );
}

export async function withMatchmakingLock<T>(
  handler: () => Promise<T>
): Promise<T> {
  const token = await acquireMatchmakingLock();

  try {
    return await handler();
  } finally {
    await releaseMatchmakingLock(token);
  }
}

export async function tryFindOpponent(userId: number): Promise<number | null> {
  return findAvailableOpponent(userId);
}

export async function findAvailableOpponent(
  userId: number
): Promise<number | null> {
  const queue = await redis.lRange(MATCH_QUEUE_KEY, 0, -1);
  const staleUserIds = new Set<number>();

  for (const queuedUserId of queue) {
    const opponentId = Number(queuedUserId);

    if (!Number.isInteger(opponentId) || opponentId === userId) {
      staleUserIds.add(opponentId);
      continue;
    }

    const [opponentSocketId, opponentMatchId] = await Promise.all([
      redis.get(`socket:${opponentId}`),
      redis.get(`user:${opponentId}:matchId`),
    ]);

    if (!opponentSocketId || opponentMatchId) {
      staleUserIds.add(opponentId);
      continue;
    }

    return opponentId;
  }

  for (const staleUserId of staleUserIds) {
    if (Number.isInteger(staleUserId)) {
      await removeUserFromQueue(staleUserId);
    }
  }

  return null;
}

export async function createMatch(player1Id: number, player2Id: number) {
  const match = await prisma.match.create({
    data: {
      player1Id,
      player2Id,
      status: "matched",
      matchedAt: new Date(),
    },
  });

  const isPlayer1X = Math.random() < 0.5;

  const xPlayerId = isPlayer1X ? player1Id : player2Id;
  const oPlayerId = isPlayer1X ? player2Id : player1Id;
  const [xPlayer, oPlayer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: xPlayerId },
      select: { id: true, name: true, avatar: true },
    }),
    prisma.user.findUnique({
      where: { id: oPlayerId },
      select: { id: true, name: true, avatar: true },
    }),
  ]);
  const boardSize = 20;
  const emptyBoard = Array(boardSize * boardSize).fill(null);

  const game = await prisma.game.create({
    data: {
      matchId: match.id,
      xPlayerId,
      oPlayerId,
      boardState: emptyBoard,
    },
  });

  return {
    id: match.id,
    player1Id,
    player2Id,
    status: match.status,
    playerXId: xPlayerId,
    playerOId: oPlayerId,
    players: {
      X: xPlayer,
      O: oPlayer,
    },
    gameId: game.id,
  };
}

export async function enqueueUser(userId: number) {
  await removeUserFromQueue(userId);
  await redis.rPush(MATCH_QUEUE_KEY, userId.toString());
}

export async function isStillWaiting(userId: number): Promise<boolean> {
  const queue = await redis.lRange(MATCH_QUEUE_KEY, 0, -1);
  return queue.includes(userId.toString());
}

export async function removeUserFromQueue(userId: number) {
  await redis.lRem(MATCH_QUEUE_KEY, 0, userId.toString());
}
