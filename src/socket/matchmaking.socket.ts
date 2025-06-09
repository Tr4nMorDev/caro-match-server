// src/socket/matchmaking.socket.ts
import { Server, Socket } from "socket.io";
import {
  handleMatchmaking,
  tryFindOpponent,
  createMatch,
  isStillWaiting,
  removeUserFromQueue,
  enqueueUser,
} from "../services/matchmaking.service";
import { ClientToServerEvents, SeverToClientEvents } from "../types/express";
import { MatchData } from "../types/express";
import redis from "../lib/redis";

const userSocketMap = new Map<
  number,
  Socket<SeverToClientEvents, ClientToServerEvents>
>(); // userId -> socket

// socket.emit("event", data) Gửi đến client hiện tại vào hàm
// socket.emit(..) Gửi sự kiện đến server
// socket.on() Nghe dữ liệu từ client
// io.emit("event" , data) Gửi đến tất cả các client đang kết nốis
// io.to(id).emit() Gưi riêng dữ liệu đến clientclient
export function matchmakingSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("waiting", async (userId: number) => {
      userSocketMap.set(userId, socket);
      await redis.set(`socket:${userId}`, socket.id); // Setup giá trị đầu cho người chơi ( đặt làm chuỗi cho trận đấu là id người đầu)
      await enqueueUser(userId); // Đưa user vào hàng đợi chính thức
      const opponentId = await tryFindOpponent(userId);
      if (opponentId) {
        const match = await createMatch(userId, opponentId);
        const opponentSocketId = await redis.get(`socket:${opponentId}`);

        const currentSocketId = socket.id;

        // ✅ XÓA CẢ HAI NGƯỜI KHỎI HÀNG CHỜ
        await removeUserFromQueue(userId);
        await removeUserFromQueue(opponentId);

        // Gửi tới cả hai người
        io.to(currentSocketId).emit("matched", {
          ...match,
          youAre: match.playerXId === userId ? "X" : "O",
        });
        io.to(opponentSocketId).emit("matched", {
          ...match,
          youAre: match.playerXId === opponentId ? "X" : "O",
        });
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
    socket.on("cancel_matching", async () => {});
    socket.on("disconnect", async () => {
      console.log(`🔌 Disconnected: ${socket.id}`);

      // Tìm userId tương ứng
      for (const [userId, s] of userSocketMap.entries()) {
        if (s.id === socket.id) {
          console.log(`🧹 Cleaning up for userId: ${userId}`);

          userSocketMap.delete(userId); // 1. Xóa khỏi memory

          await redis.del(`socket:${userId}`); // 2. Xóa khỏi Redis
          await removeUserFromQueue(userId); // 3. Xóa khỏi hàng chờ Redis
          break;
        }
      }
    });
  });
}
