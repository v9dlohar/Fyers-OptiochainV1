"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import admin_router as admin_users_router
from app.auth import router as auth_router
from app.config import get_settings
from app.fyers import router as fyers_router

settings = get_settings()
app = FastAPI(title=settings.app_name)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(admin_users_router, prefix=settings.api_prefix)
app.include_router(fyers_router, prefix=settings.api_prefix)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Return a lightweight service health response."""

    return {"status": "ok", "environment": settings.environment}
