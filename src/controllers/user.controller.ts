import { Request, Response } from "express";
import userService from "../services/user.service";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { registeredUsers } from "../metrics"; // import metric
import { AuthProvider } from "../enums/auth-provider.enum";
import { AuthenticatedRequest } from "../types/express";
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const allowedAvatarPaths = new Set(
  Array.from({ length: 5 }, (_, index) => `/chibi/${index + 1}.png`)
);

const toPublicUser = (user: {
  id: number;
  email: string;
  name: string;
  avatar: string | null;
  provider: string;
}) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatar: user.avatar,
  provider: user.provider,
});

interface RegisterRequestBody {
  name: string;
  email: string;
  password: string;
}

export const registerUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { name, email, password } = req.body as RegisterRequestBody;
  console.log(name , email , password)
  const provider = AuthProvider.EMAIL;

  if (!name || !email || !password) {
    res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ message: "Email không hợp lệ" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ message: "Mật khẩu quá yếu (>= 6 ký tự)" });
    return;
  }

  try {
    const user = await userService.registerUser({
      name,
      email,
      password,
      provider,
    });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1d",
    });

    // ✅ Tăng metric mỗi khi có user mới
    // registeredUsers.inc();

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        provider: user.provider,
      },
    });
  } catch (err: any) {
    if (err.message === "EMAIL_EXISTS") {
      res.status(409).json({ message: "Email đã tồn tại" });
      return;
    }

    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
};

export const updateAvatar = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = (req as AuthenticatedRequest).user;
  const { avatar, name } = req.body as { avatar?: string; name?: string };
  const data: { avatar?: string; name?: string } = {};

  if (avatar !== undefined && !allowedAvatarPaths.has(avatar)) {
    res.status(400).json({ message: "Avatar khong hop le" });
    return;
  }

  if (name !== undefined) {
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 32) {
      res.status(400).json({ message: "Ten phai tu 2 den 32 ky tu" });
      return;
    }
    data.name = trimmedName;
  }

  if (avatar !== undefined) {
    data.avatar = avatar;
  }

  if (!data.avatar && !data.name) {
    res.status(400).json({ message: "Khong co thong tin can cap nhat" });
    return;
  }

  try {
    const user = await userService.updateUserAvatar(id, data);
    res.status(200).json({ user: toPublicUser(user) });
  } catch (err: any) {
    res.status(500).json({ message: "Loi server", error: err.message });
  }
};

export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = (req as AuthenticatedRequest).user;

  try {
    const user = await userService.getUserProfile(Number(id));
    if (!user) {
      res.status(404).json({ message: "User khong ton tai" });
      return;
    }

    res.status(200).json({ user: toPublicUser(user) });
  } catch (err: any) {
    res.status(500).json({ message: "Loi server", error: err.message });
  }
};

export default registerUser;
