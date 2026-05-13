from pydantic import BaseModel, Field, model_validator


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    bio:  str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=120)
    lat:  float | None = Field(default=None, ge=-90,  le=90)
    lng:  float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def _coords_paired(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat and lng must be provided together")
        return self


class LanguagesUpdate(BaseModel):
    codes: list[str] = Field(min_length=1, max_length=10)


class InterestsUpdate(BaseModel):
    ids: list[int] = Field(min_length=3, max_length=10)
