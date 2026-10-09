import { NextResponse } from "next/server";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function POST(request: Request) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({ detail: "Authentication service unavailable." }));
  if (!response.ok) return NextResponse.json(body, { status: response.status });

  const result = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  result.cookies.set("optionflow_access", body.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 900 });
  result.cookies.set("optionflow_refresh", body.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return result;
}
