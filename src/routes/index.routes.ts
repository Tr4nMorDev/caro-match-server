import express, { Request, Response } from "express";
import { getCurrentUser, registerUser, updateAvatar } from "../controllers/user.controller";
import { verifyGoogleToken } from "../middlewares/oauth.middleware";
import authController from "../controllers/auth.controller";
import { verifyJwtToken } from "../middlewares/auth.middleware";
import { verifyUnified } from "../middlewares/verifyUnified";
import matchmakingController from "../controllers/matchmaking.controller";
import matchAIController from "../controllers/matchAI.controller";
import { rateLimitMiddleware } from "../middlewares/rateLimit.middleware";
import { metrics } from "../metrics";

import redis from "../config/redis";
import { match } from "node:assert";

const router = express.Router();

router.get("/", (req: Request, res: Response) => {
  res.send("Welcome to Caro Game API!");
});

router.get("/favicon.ico", (req: Request, res: Response) => {
  res.status(204).end();
});

router.get("/redis-test", async (req, res) => {
  await redis.set("x", "hi");
  const val = await redis.get("x");
  res.json({ val });
});

router.post("/auth/signup", registerUser);
router.post("/auth/google", verifyGoogleToken, authController.googleLogin);
router.post("/auth/login", authController.login);
router.post("/auth/logout", verifyJwtToken, authController.logout);
router.get("/api/user/me", verifyUnified, getCurrentUser);
router.patch("/api/user/avatar", verifyUnified, updateAvatar);

router.put(
  "/api/matchmaking/start",
  verifyUnified,
  matchmakingController.startmatching
);
router.put(
  "/api/matchmaking/cancel",
  verifyUnified,
  matchmakingController.cancelmatching
);
router.put("/api/match/exit", verifyUnified, matchmakingController.exitmatch);
router.get("/metrics", async (req: Request, res: Response) => {
  res.set("Content-Type", "text/plain");
  res.send(await metrics.metrics());
});

router.patch("/api/play-with-ai",verifyUnified,matchAIController.matchAI);
router.put("/api/play-with-ai/move" , verifyUnified  )
router.patch("/api/play-with-ai/exit" , verifyUnified , matchAIController.outmatchAI)
export default router;
