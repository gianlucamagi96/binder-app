import { NextRequest, NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function GET() {
  const { status, data } = await authFetchJson("/binders");
  return NextResponse.json(data, { status });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { status, data } = await authFetchJson("/binders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(data, { status });
}
