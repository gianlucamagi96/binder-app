import { NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const { status, data } = await authFetchJson(
    `/wishlists/${id}/items/${itemId}`,
    { method: "DELETE" },
  );
  return NextResponse.json(data, { status });
}
