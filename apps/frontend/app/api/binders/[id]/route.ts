import { NextRequest, NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const page = request.nextUrl.searchParams.get("page");
  const query = page ? `?page=${encodeURIComponent(page)}` : "";
  const { status, data } = await authFetchJson(`/binders/${id}${query}`);
  return NextResponse.json(data, { status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { status, data } = await authFetchJson(`/binders/${id}`, {
    method: "DELETE",
  });
  return NextResponse.json(data, { status });
}
