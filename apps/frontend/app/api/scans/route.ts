import { NextRequest, NextResponse } from "next/server";
import { authFetchJson } from "@/lib/server-auth-fetch";

export async function POST(request: NextRequest) {
  const incoming = await request.formData();
  const photo = incoming.get("photo");
  if (!(photo instanceof Blob)) {
    return NextResponse.json({ message: "Manca la foto" }, { status: 400 });
  }

  const body = new FormData();
  body.append("photo", photo, photo instanceof File ? photo.name : "scan.jpg");
  const { status, data } = await authFetchJson("/scans", {
    method: "POST",
    body,
  });
  return NextResponse.json(data, { status });
}
