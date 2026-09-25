import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  API_URL,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
} from "@/lib/auth";

async function fetchMe(accessToken: string) {
  return fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  if (accessToken) {
    const res = await fetchMe(accessToken);
    if (res.ok) {
      const user = await res.json();
      return NextResponse.json({ user });
    }
  }

  // Access token assente o scaduto: prova un refresh silenzioso.
  if (!refreshToken) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!refreshRes.ok) {
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    cookieStore.delete(REFRESH_TOKEN_COOKIE);
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const { accessToken: newAccessToken } = await refreshRes.json();
  cookieStore.set(ACCESS_TOKEN_COOKIE, newAccessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  const meRes = await fetchMe(newAccessToken);
  if (!meRes.ok) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await meRes.json();
  return NextResponse.json({ user });
}
