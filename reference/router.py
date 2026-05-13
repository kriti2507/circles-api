from fastapi import APIRouter, Depends

from auth import get_authed_context

router = APIRouter(prefix="/reference", tags=["reference"])


@router.get("/languages")
def list_languages(ctx=Depends(get_authed_context)):
    _, client = ctx
    res = client.table("languages").select("code,name").order("name").execute()
    return {"languages": res.data or []}


@router.get("/interests")
def list_interests(ctx=Depends(get_authed_context)):
    _, client = ctx
    res = (
        client.table("interests")
        .select("id,slug,name,category")
        .order("category")
        .order("name")
        .execute()
    )
    return {"interests": res.data or []}
