import redis from "../config/redis";
import { Server, Socket } from "socket.io";
import { checkIsWin } from "../utils/gameLogic";
import axios from 'axios';

export function playgamewithAI(io: Server) {
  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    console.log(`🔌 New connection: ${socket.id}`);

    socket.on("move", async ({ index, board }) => {
      console.log("Người chơi đánh:", index);
      await redis.set(`board:${user.id}`, JSON.stringify(board));

      // Kiểm tra nếu người chơi win luôn
      if (checkIsWin(board, index, "X")) {
        return io.to(socket.id).emit("AImove", {
          index,
          symbol: "X",
          isWin: true,
          winnerId: user.id,
        });
      }

      // Tạo prompt từ chỉ số X và O
      const movesX = board.map((cell: string | null, i: number) => cell === 'X' ? i : null).filter(i => i !== null);
      const movesO = board.map((cell: string | null, i: number) => cell === 'O' ? i : null).filter(i => i !== null);

      const prompt = `
You're an AI playing Gomoku (Caro) on a 15x15 board (index 0–224).
Opponent (X) just moved.

Moves so far:
- X: [${movesX.join(', ')}]
- O: [${movesO.join(', ')}]

Rules:
- Win by making 5 in a row.
- Block the opponent if they are about to win.

🧠 Now, as 'O', pick your next move.

👉 ONLY respond with one number (0–224). No explanation.
      `;

      // Gọi AI để lấy nước đi
      const aiMoveIndex = await CallPromtAI(prompt);

      // Cập nhật lên board




      
      board[aiMoveIndex] = "O";

      const aiWin = checkIsWin(board, aiMoveIndex, "O");

      // Trả kết quả về client
      return io.to(socket.id).emit("AImove", {
        index: aiMoveIndex,
        symbol: "O",
        isWin: aiWin,
        winnerId: aiWin ? "AI" : null,
      });
    });
  });
}

export async function CallPromtAI(prompt: string): Promise<number> {
  try {
    const res = await axios.post('http://localhost:11434/api/generate', {
      model: 'mistral',
      prompt,
      stream: false,
    });

    // Lấy số đầu tiên AI trả về
    const match = res.data.response.match(/\d+/);
    if (match) {
      const move = parseInt(match[0]);
      if (move >= 0 && move <= 224) return move;
    }

    throw new Error("❌ Invalid move from AI");
  } catch (err) {
    console.error("AI error:", err);
    // fallback ngẫu nhiên để tránh crash
    return Math.floor(Math.random() * 225);
  }
}

export function handleTimeout() {
  // TODO: implement timeout logic here
}
