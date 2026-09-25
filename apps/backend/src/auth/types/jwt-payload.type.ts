export type JwtPayload = {
  sub: string;
  email: string;
};

export type SafeUser = {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  activeTcgGameCode: string | null;
  createdAt: Date;
};
