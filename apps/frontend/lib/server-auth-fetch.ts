import { cookies } from "next/headers";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  API_URL,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
} from "@/lib/auth";

// Helper per i Route Handler che devono chiamare endpoint del backend
// protetti da JWT. Legge l'access token dal cookie httpOnly, e se è
// scaduto/assente tenta un refresh silenzioso una sola volta prima di
// arrendersi (stesso pattern già usato in /api/auth/me e
// /api/user/active-tcg, qui centralizzato per i nuovi endpoint binder).
export async function authFetchJson(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: unknown }> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return { status: 401, data: { message: "Non autenticato" } };
  }

  const doFetch = (token: string) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });

  if (accessToken) {
    const res = await doFetch(accessToken);
    if (res.status !== 401) {
      return { status: res.status, data: await res.json().catch(() => null) };
    }
  }

  if (!refreshToken) {
    return { status: 401, data: { message: "Sessione scaduta" } };
  }

  const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!refreshRes.ok) {
    return { status: 401, data: { message: "Sessione scaduta" } };
  }

  const { accessToken: newAccessToken } = await refreshRes.json();
  cookieStore.set(ACCESS_TOKEN_COOKIE, newAccessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  const retryRes = await doFetch(newAccessToken);
  return { status: retryRes.status, data: await retryRes.json().catch(() => null) };
}
