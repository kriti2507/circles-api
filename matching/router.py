from fastapi import APIRouter, Depends, HTTPException, status

from auth import get_authed_context
from supabase_client import supabase_admin

router = APIRouter(prefix="/matching", tags=["matching"])

MATCH_RADIUS_METERS = 25_000


def _serialize_request(row: dict | None) -> dict:
    if not row:
        return {"status": "none", "circle_id": None, "requested_at": None, "resolved_at": None}
    return {
        "status":       row["status"],
        "circle_id":    row.get("circle_id"),
        "requested_at": row.get("requested_at"),
        "resolved_at":  row.get("resolved_at"),
    }


@router.post("/request")
def create_request(ctx=Depends(get_authed_context)):
    user, client = ctx

    profile = (
        client.table("profiles")
        .select("onboarding_completed_at,location")
        .eq("user_id", user.id)
        .single()
        .execute()
    )
    if not profile.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    if not profile.data.get("onboarding_completed_at"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "complete onboarding first")
    if not profile.data.get("location"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "set your location first")

    existing_circle = (
        client.table("circle_members")
        .select("circle_id")
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    if existing_circle.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "already in a circle")

    # Refresh the queue row (drop any prior matched/cancelled history) and try
    # to form a circle. Matching itself runs as service-role so it can insert
    # rows for other users; the RPC enforces correctness.
    client.table("match_requests").delete().eq("user_id", user.id).execute()
    client.table("match_requests").insert({"user_id": user.id, "status": "pending"}).execute()

    supabase_admin.rpc(
        "try_match",
        {"p_seed": user.id, "p_radius_m": MATCH_RADIUS_METERS},
    ).execute()

    res = (
        client.table("match_requests")
        .select("status,circle_id,requested_at,resolved_at")
        .eq("user_id", user.id)
        .single()
        .execute()
    )
    return _serialize_request(res.data)


@router.get("/status")
def get_status(ctx=Depends(get_authed_context)):
    user, client = ctx
    res = (
        client.table("match_requests")
        .select("status,circle_id,requested_at,resolved_at")
        .eq("user_id", user.id)
        .limit(1)
        .execute()
    )
    return _serialize_request(res.data[0] if res.data else None)


@router.delete("/request")
def cancel_request(ctx=Depends(get_authed_context)):
    user, client = ctx
    res = (
        client.table("match_requests")
        .update({"status": "cancelled", "resolved_at": "now()"})
        .eq("user_id", user.id)
        .eq("status", "pending")
        .execute()
    )
    return {"cancelled": bool(res.data)}
