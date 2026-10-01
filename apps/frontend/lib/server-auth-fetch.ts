import { cookies } from "next/headers";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  API_URL,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  cookieOptions,
} from "@/lib/auth";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export function setSessionCookies(
  cookieStore: CookieStore,
  tokens: { accessToken: string; refreshToken?: string },
) {
  cookieStore.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  if (tokens.refreshToken) {
    cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }
}

export function clearSessionCookies(cookieStore: CookieStore) {
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

// Rinnova la sessione con il refresh token del cookie. Il backend ruota il
// refresh token a ogni uso: quello nuovo va salvato, altrimenti al giro dopo
// il vecchio verrebbe rifiutato. Se il rinnovo fallisce, i cookie vengono
// cancellati. Restituisce il nuovo access token, oppure null.
export async function refreshSession(cookieStore: CookieStore): Promise<string | null> {
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return null;

  const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);

  if (!refreshRes) return null;
  if (!refreshRes.ok) {
    if (refreshRes.status === 401) clearSessionCookies(cookieStore);
    return null;
  }

  const tokens: { accessToken: string; refreshToken?: string } = await refreshRes.json();
  setSessionCookies(cookieStore, tokens);
  return tokens.accessToken;
}

// Helper per i Route Handler che devono chiamare endpoint del backend
// protetti da JWT. Legge l'access token dal cookie httpOnly, e se è
// scaduto/assente tenta un refresh silenzioso una sola volta prima di
// arrendersi.
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  const doFetch = (token: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });

  if (accessToken) {
    const res = await doFetch(accessToken);
    if (res.status !== 401) return res;
  }

  const newAccessToken = await refreshSession(cookieStore);
  return newAccessToken ? doFetch(newAccessToken) : null;
}

export async function authFetchJson(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: unknown }> {
  const res = await authFetch(path, init);
  if (!res) {
    return { status: 401, data: { message: "Sessione scaduta" } };
  }
  return { status: res.status, data: await res.json().catch(() => null) };
}
