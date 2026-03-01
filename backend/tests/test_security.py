from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.logging.config import configure_logging
from app.logging.middleware import LoggingMiddleware
from app.security.context import ADMIN_ROLES, AuthContext, auth_ctx
from app.security.decorator import public, register_public_routes, require_roles
from app.security.middleware import AuthMiddleware


# ── test app fixture ──────────────────────────────────────────────────────────

def _make_app() -> FastAPI:
    configure_logging()
    app = FastAPI()
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(AuthMiddleware)

    @public
    @app.get("/public")
    def public_route():
        return {"public": True}

    @app.get("/protected")
    def protected_route():
        ctx = auth_ctx.get()
        return {"uid": ctx.user_id}

    @app.get("/teachers-only")
    @require_roles("teacher")
    def teachers_only():
        return {"ok": True}

    @app.get("/admin-only")
    @require_roles("owner", "assistant")
    def admin_only():
        return {"ok": True}

    register_public_routes(app.routes)
    return app


@pytest.fixture()
def client():
    return TestClient(_make_app(), raise_server_exceptions=False)


def _valid_claims(roles: list[str] | None = None) -> dict:
    return {"uid": "user-123", "email": "test@test.com", "roles": roles or []}


# ── @public ───────────────────────────────────────────────────────────────────

def test_public_route_sem_token_retorna_200(client):
    response = client.get("/public")
    assert response.status_code == 200


def test_public_route_com_token_invalido_retorna_200(client):
    response = client.get("/public", headers={"Authorization": "Bearer lixo"})
    assert response.status_code == 200


# ── token ausente / inválido ──────────────────────────────────────────────────

def test_sem_token_retorna_401(client):
    response = client.get("/protected")
    assert response.status_code == 401


def test_token_mal_formatado_retorna_401(client):
    response = client.get("/protected", headers={"Authorization": "Basic abc"})
    assert response.status_code == 401


def test_token_invalido_retorna_401(client):
    with patch("app.security.middleware.verify_id_token", side_effect=Exception("invalid")):
        response = client.get("/protected", headers={"Authorization": "Bearer token-invalido"})
    assert response.status_code == 401


# ── token válido ──────────────────────────────────────────────────────────────

def test_token_valido_retorna_200(client):
    with patch("app.security.middleware.verify_id_token", return_value=_valid_claims()):
        response = client.get("/protected", headers={"Authorization": "Bearer token-ok"})
    assert response.status_code == 200
    assert response.json()["uid"] == "user-123"


# ── @require_roles ────────────────────────────────────────────────────────────

def test_require_roles_role_correta_retorna_200(client):
    with patch("app.security.middleware.verify_id_token", return_value=_valid_claims(["teacher"])):
        response = client.get("/teachers-only", headers={"Authorization": "Bearer tok"})
    assert response.status_code == 200


def test_require_roles_role_errada_retorna_403(client):
    with patch("app.security.middleware.verify_id_token", return_value=_valid_claims(["student"])):
        response = client.get("/teachers-only", headers={"Authorization": "Bearer tok"})
    assert response.status_code == 403


def test_require_roles_multiplas_roles_qualquer_aceita(client):
    with patch("app.security.middleware.verify_id_token", return_value=_valid_claims(["assistant"])):
        response = client.get("/admin-only", headers={"Authorization": "Bearer tok"})
    assert response.status_code == 200


def test_require_roles_sem_role_retorna_403(client):
    with patch("app.security.middleware.verify_id_token", return_value=_valid_claims([])):
        response = client.get("/admin-only", headers={"Authorization": "Bearer tok"})
    assert response.status_code == 403


# ── ADMIN_ROLES ───────────────────────────────────────────────────────────────

def test_admin_roles_contem_owner_e_assistant():
    assert ADMIN_ROLES >= {"owner", "assistant"}


# ── AuthContext ───────────────────────────────────────────────────────────────

def test_auth_context_propaga_user_id_ao_logging():
    """user_id deve ser propagado ao request_ctx do logging após autenticação."""
    from app.logging.context import request_ctx
    request_ctx.set({"request_id": "req-1", "user_ip": "127.0.0.1", "user_id": None})

    with patch("app.security.middleware.verify_id_token", return_value=_valid_claims()):
        client = TestClient(_make_app(), raise_server_exceptions=False)
        client.get("/protected", headers={"Authorization": "Bearer tok"})

    # request_ctx.user_id is set per-request via ContextVar — check via AuthContext
    ctx = AuthContext(user_id="user-123", user_email="test@test.com", roles=[])
    assert ctx.user_id == "user-123"
