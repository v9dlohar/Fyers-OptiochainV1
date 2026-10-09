import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function DELETE() {
  const access = (await cookies()).get("optionflow_access")?.value;
  if (!access) return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  try {
    const response = await fetch(`${apiUrl}/admin/fyers/disconnect`, {
      method: "DELETE",
      headers: { Authorization: ["Bearer", access].join(" ") },
      cache: "no-store",
    });
    if (response.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(await response.json().catch(() => ({ detail: "Unable to disconnect the market account." })), { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Unable to reach the authentication service." }, { status: 502 });
  }
}
