import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function GET() {
  const access = (await cookies()).get("optionflow_access")?.value;
  if (!access) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  try {
    const response = await fetch(`${apiUrl}/admin/fyers/login`, {
      headers: { Authorization: ["Bearer", access].join(" ") },
      redirect: "manual",
      cache: "no-store",
    });
    const location = response.headers.get("location");
    if (location) return NextResponse.redirect(location, response.status);
    return NextResponse.json(await response.json().catch(() => ({ detail: "Unable to start the market-account connection." })), { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Unable to reach the authentication service." }, { status: 502 });
  }
}
