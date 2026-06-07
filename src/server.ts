import http from "http";
import { Server } from "socket.io";
import app from "./app";
import dotenv from "dotenv";
import { matchmakingSocket , listAllConnectedSockets} from "./socket/matchmaking.socket";
import pool from "./config/db";
import { connectRedis } from "./config/redis";
import { socketAuthMiddleware } from "./middlewares/socket.middleware";
import { logTotalRedisKeys , listAllRedisKeys } from "./config/redis";
import { playgamewithAI } from "./socket/matchmakingAI.socket";
dotenv.config();

const PORT = process.env.PORT || 3000;
const VITE = process.env.VITE || "http://localhost:5137";

async function startServer() {
  try {
    await pool.query("SELECT 1");
    app.locals.db = pool;
  } catch (err: any) {
    console.log("loi :" , err);
  }
  try {
    connectRedis();
    await logTotalRedisKeys();
    await listAllRedisKeys();
    // Tạo server HTTP từ express app
    const server = http.createServer(app);

    // Tạo socket.io server, gắn vào server HTTP
    const io = new Server(server, {
      cors: {
        origin: `${VITE}`, // frontend URL
        methods: ["GET", "POST"],
      },
    });
    io.use(socketAuthMiddleware);
    app.locals.io = io;
    listAllConnectedSockets(io);// check số lượng socket đang conect 
    // Gắn socket handlers
    matchmakingSocket(io);
    playgamewithAI(io);
    // Lắng nghe
    server.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  } catch (err: any) {
    // console.error("❌ PostgreSQL connection error:", err.message);

    process.exit(1);
  }
}

startServer();
