// src/config/corsOptions.ts
import { CorsOptions } from "cors";

const corsOptions: CorsOptions = {
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://portfolio-murex-omega-46.vercel.app",
    "https://synthelytix.com",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS" , "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export default corsOptions;