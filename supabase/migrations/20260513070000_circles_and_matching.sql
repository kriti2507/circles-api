-- Circles, membership, and the matching queue.

create table public.circles (
    id         uuid primary key default gen_random_uuid(),
    status     text not null default 'active' check (status in ('active','dissolved')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger circles_set_updated_at
    before update on public.circles
    for each row execute function public.set_updated_at();

create table public.circle_members (
    circle_id uuid not null references public.circles(id)        on delete cascade,
    user_id   uuid not null references public.profiles(user_id)  on delete cascade,
    joined_at timestamptz not null default now(),
    left_at   timestamptz,
    primary key (circle_id, user_id)
);

-- One active circle per user (V1: multiple circles per user is out of scope).
create unique index circle_members_one_active_per_user
    on public.circle_members (user_id)
    where left_at is null;

create index circle_members_circle_idx on public.circle_members (circle_id);

-- Matching queue: one row per user, lifecycle tracked by status.
create table public.match_requests (
    user_id      uuid primary key references public.profiles(user_id) on delete cascade,
    status       text not null check (status in ('pending','matched','cancelled')),
    circle_id    uuid references public.circles(id) on delete set null,
    requested_at timestamptz not null default now(),
    resolved_at  timestamptz
);

create index match_requests_pending_idx on public.match_requests (status) where status = 'pending';

-- RLS
alter table public.circles        enable row level security;
alter table public.circle_members enable row level security;
alter table public.match_requests enable row level security;

-- Membership check used by the SELECT policies below. Marked security definer
-- so it bypasses RLS during the lookup — otherwise referencing circle_members
-- from its own policy causes "infinite recursion detected in policy".
create or replace function public.is_circle_member(p_circle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.circle_members
        where circle_id = p_circle_id
          and user_id   = p_user_id
          and left_at is null
    );
$$;

grant execute on function public.is_circle_member(uuid, uuid) to authenticated;

-- circles + circle_members: readable only to members. Writes happen via the
-- backend's service-role client (which bypasses RLS) inside try_match().
create policy "circles readable by members"
    on public.circles for select
    to authenticated
    using (public.is_circle_member(circles.id, auth.uid()));

create policy "circle_members readable by co-members"
    on public.circle_members for select
    to authenticated
    using (public.is_circle_member(circle_members.circle_id, auth.uid()));

-- match_requests: each user only sees and edits their own row.
create policy "match_requests select own"
    on public.match_requests for select
    to authenticated
    using (auth.uid() = user_id);

create policy "match_requests insert own"
    on public.match_requests for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "match_requests update own"
    on public.match_requests for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "match_requests delete own"
    on public.match_requests for delete
    to authenticated
    using (auth.uid() = user_id);

-- Matching RPC.
-- Picks up to 4 pending users within p_radius_m of the seed, ranked by shared
-- interest count then queue age, and forms a circle of 4-5 with the seed.
-- Returns the new circle id, or null if fewer than 3 candidates are available.
-- A xact-scoped advisory lock serializes matching attempts so two concurrent
-- calls can't claim the same candidate.
create or replace function public.try_match(p_seed uuid, p_radius_m int)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_circle_id  uuid;
    v_member_ids uuid[];
    v_seed_loc   extensions.geography;
begin
    perform pg_advisory_xact_lock(hashtext('circles_matching')::bigint);

    select p.location
      into v_seed_loc
      from public.match_requests mr
      join public.profiles p on p.user_id = mr.user_id
     where mr.user_id = p_seed
       and mr.status  = 'pending';

    if v_seed_loc is null then
        return null;
    end if;

    with seed_interests as (
        select interest_id from public.profile_interests where user_id = p_seed
    ),
    ranked as (
        select
            mr.user_id,
            mr.requested_at,
            (
                select count(*) from public.profile_interests pi
                where pi.user_id = mr.user_id
                  and pi.interest_id in (select interest_id from seed_interests)
            ) as shared
        from public.match_requests mr
        join public.profiles p on p.user_id = mr.user_id
        where mr.status = 'pending'
          and mr.user_id <> p_seed
          and p.location is not null
          and extensions.ST_DWithin(p.location, v_seed_loc, p_radius_m)
        order by shared desc, mr.requested_at asc
        limit 4
    )
    select array_agg(user_id) into v_member_ids from ranked;

    if coalesce(array_length(v_member_ids, 1), 0) < 3 then
        return null;
    end if;

    insert into public.circles default values returning id into v_circle_id;

    insert into public.circle_members (circle_id, user_id)
    select v_circle_id, uid from unnest(array[p_seed] || v_member_ids) as uid;

    update public.match_requests
       set status      = 'matched',
           circle_id   = v_circle_id,
           resolved_at = now()
     where user_id = any(array[p_seed] || v_member_ids);

    return v_circle_id;
end;
$$;

-- Backend-only: invoked via the service-role client from circles-api. Revoke the
-- default public execute grant so authenticated clients can't run it directly
-- (which would otherwise let them match arbitrary users by passing any p_seed).
revoke execute on function public.try_match(uuid, int) from public;
