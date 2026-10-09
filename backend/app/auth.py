"""Authentication helpers and endpoints."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import FyersOAuthState, RefreshToken, User
from app.schemas import (
    Credentials,
    LicenseUpdate,
    LicenseUserResponse,
    PasswordChange,
    PasswordResetResponse,
    RefreshRequest,
    RegistrationCredentials,
    TokenPair,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["authentication"])
password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _access_token(user_id: int, session_id: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "sid": session_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def _issue_refresh_token(db: Session, user: User) -> str:
    settings = get_settings()
    raw = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            token_hash=_token_hash(raw),
            user=user,
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    return raw


def _tokens(db: Session, user: User) -> TokenPair:
    if user.session_id is None:
        raise HTTPException(status_code=401, detail="Authentication session expired")
    refresh = _issue_refresh_token(db, user)
    db.commit()
    return TokenPair(
        access_token=_access_token(user.id, user.session_id),
        refresh_token=refresh,
    )


def _invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _user_from_access_token(token: str, db: Session) -> User:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
        if payload.get("type") != "access" or not payload.get("sub"):
            raise InvalidTokenError
        user_id = int(payload["sub"])
        session_id = payload.get("sid")
        if not isinstance(session_id, str) or not session_id:
            raise InvalidTokenError
    except (InvalidTokenError, ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    user = db.get(User, user_id)
    if user is None or not user.is_active or user.session_id != session_id:
        raise HTTPException(status_code=401, detail="Session is invalid or expired")
    return user


def current_user(
    token: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the HTTP bearer token."""

    if token is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _user_from_access_token(token.credentials, db)


def admin_user(user: User = Depends(current_user)) -> User:
    """Require an active user whose email matches the configured administrator."""

    _require_password_updated(user)
    configured = get_settings().admin_email.strip().lower()
    if not configured or user.email.lower() != configured:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def has_market_access(user: User) -> bool:
    configured_admin = get_settings().admin_email.strip().lower()
    if user.email.lower() == configured_admin:
        return True
    if not user.license_active:
        return False
    if user.license_expires_at is None:
        return True
    expiry = user.license_expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=UTC)
    return expiry > datetime.now(UTC)


def _require_password_updated(user: User) -> None:
    if user.must_change_password:
        raise HTTPException(
            status_code=403,
            detail="Change your temporary password before continuing.",
        )


def password_updated_user(user: User = Depends(current_user)) -> User:
    _require_password_updated(user)
    return user


def market_data_user(user: User = Depends(current_user)) -> User:
    """Require an active license, except for the configured administrator."""

    _require_password_updated(user)
    if not has_market_access(user):
        raise HTTPException(
            status_code=403,
            detail="License activation is pending. Contact the administrator.",
        )
    return user


def _user_response(user: User) -> UserResponse:
    configured_admin = get_settings().admin_email.strip().lower()
    is_admin = bool(configured_admin) and user.email.lower() == configured_admin
    return UserResponse(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        license_active=has_market_access(user),
        must_change_password=user.must_change_password,
        is_admin=is_admin,
        created_at=user.created_at,
    )


@router.post("/register", response_model=UserResponse, status_code=201)
def register(
    credentials: RegistrationCredentials, db: Session = Depends(get_db)
) -> UserResponse:
    email = str(credentials.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email is already registered")
    configured_admin = get_settings().admin_email.strip().lower()
    is_admin = bool(configured_admin) and email == configured_admin
    user = User(
        email=email,
        password_hash=password_hash.hash(credentials.password),
        mobile_number=credentials.mobile_number,
        license_active=is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_response(user)


@router.post("/login", response_model=TokenPair)
def login(credentials: Credentials, db: Session = Depends(get_db)) -> TokenPair:
    user = db.scalar(select(User).where(User.email == str(credentials.email).lower()))
    if user is None or not password_hash.verify(
        credentials.password, user.password_hash
    ):
        raise _invalid_credentials()
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")
    now = datetime.now(UTC)
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    user.session_id = str(uuid4())
    return _tokens(db, user)


@router.post("/refresh", response_model=TokenPair)
def refresh(request: RefreshRequest, db: Session = Depends(get_db)) -> TokenPair:
    stored = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == _token_hash(request.refresh_token)
        )
    )
    now = datetime.now(UTC)
    expires_at = stored.expires_at if stored is not None else now
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if (
        stored is None
        or stored.revoked_at is not None
        or expires_at <= now
        or not stored.user.is_active
        or stored.user.session_id is None
    ):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    stored.revoked_at = now
    return _tokens(db, stored.user)


