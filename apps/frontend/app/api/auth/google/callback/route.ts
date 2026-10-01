import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL, postLoginRedirect, type AuthUser } from "@/lib/auth";
import { setSessionCookies } from "@/lib/server-auth-fetch";

// Il backend rimanda qui con un codice monouso (valido 60 secondi), che viene
// scambiato con i token server-to-server: i token non passano mai nell'URL.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const failed = NextResponse.redirect(new URL("/login?error=google", request.url));

  if (!code) return failed;

  const exchangeRes = await fetch(`${API_URL}/auth/google/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }).catch(() => null);

  if (!exchangeRes?.ok) return failed;

  const tokens: { accessToken: string; refreshToken: string } = await exchangeRes.json();
  setSessionCookies(await cookies(), tokens);

  let redirectPath = "/tcg-picker";
  const meRes = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  }).catch(() => null);

  if (meRes?.ok) {
    const user: AuthUser = await meRes.json();
    redirectPath = postLoginRedirect(user);
  }

  return NextResponse.redirect(new URL(redirectPath, request.url));
}
