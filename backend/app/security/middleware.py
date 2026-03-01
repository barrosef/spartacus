from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.logging.context import request_ctx
from app.security.context import AuthContext, auth_ctx
from app.security.decorator import is_public
from app.security.firebase import verify_id_token

_BEARER_PREFIX = "Bearer "


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if is_public(request):
            return await call_next(request)

        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith(_BEARER_PREFIX):
            return JSONResponse(
                status_code=401, content={"detail": "Token ausente ou inválido"}
            )

        token = authorization.removeprefix(_BEARER_PREFIX)
        try:
            claims = verify_id_token(token)
        except Exception:
            return JSONResponse(
                status_code=401, content={"detail": "Token inválido ou expirado"}
            )

        ctx = AuthContext(
            user_id=claims["uid"],
            user_email=claims.get("email", ""),
            roles=claims.get("roles", []),
        )
        auth_ctx.set(ctx)

        # Propagate user_id to logging context (ADR-10, section 2)
        log_ctx = request_ctx.get()
        if log_ctx:
            request_ctx.set({**log_ctx, "user_id": ctx.user_id})

        return await call_next(request)
