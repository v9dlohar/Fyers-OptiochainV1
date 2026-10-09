import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const access = (await cookies()).get("optionflow_access")?.value;
  if (!access) {
    return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
  }
  const { userId } = await context.params;
  if (!/^\d+$/.test(userId)) {
    return NextResponse.json({ detail: "Invalid user id" }, { status: 400 });
  }
  try {
    const response = await fetch(`${apiUrl}/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
    });
    if (response.status === 204) return new NextResponse(null, { status: 204 });
    const body = await response.json().catch(() => ({
      detail: "Unable to delete this user.",
    }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json(
      { detail: "Unable to reach the authentication service." },
      { status: 502 },
    );
  }
}
