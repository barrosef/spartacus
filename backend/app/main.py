from fastapi import Depends, FastAPI, Header, HTTPException
from firebase_admin import auth, initialize_app

from app.logging.config import configure_logging
from app.logging.middleware import LoggingMiddleware
from app.routers import internal

configure_logging()

app = FastAPI(title="Spartacus API", version="0.1.0")
app.add_middleware(LoggingMiddleware)
app.include_router(internal.router)

# Firebase Admin SDK — usa Application Default Credentials no Cloud Run.
# Em dev local, usa FIREBASE_AUTH_EMULATOR_HOST se definido.
initialize_app()


async def get_current_user(authorization: str = Header(...)) -> dict:
    """Verifica o Firebase ID Token enviado no header Authorization: Bearer <token>."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    id_token = authorization.removeprefix("Bearer ")
    try:
        return auth.verify_id_token(id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/me")
def me(user: dict = Depends(get_current_user)):
    """Exemplo de endpoint autenticado — retorna dados do usuário logado."""
    return {"uid": user["uid"], "email": user.get("email")}
