import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  API_URL,
  REFRESH_TOKEN_COOKIE,
  cookieOptions,
} from "@/lib/auth";

async function patchActiveTcg(accessToken: string, code: string) {
  return fetch(`${API_URL}/users/me/active-tcg`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ code }),
  });
}

export async function PATCH(request: NextRequest) {
  const { code } = await request.json();
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ message: "Non autenticato" }, { status: 401 });
  }

  if (accessToken) {
    const res = await patchActiveTcg(accessToken, code);
    if (res.status !== 401) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
  }

  // Access token assente o scaduto: prova un refresh silenzioso prima di rinunciare.
  if (!refreshToken) {
    return NextResponse.json({ message: "Non autenticato" }, { status: 401 });
  }

  const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!refreshRes.ok) {
    return NextResponse.json({ message: "Sessione scaduta" }, { status: 401 });
  }

  const { accessToken: newAccessToken } = await refreshRes.json();
  cookieStore.set(ACCESS_TOKEN_COOKIE, newAccessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  const retryRes = await patchActiveTcg(newAccessToken, code);
  const data = await retryRes.json();
  return NextResponse.json(data, { status: retryRes.status });
}
