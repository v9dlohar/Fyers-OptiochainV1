import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function proxyExpiredRequest(
  request: NextRequest,
  endpoint: "expiry-dates" | "contracts" | "history",
) {
  const access = (await cookies()).get("optionflow_access")?.value;
  if (!access) {
    return NextResponse.json(
      { detail: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const response = await fetch(
      `${apiUrl}/admin/fyers/expired/${endpoint}${request.nextUrl.search}`,
      {
        headers: { Authorization: `Bearer ${access}` },
        cache: "no-store",
      },
    );
    const body = await response.json().catch(() => ({
      detail: "Unable to load expired market data.",
    }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the market-data service." },
      { status: 502 },
    );
  }
}
