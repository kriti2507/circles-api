-- Circles V1.1.0 - Database functions and triggers

-- Helper: check if user is a participant in an activity (bypasses RLS to break recursion)
CREATE OR REPLACE FUNCTION is_activity_participant(p_activity_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM activity_participants
        WHERE activity_id = p_activity_id AND user_id = p_user_id
    );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Helper: get activity IDs hosted by a user (bypasses RLS to break recursion)
CREATE OR REPLACE FUNCTION get_hosted_activity_ids(p_user_id UUID)
RETURNS SETOF UUID AS $$
    SELECT id FROM activities WHERE host_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER circles_updated_at BEFORE UPDATE ON circles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER activities_updated_at BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Create user profile and settings after signup
-- Uses SECURITY DEFINER to bypass RLS since the user row doesn't exist yet
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, phone, display_name)
    VALUES (NEW.id, NEW.phone, '');

    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Enable Supabase Realtime for chat and updates
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE circle_memberships;
ALTER PUBLICATION supabase_realtime ADD TABLE circles;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE activities;
