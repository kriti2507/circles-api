from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from auth import get_authed_context

from .schemas import InterestsUpdate, LanguagesUpdate, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


def _ewkt(lat: float, lng: float) -> str:
    return f"SRID=4326;POINT({lng} {lat})"


def _serialize_profile(row: dict, languages: list[str], interests: list[int]) -> dict:
    return {
        "user_id":              row["user_id"],
        "name":                 row.get("name"),
        "bio":                  row.get("bio"),
        "city":                 row.get("city"),
        "has_location":         row.get("location") is not None,
        "onboarding_completed": row.get("onboarding_completed_at") is not None,
        "created_at":           row.get("created_at"),
        "updated_at":           row.get("updated_at"),
        "language_codes":       languages,
        "interest_ids":         interests,
    }


def _load_profile(client, user_id: str) -> dict:
    res = (
        client.table("profiles")
        .select("user_id,name,bio,city,location,onboarding_completed_at,created_at,updated_at")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    return res.data


def _load_language_codes(client, user_id: str) -> list[str]:
    res = (
        client.table("profile_languages")
        .select("language_code")
        .eq("user_id", user_id)
        .execute()
    )
    return [row["language_code"] for row in (res.data or [])]


def _load_interest_ids(client, user_id: str) -> list[int]:
    res = (
        client.table("profile_interests")
        .select("interest_id")
        .eq("user_id", user_id)
        .execute()
    )
    return [row["interest_id"] for row in (res.data or [])]


@router.get("/me")
def get_me(ctx=Depends(get_authed_context)):
    user, client = ctx
    profile   = _load_profile(client, user.id)
    languages = _load_language_codes(client, user.id)
    interests = _load_interest_ids(client, user.id)
    return _serialize_profile(profile, languages, interests)


@router.patch("/me")
def patch_me(body: ProfileUpdate, ctx=Depends(get_authed_context)):
    user, client = ctx

    patch: dict = body.model_dump(exclude_unset=True)
    lat = patch.pop("lat", None)
    lng = patch.pop("lng", None)
    if "lat" in body.model_fields_set or "lng" in body.model_fields_set:
        patch["location"] = _ewkt(lat, lng) if lat is not None else None

    if not patch:
        return get_me(ctx)

    res = client.table("profiles").update(patch).eq("user_id", user.id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")

    languages = _load_language_codes(client, user.id)
    interests = _load_interest_ids(client, user.id)
    return _serialize_profile(res.data[0], languages, interests)


@router.put("/me/languages")
def put_languages(body: LanguagesUpdate, ctx=Depends(get_authed_context)):
    user, client = ctx
    codes = list(dict.fromkeys(body.codes))

    client.table("profile_languages").delete().eq("user_id", user.id).execute()
    if codes:
        client.table("profile_languages").insert(
            [{"user_id": user.id, "language_code": c} for c in codes]
        ).execute()

    profile   = _load_profile(client, user.id)
    interests = _load_interest_ids(client, user.id)
    return _serialize_profile(profile, codes, interests)


@router.put("/me/interests")
def put_interests(body: InterestsUpdate, ctx=Depends(get_authed_context)):
    user, client = ctx
    ids = list(dict.fromkeys(body.ids))
    if not (3 <= len(ids) <= 10):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "pick 3-10 distinct interests")

    client.table("profile_interests").delete().eq("user_id", user.id).execute()
    client.table("profile_interests").insert(
        [{"user_id": user.id, "interest_id": i} for i in ids]
    ).execute()

    profile   = _load_profile(client, user.id)
    languages = _load_language_codes(client, user.id)
    return _serialize_profile(profile, languages, ids)


@router.post("/me/complete")
def complete(ctx=Depends(get_authed_context)):
    user, client = ctx
    profile   = _load_profile(client, user.id)
    languages = _load_language_codes(client, user.id)
    interests = _load_interest_ids(client, user.id)

    missing = []
    if not profile.get("name"):     missing.append("name")
    if not profile.get("bio"):      missing.append("bio")
    if not profile.get("city"):     missing.append("city")
    if not profile.get("location"): missing.append("location")
    if not languages:               missing.append("languages")
    if not (3 <= len(interests) <= 10):
        missing.append("interests")
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {"error": "onboarding incomplete", "missing": missing},
        )

    now = datetime.now(timezone.utc).isoformat()
    res = (
        client.table("profiles")
        .update({"onboarding_completed_at": now})
        .eq("user_id", user.id)
        .execute()
    )
    return _serialize_profile(res.data[0], languages, interests)
