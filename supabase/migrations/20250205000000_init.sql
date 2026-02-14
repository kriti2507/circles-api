-- Circles V1.1.0 - Initial schema
-- Extensions, tables, and indexes

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    phone_verified BOOLEAN DEFAULT FALSE,
    display_name VARCHAR(50) NOT NULL,
    bio VARCHAR(160),
    avatar_url VARCHAR(500),

    -- Location (city-level, not precise)
    city VARCHAR(100),
    country_code VARCHAR(3),
    location GEOGRAPHY(POINT, 4326),

    -- Preferences
    languages VARCHAR(10)[] NOT NULL DEFAULT '{}',
    interests TEXT[] NOT NULL DEFAULT '{}',

    -- Status
    status VARCHAR(20) DEFAULT 'active',
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_location ON users USING GIST(location);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_interests ON users USING GIN(interests);

-- Circles table
CREATE TABLE circles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    current_prompt_id UUID,
    prompt_delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Circle memberships
CREATE TABLE circle_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    status VARCHAR(20) DEFAULT 'active',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,

    UNIQUE(circle_id, user_id)
);

CREATE INDEX idx_circle_memberships_user ON circle_memberships(user_id);
CREATE INDEX idx_circle_memberships_circle ON circle_memberships(circle_id);

-- Prompts library
CREATE TABLE prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    text_en TEXT NOT NULL,
    text_ja TEXT,
    text_zh TEXT,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key for circles -> prompts now that prompts table exists
ALTER TABLE circles
    ADD CONSTRAINT fk_circles_current_prompt
    FOREIGN KEY (current_prompt_id) REFERENCES prompts(id);

-- Messages (for both circle and activity chats)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    circle_id UUID REFERENCES circles(id) ON DELETE CASCADE,
    activity_id UUID,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT message_context CHECK (
        (circle_id IS NOT NULL AND activity_id IS NULL) OR
        (circle_id IS NULL AND activity_id IS NOT NULL)
    )
);

CREATE INDEX idx_messages_circle ON messages(circle_id, created_at DESC);
CREATE INDEX idx_messages_activity ON messages(activity_id, created_at DESC);

-- Activities
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    location_name VARCHAR(200),
    location GEOGRAPHY(POINT, 4326),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    max_participants INTEGER DEFAULT 6,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_activities_location ON activities USING GIST(location);
CREATE INDEX idx_activities_scheduled ON activities(scheduled_at);
CREATE INDEX idx_activities_status ON activities(status);

-- Add foreign key for messages -> activities now that activities table exists
ALTER TABLE messages
    ADD CONSTRAINT fk_messages_activity
    FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;

-- Activity participants
CREATE TABLE activity_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,

    UNIQUE(activity_id, user_id)
);

CREATE INDEX idx_activity_participants_user ON activity_participants(user_id);
CREATE INDEX idx_activity_participants_activity ON activity_participants(activity_id);

-- User blocks
CREATE TABLE user_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(blocker_id, blocked_id)
);

-- Reports
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reported_circle_id UUID REFERENCES circles(id) ON DELETE CASCADE,
    reported_activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
    reported_message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL,
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Push notification tokens
CREATE TABLE push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, token)
);

-- User settings
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    language VARCHAR(10) DEFAULT 'en',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    notifications_messages BOOLEAN DEFAULT TRUE,
    notifications_prompts BOOLEAN DEFAULT TRUE,
    notifications_activities BOOLEAN DEFAULT TRUE,
    distance_unit VARCHAR(10) DEFAULT 'km',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Matching queue
CREATE TABLE matching_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_queue_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    priority INTEGER DEFAULT 0,

    UNIQUE(user_id)
);

-- PostGIS function for nearby activities
CREATE OR REPLACE FUNCTION get_nearby_activities(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS SETOF activities AS $$
    SELECT *
    FROM activities
    WHERE status = 'open'
        AND ST_DWithin(
            location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_km * 1000
        )
    ORDER BY scheduled_at ASC;
$$ LANGUAGE sql STABLE;
