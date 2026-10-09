import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  const access = (await cookies()).get("optionflow_access")?.value;
  if (!access) {
    return NextResponse.json(
      { detail: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const response = await fetch(
      `${apiUrl}/admin/fyers/expired/chain-history${request.nextUrl.search}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: await request.text(),
        cache: "no-store",
      },
    );
    const body = await response.json().catch(() => ({
      detail: "Unable to load expired option-chain data.",
    }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the market-data service." },
      { status: 502 },
    );
  }
}
