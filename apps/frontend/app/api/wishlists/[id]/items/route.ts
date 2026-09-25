import { NextRequest, NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { status, data } = await authFetchJson(`/wishlists/${id}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(data, { status });
}
