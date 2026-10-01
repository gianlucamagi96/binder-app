// sid = id della Session: senza sessione valida il token non è accettato.
export type AccessPayload = {
  sub: string;
  email: string;
  sid: string;
};

export type RefreshPayload = {
  sub: string;
  sid: string;
};

export type SafeUser = {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  activeTcgGameCode: string | null;
  createdAt: Date;
};
