export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

export const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minuti, allineato all'access token del backend
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 giorni, allineato al refresh token del backend

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  activeTcgGameCode: string | null;
  createdAt: string;
};

export type TcgGame = {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  status: "ACTIVE" | "COMING_SOON";
  createdAt: string;
};

export function postLoginRedirect(user: AuthUser): string {
  return user.activeTcgGameCode ? "/dashboard" : "/tcg-picker";
}
