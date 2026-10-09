import { NextRequest } from "next/server";
import { proxyExpiredRequest } from "../../../../../../lib/fyers-expired-proxy";

export async function GET(request: NextRequest) {
  return proxyExpiredRequest(request, "history");
}
