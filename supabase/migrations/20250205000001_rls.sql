-- Circles V1.1.0 - Row Level Security policies

-- RLS helper functions (SECURITY DEFINER to break circular policy references)
CREATE OR REPLACE FUNCTION is_activity_participant(p_activity_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM activity_participants
        WHERE activity_id = p_activity_id AND user_id = p_user_id
    );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_hosted_activity_ids(p_user_id UUID)
RETURNS SETOF UUID AS $$
    SELECT id FROM activities WHERE host_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

-- USERS: Users can read any profile, but only update their own
CREATE POLICY "Users can view all profiles" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- CIRCLES: Members can view their circle
CREATE POLICY "Circle members can view circle" ON circles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM circle_memberships
            WHERE circle_memberships.circle_id = circles.id
            AND circle_memberships.user_id = auth.uid()
            AND circle_memberships.status = 'active'
        )
    );

-- CIRCLE MEMBERSHIPS: Members can view fellow members, manage own membership
CREATE POLICY "View circle members" ON circle_memberships
    FOR SELECT USING (
        circle_id IN (
            SELECT circle_id FROM circle_memberships cm
            WHERE cm.user_id = auth.uid() AND cm.status = 'active'
        )
    );

CREATE POLICY "User can leave circle" ON circle_memberships
    FOR UPDATE USING (user_id = auth.uid());

-- MESSAGES: Circle/activity members can view and send messages
CREATE POLICY "View messages" ON messages
    FOR SELECT USING (
        circle_id IN (
            SELECT circle_id FROM circle_memberships
            WHERE user_id = auth.uid() AND status = 'active'
        )
        OR
        (activity_id IS NOT NULL AND is_activity_participant(activity_id, auth.uid()))
    );

CREATE POLICY "Send messages" ON messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND (
            circle_id IN (
                SELECT circle_id FROM circle_memberships
                WHERE user_id = auth.uid() AND status = 'active'
            )
            OR
            (activity_id IS NOT NULL AND is_activity_participant(activity_id, auth.uid()))
        )
    );

-- ACTIVITIES: Anyone can view open activities, participants can view all
-- Uses SECURITY DEFINER helper to avoid infinite recursion with activity_participants policies
CREATE POLICY "View open activities" ON activities
    FOR SELECT USING (
        status = 'open'
        OR host_id = auth.uid()
        OR is_activity_participant(id, auth.uid())
    );

CREATE POLICY "Create activities" ON activities
    FOR INSERT WITH CHECK (host_id = auth.uid());

CREATE POLICY "Host can update activity" ON activities
    FOR UPDATE USING (host_id = auth.uid());

CREATE POLICY "Host can delete activity" ON activities
    FOR DELETE USING (host_id = auth.uid());

-- ACTIVITY PARTICIPANTS: Users can join, hosts can manage
-- Uses SECURITY DEFINER helper to avoid infinite recursion with activities policies
CREATE POLICY "View participants" ON activity_participants
    FOR SELECT USING (
        user_id = auth.uid()
        OR activity_id IN (SELECT get_hosted_activity_ids(auth.uid()))
    );

CREATE POLICY "Request to join" ON activity_participants
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Host can approve/decline" ON activity_participants
    FOR UPDATE USING (
        activity_id IN (SELECT get_hosted_activity_ids(auth.uid()))
        OR user_id = auth.uid()
    );

CREATE POLICY "User can cancel join" ON activity_participants
    FOR DELETE USING (user_id = auth.uid());

-- USER BLOCKS: Only blocker can manage
CREATE POLICY "View own blocks" ON user_blocks
    FOR SELECT USING (blocker_id = auth.uid());

CREATE POLICY "Create block" ON user_blocks
    FOR INSERT WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "Remove block" ON user_blocks
    FOR DELETE USING (blocker_id = auth.uid());

-- REPORTS: Users can create, only view own
CREATE POLICY "Create report" ON reports
    FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "View own reports" ON reports
    FOR SELECT USING (reporter_id = auth.uid());

-- PUSH TOKENS: Users manage own tokens
CREATE POLICY "Manage own push tokens" ON push_tokens
    FOR ALL USING (user_id = auth.uid());

-- USER SETTINGS: Users manage own settings
CREATE POLICY "Manage own settings" ON user_settings
    FOR ALL USING (user_id = auth.uid());

-- MATCHING QUEUE: Users manage own queue entry
CREATE POLICY "Manage own queue entry" ON matching_queue
    FOR ALL USING (user_id = auth.uid());

-- PROMPTS: Anyone can read active prompts
CREATE POLICY "Read active prompts" ON prompts
    FOR SELECT USING (is_active = true);
