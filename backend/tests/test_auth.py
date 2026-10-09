from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import Base, get_db
from app.main import app
from app.models import User

test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


def override_db() -> Generator[Session, None, None]:
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def database(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    get_settings.cache_clear()
    Base.metadata.create_all(test_engine)
    app.dependency_overrides[get_db] = override_db
    yield
    app.dependency_overrides.clear()
    Base.metadata.drop_all(test_engine)
    get_settings.cache_clear()


def test_register_login_me_refresh_and_logout() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/auth/register",
            json={
                "email": "Trader@example.com",
                "mobile_number": "+91 98765 43210",
                "password": "strong-password",
            },
        )
        assert response.status_code == 201
        assert response.json()["email"] == "trader@example.com"
        assert response.json()["license_active"] is False

        tokens = client.post(
            "/auth/login",
            json={"email": "trader@example.com", "password": "strong-password"},
        ).json()
        assert (
            client.get(
                "/auth/me",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            ).status_code
            == 200
        )

        rotated = client.post(
            "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert rotated.status_code == 200
        assert (
            client.post(
                "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/auth/logout",
                json={"refresh_token": rotated.json()["refresh_token"]},
            ).status_code
            == 204
        )
        assert (
            client.get(
                "/auth/me",
                headers={"Authorization": "Bearer " + tokens["access_token"]},
            ).status_code
            == 401
        )


def test_new_login_invalidates_previous_device_session() -> None:
    with TestClient(app) as client:
        credentials = {
            "email": "trader@example.com",
            "mobile_number": "9876543210",
            "password": "strong-password",
        }
        assert client.post("/auth/register", json=credentials).status_code == 201
        first_device = client.post("/auth/login", json=credentials).json()
        second_device = client.post("/auth/login", json=credentials).json()

        first_access = {"Authorization": "Bearer " + first_device["access_token"]}
        second_access = {"Authorization": "Bearer " + second_device["access_token"]}
        assert client.get("/auth/me", headers=first_access).status_code == 401
        assert (
            client.post(
                "/auth/refresh",
                json={"refresh_token": first_device["refresh_token"]},
            ).status_code
            == 401
        )
        assert client.get("/auth/me", headers=second_access).status_code == 200


def test_admin_can_activate_and_revoke_market_license() -> None:
    with TestClient(app) as client:
        client.post(
            "/auth/register",
            json={
                "email": "admin@example.com",
                "mobile_number": "9876543210",
                "password": "strong-password",
            },
        )
        admin_tokens = client.post(
            "/auth/login",
            json={"email": "admin@example.com", "password": "strong-password"},
        ).json()
        admin_auth = {
            "Authorization": f"Bearer {admin_tokens['access_token']}"
        }
        signup = client.post(
            "/auth/register",
            json={
                "email": "trader@example.com",
                "mobile_number": "9876543210",
                "password": "strong-password",
            },
        )
        user_id = signup.json()["id"]
        user_tokens = client.post(
            "/auth/login",
            json={"email": "trader@example.com", "password": "strong-password"},
        ).json()
        user_auth = {"Authorization": f"Bearer {user_tokens['access_token']}"}

        assert (
            client.get("/auth/me", headers=user_auth).json()["license_active"]
            is False
        )
        pending = client.get("/admin/fyers/option-chain/symbols", headers=user_auth)
        assert pending.status_code == 403
        assert "activation is pending" in pending.json()["detail"]

        listed = client.get("/admin/users", headers=admin_auth)
        assert listed.status_code == 200
        assert [user["email"] for user in listed.json()] == ["trader@example.com"]
        activated_at = datetime.now(UTC)
        activated = client.patch(
            f"/admin/users/{user_id}/license",
            headers=admin_auth,
            json={"active": True, "duration_days": 30},
        )
        assert activated.status_code == 200
        license_expires_at = datetime.fromisoformat(
            activated.json()["license_expires_at"]
        )
        if license_expires_at.tzinfo is None:
            license_expires_at = license_expires_at.replace(tzinfo=UTC)
        assert activated_at + timedelta(days=30) <= license_expires_at
        assert license_expires_at <= datetime.now(UTC) + timedelta(days=30)
        assert listed.json()[0]["license_expires_at"] is None
        refreshed_list = client.get("/admin/users", headers=admin_auth)
        assert (
            refreshed_list.json()[0]["license_expires_at"]
            == activated.json()["license_expires_at"]
        )
        assert (
            client.get("/auth/me", headers=user_auth).json()["license_active"] is True
        )
        assert (
            client.get(
                "/admin/fyers/option-chain/symbols", headers=user_auth
            ).status_code
            == 200
        )

        revoked = client.patch(
            f"/admin/users/{user_id}/license",
            headers=admin_auth,
            json={"active": False},
        )
        assert revoked.status_code == 200
        assert (
            client.get(
                "/admin/fyers/option-chain/symbols", headers=user_auth
            ).status_code
            == 403
        )


def test_signup_details_expiring_license_and_admin_password_reset() -> None:
    with TestClient(app) as client:
        admin_credentials = {
            "email": "admin@example.com",
            "password": "strong-password",
            "mobile_number": "+1 (212) 555-0198",
        }
        assert client.post("/auth/register", json=admin_credentials).status_code == 201
        admin_tokens = client.post(
            "/auth/login",
            json={
                "email": admin_credentials["email"],
                "password": admin_credentials["password"],
            },
        ).json()
        admin_auth = {"Authorization": "Bearer " + admin_tokens["access_token"]}

        signup = client.post(
            "/auth/register",
            json={
                "email": "trader@example.com",
                "password": "strong-password",
                "mobile_number": "+91 98765 43210",
            },
        )
        assert signup.status_code == 201
        user_id = signup.json()["id"]
        listed = client.get("/admin/users", headers=admin_auth)
        assert listed.status_code == 200
        assert listed.json()[0]["mobile_number"] == "+919876543210"
        assert "password" not in listed.json()[0]
        user_tokens = client.post(
            "/auth/login",
            json={"email": "trader@example.com", "password": "strong-password"},
        ).json()
        user_auth = {"Authorization": "Bearer " + user_tokens["access_token"]}

        activated = client.patch(
            f"/admin/users/{user_id}/license",
            headers=admin_auth,
            json={"active": True, "duration_days": 2},
        )
        assert activated.status_code == 200
        with TestingSession() as db:
            user = db.get(User, user_id)
            assert user is not None
            user.license_expires_at = datetime.now(UTC) - timedelta(days=1)
            db.commit()
        assert (
            client.get("/auth/me", headers=user_auth).json()["license_active"] is False
        )
        assert (
            client.get(
                "/admin/fyers/option-chain/symbols", headers=user_auth
            ).status_code
            == 403
        )

        reset = client.post(
            f"/admin/users/{user_id}/password-reset", headers=admin_auth
        )
        assert reset.status_code == 200
        temporary_password = reset.json()["temporary_password"]
        assert (
            client.post(
                "/auth/login",
                json={"email": "trader@example.com", "password": "strong-password"},
            ).status_code
            == 401
        )
        assert (
            client.get("/auth/me", headers=user_auth).status_code == 401
        )
        temporary_login = client.post(
            "/auth/login",
            json={"email": "trader@example.com", "password": temporary_password},
        )
        assert temporary_login.status_code == 200
        temporary_auth = {
            "Authorization": "Bearer " + temporary_login.json()["access_token"]
        }
        assert (
            client.get("/auth/me", headers=temporary_auth).json()[
                "must_change_password"
            ]
        )
        assert client.post(
            "/auth/change-password",
            headers=temporary_auth,
            json={
                "new_password": "updated-strong-password",
            },
        ).json()["must_change_password"] is False

        ordinary_password_change = client.post(
            "/auth/change-password",
            headers=temporary_auth,
            json={"new_password": "another-strong-password"},
        )
        assert ordinary_password_change.status_code == 400
        assert (
            ordinary_password_change.json()["detail"]
            == "Current password is incorrect."
        )
        assert client.post(
            "/auth/login",
            json={"email": "trader@example.com", "password": "updated-strong-password"},
        ).status_code == 200


def test_non_admin_cannot_manage_licenses() -> None:
    with TestClient(app) as client:
        client.post(
            "/auth/register",
            json={
                "email": "trader@example.com",
                "mobile_number": "9876543210",
                "password": "strong-password",
            },
        )
        tokens = client.post(
            "/auth/login",
            json={"email": "trader@example.com", "password": "strong-password"},
        ).json()
        response = client.get(
            "/admin/users",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        assert response.status_code == 403


def test_admin_can_delete_user_but_not_self() -> None:
    with TestClient(app) as client:
        client.post(
            "/auth/register",
            json={
                "email": "admin@example.com",
                "mobile_number": "9876543210",
                "password": "strong-password",
            },
        )
        admin_tokens = client.post(
            "/auth/login",
            json={"email": "admin@example.com", "password": "strong-password"},
        ).json()
        admin_auth = {
            "Authorization": f"Bearer {admin_tokens['access_token']}"
        }
        signup = client.post(
            "/auth/register",
            json={
                "email": "trader@example.com",
                "mobile_number": "9876543210",
                "password": "strong-password",
            },
        )

        removed = client.delete(
            f"/admin/users/{signup.json()['id']}", headers=admin_auth
        )
        assert removed.status_code == 204
        assert (
            client.post(
                "/auth/login",
                json={"email": "trader@example.com", "password": "strong-password"},
            ).status_code
            == 401
        )
        assert client.delete("/admin/users/1", headers=admin_auth).status_code == 404


def test_duplicate_registration_and_bad_login() -> None:
    with TestClient(app) as client:
        payload = {
            "email": "user@example.com",
            "mobile_number": "9876543210",
            "password": "strong-password",
        }
        assert client.post("/auth/register", json=payload).status_code == 201
        assert client.post("/auth/register", json=payload).status_code == 409
        assert (
            client.post(
                "/auth/login",
                json={"email": payload["email"], "password": "wrong-password"},
            ).status_code
            == 401
        )
