import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { refreshSession } from "@/lib/server-auth-fetch";

export async function POST() {
  const accessToken = await refreshSession(await cookies());
  if (!accessToken) {
    return NextResponse.json({ message: "Sessione scaduta" }, { status: 401 });
  }
  return NextResponse.json({ success: true });
}
