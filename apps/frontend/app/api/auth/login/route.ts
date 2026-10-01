import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/auth";
import { setSessionCookies } from "@/lib/server-auth-fetch";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const backendRes = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await backendRes.json();

  if (!backendRes.ok) {
    return NextResponse.json(data, { status: backendRes.status });
  }

  setSessionCookies(await cookies(), data);

  return NextResponse.json({ user: data.user });
}
