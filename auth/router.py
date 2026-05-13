from fastapi import APIRouter, Depends, Header, HTTPException, status

from supabase_client import supabase_admin, supabase_anon, user_client

from .schemas import LoginRequest, PasswordResetRequest, RefreshRequest, SignupRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_payload(session) -> dict:
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "token_type": session.token_type,
        "expires_in": session.expires_in,
        "expires_at": session.expires_at,
    }


def _user_payload(user) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "created_at": str(user.created_at) if user.created_at else None,
    }


def _map_auth_error(exc: Exception) -> HTTPException:
    msg = str(exc).lower()
    if "already registered" in msg or "already exists" in msg:
        return HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    if "invalid login" in msg or "invalid credentials" in msg:
        return HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    if "rate" in msg and "limit" in msg:
        return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "rate limited")
    if "password" in msg or "email" in msg:
        return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, "auth error")


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def _resolve_user(token: str):
    try:
        result = supabase_anon.auth.get_user(token)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
    if not result or not result.user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
    return result.user


def get_current_user(authorization: str | None = Header(default=None)):
    return _resolve_user(_bearer_token(authorization))


def get_authed_context(authorization: str | None = Header(default=None)):
    token = _bearer_token(authorization)
    user = _resolve_user(token)
    return user, user_client(token)


@router.post("/signup")
def signup(body: SignupRequest):
    try:
        result = supabase_anon.auth.sign_up(
            {"email": body.email, "password": body.password}
        )
    except Exception as e:
        raise _map_auth_error(e)
    if not result.session:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "signup failed")
    return {
        "user": _user_payload(result.user),
        "session": _session_payload(result.session),
    }


@router.post("/login")
def login(body: LoginRequest):
    try:
        result = supabase_anon.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as e:
        raise _map_auth_error(e)
    return {
        "user": _user_payload(result.user),
        "session": _session_payload(result.session),
    }


@router.post("/refresh")
def refresh(body: RefreshRequest):
    try:
        result = supabase_anon.auth.refresh_session(body.refresh_token)
    except Exception as e:
        raise _map_auth_error(e)
    return {
        "user": _user_payload(result.user),
        "session": _session_payload(result.session),
    }


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        supabase_admin.auth.admin.sign_out(token)
    except Exception as e:
        raise _map_auth_error(e)
    return {"ok": True}


@router.post("/password/reset")
def password_reset(body: PasswordResetRequest):
    try:
        supabase_anon.auth.reset_password_for_email(body.email)
    except Exception as e:
        raise _map_auth_error(e)
    return {"ok": True}


@router.get("/me")
def me(user=Depends(get_current_user)):
    return {"user": _user_payload(user)}