@router.post("/logout", status_code=204)
def logout(request: RefreshRequest, db: Session = Depends(get_db)) -> None:
    stored = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == _token_hash(request.refresh_token)
        )
    )
    if stored and stored.revoked_at is None:
        stored.revoked_at = datetime.now(UTC)
        stored.user.session_id = None
        db.commit()


@router.post("/change-password", response_model=UserResponse)
def change_password(
    change: PasswordChange,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    if not user.must_change_password and (
        change.current_password is None
        or not password_hash.verify(change.current_password, user.password_hash)
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if password_hash.verify(change.new_password, user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="Choose a new password different from the current password.",
        )
    user.password_hash = password_hash.hash(change.new_password)
    user.must_change_password = False
    db.commit()
    db.refresh(user)
    return _user_response(user)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(current_user)) -> UserResponse:
    return _user_response(user)


admin_router = APIRouter(prefix="/admin/users", tags=["admin users"])


@admin_router.get("", response_model=list[LicenseUserResponse])
def list_users(
    _admin: User = Depends(admin_user), db: Session = Depends(get_db)
) -> list[LicenseUserResponse]:
    admin_email = get_settings().admin_email.strip().lower()
    users = db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc()))
    return [
        LicenseUserResponse(
            id=user.id,
            email=user.email,
            mobile_number=user.mobile_number,
            license_active=has_market_access(user),
            license_expires_at=user.license_expires_at,
            created_at=user.created_at,
        )
        for user in users
        if user.email.lower() != admin_email
    ]


@admin_router.patch("/{user_id}/license", response_model=LicenseUserResponse)
def update_user_license(
    user_id: int,
    update: LicenseUpdate,
    _admin: User = Depends(admin_user),
    db: Session = Depends(get_db),
) -> LicenseUserResponse:
    user = db.get(User, user_id)
    if user is None or user.email.lower() == get_settings().admin_email.strip().lower():
        raise HTTPException(status_code=404, detail="User not found")
    if update.active:
        if update.duration_days is None:
            raise HTTPException(
                status_code=422,
                detail="Specify a license duration in days.",
            )
        user.license_active = True
        user.license_expires_at = datetime.now(UTC) + timedelta(
            days=update.duration_days
        )
    else:
        user.license_active = False
        user.license_expires_at = None
    db.commit()
    db.refresh(user)
    return LicenseUserResponse(
        id=user.id,
        email=user.email,
        mobile_number=user.mobile_number,
        license_active=has_market_access(user),
        license_expires_at=user.license_expires_at,
        created_at=user.created_at,
    )


@admin_router.post(
    "/{user_id}/password-reset", response_model=PasswordResetResponse
)
def reset_user_password(
    user_id: int,
    _admin: User = Depends(admin_user),
    db: Session = Depends(get_db),
) -> PasswordResetResponse:
    user = db.get(User, user_id)
    if user is None or user.email.lower() == get_settings().admin_email.strip().lower():
        raise HTTPException(status_code=404, detail="User not found")
    temporary_password = secrets.token_urlsafe(18)
    user.password_hash = password_hash.hash(temporary_password)
    user.must_change_password = True
    user.session_id = None
    now = datetime.now(UTC)
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    db.commit()
    return PasswordResetResponse(temporary_password=temporary_password)


@admin_router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    _admin: User = Depends(admin_user),
    db: Session = Depends(get_db),
) -> None:
    user = db.get(User, user_id)
    if user is None or user.email.lower() == get_settings().admin_email.strip().lower():
        raise HTTPException(status_code=404, detail="User not found")
    db.execute(
        delete(FyersOAuthState).where(FyersOAuthState.user_id == user.id)
    )
    db.delete(user)
    db.commit()
