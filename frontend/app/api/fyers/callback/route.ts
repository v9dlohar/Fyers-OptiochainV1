import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const backend = process.env.API_URL ?? "http://127.0.0.1:8000";
  const response = await fetch(
    `${backend}/admin/fyers/callback${request.nextUrl.search}`,
    { redirect: "manual" },
  );
  const location = response.headers.get("location");
  if (location) {
    return NextResponse.redirect(location, response.status);
  }
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "text/plain" },
  });
}
