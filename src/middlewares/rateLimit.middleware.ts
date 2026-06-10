import { Request, Response, NextFunction } from "express";
import redis from "../config/redis";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_REQUESTS = 5;
const SIGNUP_WINDOW_SECONDS = 10 * 60;
const MAX_SIGNUP_REQUESTS = 10;
const MAX_GUEST_SIGNUP_REQUESTS = 3;

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0];
  }

  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket.remoteAddress || "unknown";
};

const limitByKey = async (
  key: string,
  maxRequests: number,
  windowSeconds: number
) => {
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  const ttl = await redis.ttl(key);

  return {
    allowed: count <= maxRequests,
    count,
    ttl: ttl > 0 ? ttl : windowSeconds,
  };
};

export const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ip = getClientIp(req);
    const key = `rate_limit:general:${ip}`;
    const result = await limitByKey(
      key,
      MAX_REQUESTS,
      RATE_LIMIT_WINDOW_SECONDS
    );

    if (result.allowed) {
      return next();
    }

    res.status(429).json({
      message: "Too many requests",
      retryAfter: result.ttl,
    });
  } catch (error) {
    console.error("Rate limit middleware error:", error);
    next();
  }
};

export const signupRateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ip = getClientIp(req);
    const email = String(req.body?.email || "").toLowerCase();
    const isGuestSignup = email.endsWith("@console.local");
    const maxRequests = isGuestSignup
      ? MAX_GUEST_SIGNUP_REQUESTS
      : MAX_SIGNUP_REQUESTS;
    const key = `rate_limit:signup:${isGuestSignup ? "guest" : "user"}:${ip}`;
    const result = await limitByKey(key, maxRequests, SIGNUP_WINDOW_SECONDS);

    if (result.allowed) {
      return next();
    }

    res.status(429).json({
      message: isGuestSignup
        ? "Too many guest accounts created from this IP"
        : "Too many signup requests from this IP",
      retryAfter: result.ttl,
    });
  } catch (error) {
    console.error("Signup rate limit middleware error:", error);
    next();
  }
};
