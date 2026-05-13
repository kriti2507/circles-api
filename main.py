from fastapi import FastAPI, HTTPException

from auth import router as auth_router
from profile import router as profile_router
from reference import router as reference_router
from supabase_client import supabase_anon

app = FastAPI(title="circles-api")
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(reference_router)


@app.get("/")
def root():
    return {"service": "circles-api", "status": "ok"}


@app.get("/health/db")
def health_db():
    try:
        supabase_anon.auth.get_session()
        return {"db": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"supabase unreachable: {e}")
