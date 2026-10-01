import { NextResponse } from "next/server";
import { authFetch } from "@/lib/server-auth-fetch";

export async function GET() {
  const res = await authFetch("/auth/me");
  if (!res?.ok) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await res.json();
  return NextResponse.json({ user });
}
