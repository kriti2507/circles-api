-- Activity lifecycle improvements
-- 1. Constrain activity & participant status values
-- 2. Cap open activities per user (max 3)
-- 3. Auto-expire past activities

-- =============================================================================
-- 1. STATUS CONSTRAINTS
-- =============================================================================

-- Valid activity statuses: open, full, completed, cancelled, expired
ALTER TABLE activities
    ADD CONSTRAINT activities_status_check
    CHECK (status IN ('open', 'full', 'completed', 'cancelled', 'expired'));

-- Valid participant statuses: pending, approved, declined, cancelled
ALTER TABLE activity_participants
    ADD CONSTRAINT activity_participants_status_check
    CHECK (status IN ('pending', 'approved', 'declined', 'cancelled'));

-- =============================================================================
-- 2. MAX 3 OPEN ACTIVITIES PER USER
-- =============================================================================

CREATE OR REPLACE FUNCTION check_max_open_activities()
RETURNS TRIGGER AS $$
DECLARE
    open_count INTEGER;
BEGIN
    -- Only enforce when the resulting status is 'open'
    IF NEW.status = 'open' THEN
        SELECT COUNT(*) INTO open_count
        FROM activities
        WHERE host_id = NEW.host_id
          AND status = 'open'
          AND id != NEW.id;

        IF open_count >= 3 THEN
            RAISE EXCEPTION 'You can have at most 3 open activities at a time'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_max_open_activities
    BEFORE INSERT OR UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION check_max_open_activities();

-- =============================================================================
-- 3. AUTO-EXPIRE PAST ACTIVITIES
-- =============================================================================

-- Function to bulk-expire activities whose scheduled_at has passed.
-- Call this from an external cron service (GitHub Actions, cron-job.org, etc.)
-- or from pg_cron if on Supabase Pro.
CREATE OR REPLACE FUNCTION expire_past_activities()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE activities
    SET status = 'expired',
        updated_at = NOW()
    WHERE status IN ('open', 'full')
      AND scheduled_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update get_nearby_activities to also exclude activities in the past,
-- so even if the cron hasn't run yet, users won't see stale activities.
CREATE OR REPLACE FUNCTION get_nearby_activities(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS SETOF activities AS $$
    SELECT *
    FROM activities
    WHERE status = 'open'
        AND scheduled_at > NOW()
        AND ST_DWithin(
            location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
    ORDER BY scheduled_at ASC;
$$ LANGUAGE sql STABLE;
