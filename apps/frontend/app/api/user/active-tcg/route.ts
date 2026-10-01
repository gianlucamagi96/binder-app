import { NextRequest, NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function PATCH(request: NextRequest) {
  const { code } = await request.json();
  const { status, data } = await authFetchJson("/users/me/active-tcg", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return NextResponse.json(data, { status });
}
