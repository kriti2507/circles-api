-- Profiles: one row per auth user.
create table public.profiles (
    user_id                 uuid primary key references auth.users(id) on delete cascade,
    name                    text check (name is null or char_length(name) between 1 and 60),
    bio                     text check (bio  is null or char_length(bio)  <= 160),
    city                    text,
    location                extensions.geography(Point, 4326),
    onboarding_completed_at timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index profiles_location_idx on public.profiles using gist (location);
create index profiles_city_idx     on public.profiles (city);

-- Join: profile <-> language
create table public.profile_languages (
    user_id       uuid not null references public.profiles(user_id) on delete cascade,
    language_code text not null references public.languages(code)   on delete restrict,
    primary key (user_id, language_code)
);

create index profile_languages_language_idx on public.profile_languages (language_code);

-- Join: profile <-> interest
create table public.profile_interests (
    user_id     uuid   not null references public.profiles(user_id) on delete cascade,
    interest_id bigint not null references public.interests(id)     on delete restrict,
    primary key (user_id, interest_id)
);

create index profile_interests_interest_idx on public.profile_interests (interest_id);

-- updated_at bump trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

-- Auto-create stub profile on new auth user.
-- security definer so this runs with elevated rights from the auth schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (user_id) values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles          enable row level security;
alter table public.profile_languages enable row level security;
alter table public.profile_interests enable row level security;

-- profiles: any authenticated user can read (needed so circle members can see each other);
-- only the owner can insert/update their row.
create policy "profiles readable by authenticated"
    on public.profiles for select
    to authenticated
    using (true);

create policy "profiles insert own"
    on public.profiles for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "profiles update own"
    on public.profiles for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- profile_languages: readable to all authenticated, writeable only by owner.
create policy "profile_languages readable by authenticated"
    on public.profile_languages for select
    to authenticated
    using (true);

create policy "profile_languages insert own"
    on public.profile_languages for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "profile_languages delete own"
    on public.profile_languages for delete
    to authenticated
    using (auth.uid() = user_id);

-- profile_interests: same shape.
create policy "profile_interests readable by authenticated"
    on public.profile_interests for select
    to authenticated
    using (true);

create policy "profile_interests insert own"
    on public.profile_interests for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "profile_interests delete own"
    on public.profile_interests for delete
    to authenticated
    using (auth.uid() = user_id);
