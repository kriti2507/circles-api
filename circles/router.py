from fastapi import APIRouter, Depends, HTTPException, status

from auth import get_authed_context

router = APIRouter(prefix="/circles", tags=["circles"])


def _serialize_member(profile: dict, languages: list[str], interests: list[int], joined_at: str) -> dict:
    return {
        "user_id":        profile.get("user_id"),
        "name":           profile.get("name"),
        "bio":            profile.get("bio"),
        "city":           profile.get("city"),
        "joined_at":      joined_at,
        "language_codes": languages,
        "interest_ids":   interests,
    }


def _serialize_circle(circle: dict, members: list[dict]) -> dict:
    return {
        "id":         circle["id"],
        "status":     circle["status"],
        "created_at": circle["created_at"],
        "members":    members,
    }


def _load_circle(client, circle_id: str) -> dict:
    res = (
        client.table("circles")
        .select("id,status,created_at,updated_at")
        .eq("id", circle_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "circle not found")
    return res.data


def _load_members(client, circle_id: str) -> list[dict]:
    rows = (
        client.table("circle_members")
        .select("user_id,joined_at")
        .eq("circle_id", circle_id)
        .order("joined_at")
        .execute()
    ).data or []
    if not rows:
        return []

    user_ids = [r["user_id"] for r in rows]
    profiles = (
        client.table("profiles")
        .select("user_id,name,bio,city")
        .in_("user_id", user_ids)
        .execute()
    ).data or []
    profile_by_id = {p["user_id"]: p for p in profiles}

    langs = (
        client.table("profile_languages")
        .select("user_id,language_code")
        .in_("user_id", user_ids)
        .execute()
    ).data or []
    langs_by_user: dict[str, list[str]] = {}
    for r in langs:
        langs_by_user.setdefault(r["user_id"], []).append(r["language_code"])

    ints = (
        client.table("profile_interests")
        .select("user_id,interest_id")
        .in_("user_id", user_ids)
        .execute()
    ).data or []
    ints_by_user: dict[str, list[int]] = {}
    for r in ints:
        ints_by_user.setdefault(r["user_id"], []).append(r["interest_id"])

    return [
        _serialize_member(
            profile_by_id.get(r["user_id"], {"user_id": r["user_id"]}),
            langs_by_user.get(r["user_id"], []),
            ints_by_user.get(r["user_id"], []),
            r["joined_at"],
        )
        for r in rows
    ]


def _find_my_circle_id(client, user_id: str) -> str | None:
    res = (
        client.table("circle_members")
        .select("circle_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0]["circle_id"] if res.data else None


@router.get("/me")
def get_my_circle(ctx=Depends(get_authed_context)):
    user, client = ctx
    circle_id = _find_my_circle_id(client, user.id)
    if not circle_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "you are not in a circle")
    return _serialize_circle(_load_circle(client, circle_id), _load_members(client, circle_id))


@router.get("/{circle_id}")
def get_circle(circle_id: str, ctx=Depends(get_authed_context)):
    _, client = ctx
    # RLS hides circles the caller isn't a member of, so _load_circle 404s for non-members.
    return _serialize_circle(_load_circle(client, circle_id), _load_members(client, circle_id))
