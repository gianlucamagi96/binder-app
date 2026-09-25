import { NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; binderId: string }> },
) {
  const { id, binderId } = await params;
  const { status, data } = await authFetchJson(
    `/wishlists/${id}/bulk-from-binder/${binderId}`,
    { method: "POST" },
  );
  return NextResponse.json(data, { status });
}
