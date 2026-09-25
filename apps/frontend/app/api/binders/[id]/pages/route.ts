import { NextRequest, NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { status, data } = await authFetchJson(`/binders/${id}/pages`, {
    method: "POST",
  });
  return NextResponse.json(data, { status });
}
