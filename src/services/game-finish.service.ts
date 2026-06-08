import { PrismaClient } from "../generated/prisma/client";

const prisma = new PrismaClient();

type FinishGameOptions = {
  matchId: number;
  winnerId?: number | null;
  boardState?: ("X" | "O" | null)[];
};

export async function finishGameByMatchId({
  matchId,
  winnerId = null,
  boardState,
}: FinishGameOptions) {
  const data: {
    finishedAt: Date;
    winnerId?: number | null;
    boardState?: ("X" | "O" | null)[];
  } = {
    finishedAt: new Date(),
    winnerId,
  };

  if (boardState) {
    data.boardState = boardState;
  }

  return prisma.game.updateMany({
    where: {
      matchId,
      finishedAt: null,
    },
    data,
  });
}
