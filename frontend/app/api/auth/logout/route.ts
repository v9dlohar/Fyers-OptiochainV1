import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function POST() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get("optionflow_refresh")?.value;
  if (refresh) {
    await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    }).catch((error: unknown) => {
      console.error("Unable to revoke refresh token during logout.", error);
    });
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete("optionflow_access");
  response.cookies.delete("optionflow_refresh");
  return response;
}
