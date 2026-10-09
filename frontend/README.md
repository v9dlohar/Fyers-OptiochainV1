# Frontend authentication

The Next.js app proxies authentication through its `/api/auth/*` route handlers.
The FastAPI URL is configured with the server-only `API_URL` environment
variable. Login and refresh tokens are
stored in `HttpOnly`, `SameSite=Lax` cookies; they are never exposed to
JavaScript or stored in `localStorage`. The short-lived access cookie is
renewed through the refresh endpoint when `/api/auth/me` receives an expired
token. Logout revokes the refresh token server-side and clears both cookies.

For local development, copy `.env.example` to `.env.local`, run FastAPI on
`http://127.0.0.1:8000`, and run Next.js on `http://localhost:3000`. Cookies are
not marked `Secure` in development so the HTTP setup works; use HTTPS in
production.
