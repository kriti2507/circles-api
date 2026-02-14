-- Circles V1.1.1 - Event-driven matching with backfill
-- Adds schema support for immediate matching on queue join
-- and backfilling users into existing under-capacity circles.

-- 1. Track compatibility score when circle was formed
ALTER TABLE circles ADD COLUMN match_score NUMERIC(5,2) DEFAULT 0;

-- 2. Pessimistic lock for concurrent event-driven matching
ALTER TABLE matching_queue ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 3. Partial index for efficient active membership queries
CREATE INDEX idx_circle_memberships_active
    ON circle_memberships(circle_id)
    WHERE status = 'active';

-- 4. View: circles eligible for backfill (active with < 4 members)
CREATE OR REPLACE VIEW backfill_eligible_circles AS
SELECT
    c.id AS circle_id,
    c.name,
    c.match_score,
    c.created_at,
    COUNT(cm.id)::int AS active_member_count,
    (4 - COUNT(cm.id))::int AS slots_available
FROM circles c
JOIN circle_memberships cm ON cm.circle_id = c.id AND cm.status = 'active'
WHERE c.status = 'active'
GROUP BY c.id
HAVING COUNT(cm.id) < 4 AND COUNT(cm.id) >= 1;

-- 5. Trigger: enforce max 4 active members per circle
CREATE OR REPLACE FUNCTION check_circle_capacity()
RETURNS TRIGGER AS $$
DECLARE
    member_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO member_count
    FROM circle_memberships
    WHERE circle_id = NEW.circle_id AND status = 'active';

    IF member_count > 4 THEN
        RAISE EXCEPTION 'Circle capacity exceeded: circle % already has 4 active members', NEW.circle_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_circle_capacity
    AFTER INSERT ON circle_memberships
    FOR EACH ROW
    WHEN (NEW.status = 'active')
    EXECUTE FUNCTION check_circle_capacity();
