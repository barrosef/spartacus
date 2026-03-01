import asyncio
import functools

from fastapi import HTTPException
from starlette.requests import Request

from app.security.context import auth_ctx

# Functions marked with @public — populated at import time.
_PUBLIC_FUNCTIONS: set = set()

# Resolved paths for public routes — populated by register_public_routes().
_PUBLIC_PATHS: set[str] = set()


def public(func):
    """Mark a route handler as exempt from authentication."""
    func.__is_public__ = True
    _PUBLIC_FUNCTIONS.add(func)
    return func


def register_public_routes(routes) -> None:
    """
    Scan app routes and register paths for @public-marked handlers.
    Must be called once after all routes are registered in main.py.
    """
    for route in routes:
        endpoint = getattr(route, "endpoint", None)
        if endpoint is not None and getattr(endpoint, "__is_public__", False):
            path = getattr(route, "path", "")
            if path:
                _PUBLIC_PATHS.add(path)


def is_public(request: Request) -> bool:
    return request.url.path in _PUBLIC_PATHS


def require_roles(*roles: str):
    """
    Decorator that enforces role-based access control on a route handler.
    Reads AuthContext from ContextVar — no parameter needed.
    Returns 403 if the authenticated user does not hold at least one required role.
    """
    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            ctx = auth_ctx.get()
            if ctx is None or not any(r in ctx.roles for r in roles):
                raise HTTPException(status_code=403, detail="Permissão insuficiente")
            return await func(*args, **kwargs)

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            ctx = auth_ctx.get()
            if ctx is None or not any(r in ctx.roles for r in roles):
                raise HTTPException(status_code=403, detail="Permissão insuficiente")
            return func(*args, **kwargs)

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
