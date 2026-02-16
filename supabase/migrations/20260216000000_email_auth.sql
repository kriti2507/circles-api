-- Migration: Switch authentication from phone/SMS to email+password
-- Adds email column, makes phone nullable, updates user trigger

-- 1. Add email columns
ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;

-- 2. Make phone nullable (was NOT NULL)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- 3. Drop UNIQUE constraint on phone (email is now the primary identifier)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;

-- 4. Update the handle_new_user trigger to use email instead of phone
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name)
    VALUES (NEW.id, NEW.email, '');

    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
