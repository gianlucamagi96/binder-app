import { NextRequest, NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { status, data } = await authFetchJson("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(data, { status });
}
