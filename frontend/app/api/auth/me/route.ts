import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

async function getUser(access: string) {
  return fetch(`${apiUrl}/auth/me`, {
    headers: { Authorization: ["Bearer", access].join(" ") },
    cache: "no-store",
  });
}

export async function GET() {
  const cookieStore = await cookies();
  const access = cookieStore.get("optionflow_access")?.value;
  const refresh = cookieStore.get("optionflow_refresh")?.value;
  let response = access ? await getUser(access) : null;
  if (response?.ok) return NextResponse.json(await response.json());
  if (!refresh) {
    const unauthenticated = NextResponse.json(
      { detail: "Authentication required" },
      { status: 401 },
    );
    unauthenticated.cookies.delete("optionflow_access");
    unauthenticated.cookies.delete("optionflow_refresh");
    return unauthenticated;
  }
  const refreshed = await fetch(`${apiUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
    cache: "no-store",
  });
  if (!refreshed.ok) {
    const expired = NextResponse.json({ detail: "Session expired" }, { status: 401 });
    expired.cookies.delete("optionflow_access");
    expired.cookies.delete("optionflow_refresh");
    return expired;
  }
  const tokens = await refreshed.json();
  response = await getUser(tokens.access_token);
  if (!response.ok) {
    const expired = NextResponse.json({ detail: "Session expired" }, { status: 401 });
    expired.cookies.delete("optionflow_access");
    expired.cookies.delete("optionflow_refresh");
    return expired;
  }
  const output = NextResponse.json(await response.json());
  const secure = process.env.NODE_ENV === "production";
  output.cookies.set("optionflow_access", tokens.access_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 900 });
  output.cookies.set("optionflow_refresh", tokens.refresh_token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return output;
}
