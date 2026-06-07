import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, User } from "../generated/prisma/client";
import { AuthProvider } from "../enums/auth-provider.enum";
import UserModel from "../models/user.model";
import dotenv from "dotenv";

dotenv.config(); // đảm bảo biến môi trường được load từ .env

const imagedefault = "/chibi/1.png";
console.log(imagedefault);
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  avatar?: string;
  provider?: AuthProvider;
}
export const registerUser = async ({
  name,
  email,
  password,
  avatar = imagedefault,
  provider = AuthProvider.EMAIL,
}: RegisterInput): Promise<User> => {
  // Kiểm tra xem email đã tồn tại chưa
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error("EMAIL_EXISTS");
  }

  let hashedPassword: string | null = null;

  if (provider === AuthProvider.EMAIL) {
    if (!password) {
      throw new Error("MISSING_PASSWORD");
    }
    hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  }

  // Tạo user mới
  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      avatar,
      provider,
    },
  });

  await createDefaultRank(newUser.id);

  return newUser;
};

interface OAuthUserInput {
  email: string;
  name: string;
  avatar?: string;
  provider: AuthProvider; // GOOGLE hoặc GITHUB
}

export const findOrCreateGoogleUser = async ({
  email,
  name,
  avatar,
  provider,
}: OAuthUserInput): Promise<User> => {
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name,
        email,
        password: null,
        avatar,
        provider: AuthProvider.GOOGLE,
      },
    });
    await createDefaultRank(user.id);
  }

  return user;
};

export const getUserProfile = async (userId: number): Promise<User | null> => {
  return prisma.user.findUnique({ where: { id: userId } });
};

async function createDefaultRank(userId: number) {
  await prisma.$executeRaw`
    INSERT INTO "Rank" ("userId")
    VALUES (${userId})
    ON CONFLICT ("userId") DO NOTHING
  `;
}

export const updateUserAvatar = async (
  userId: number,
  data: { avatar?: string; name?: string }
): Promise<User> => {
  return prisma.user.update({
    where: { id: userId },
    data,
  });
};

export default {
  registerUser,
  findOrCreateGoogleUser,
  getUserProfile,
  updateUserAvatar,
};
