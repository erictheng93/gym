-- Migration: 030_coach_credentials.sql
-- Purpose: Create coach authentication tables for coach-app
-- Phase 3: Coach App & Booking System

-- ============================================
-- 1. Create coach_credentials table
-- ============================================
-- Stores authentication data for coaches (employees with coach role)
-- Mirrors member_credentials pattern for consistency

CREATE TABLE IF NOT EXISTS coach_credentials (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),

    -- Foreign key to employee (1:1 relationship)
    employee_id UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,

    -- Password authentication
    password_hash VARCHAR(255),
    password_updated_at TIMESTAMPTZ,

    -- Security: failed login tracking
    failed_login_attempts INTEGER DEFAULT 0,
    last_failed_login_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,

    -- Login history
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    last_login_user_agent TEXT,

    -- Password reset
    password_reset_token_hash VARCHAR(255),
    password_reset_expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_coach_credentials_employee_id
ON coach_credentials(employee_id);

CREATE INDEX IF NOT EXISTS idx_coach_credentials_locked
ON coach_credentials(locked_until)
WHERE locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coach_credentials_reset_token
ON coach_credentials(password_reset_token_hash)
WHERE password_reset_token_hash IS NOT NULL;

-- ============================================
-- 3. Create trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_coach_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_coach_credentials_updated_at ON coach_credentials;
CREATE TRIGGER trigger_coach_credentials_updated_at
    BEFORE UPDATE ON coach_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_coach_credentials_updated_at();

-- ============================================
-- 4. Create student_notes table
-- ============================================
-- Coaches can add notes about their assigned students

CREATE TABLE IF NOT EXISTS student_notes (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    coach_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    note_type VARCHAR(30) NOT NULL CHECK (note_type IN ('PROGRESS', 'GOAL', 'INJURY', 'FEEDBACK', 'GENERAL')),
    content TEXT NOT NULL,
    is_private BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_notes_coach ON student_notes(coach_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_member ON student_notes(member_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_type ON student_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_student_notes_coach_member ON student_notes(coach_id, member_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_student_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_student_notes_updated_at ON student_notes;
CREATE TRIGGER trigger_student_notes_updated_at
    BEFORE UPDATE ON student_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_student_notes_updated_at();

-- ============================================
-- 5. Create lesson_plans table
-- ============================================
-- Stores lesson plan templates and session-specific plans

CREATE TABLE IF NOT EXISTS lesson_plans (
    id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),
    session_id UUID REFERENCES class_sessions(id) ON DELETE SET NULL,
    coach_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    objectives TEXT[],
    warmup_exercises JSONB DEFAULT '[]',
    main_exercises JSONB DEFAULT '[]',
    cooldown_exercises JSONB DEFAULT '[]',
    notes TEXT,
    is_template BOOLEAN DEFAULT FALSE,
    template_category VARCHAR(50),
    difficulty VARCHAR(20) CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    duration_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_plans_coach ON lesson_plans(coach_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_session ON lesson_plans(session_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_template ON lesson_plans(is_template) WHERE is_template = TRUE;
CREATE INDEX IF NOT EXISTS idx_lesson_plans_category ON lesson_plans(template_category) WHERE template_category IS NOT NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_lesson_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lesson_plans_updated_at ON lesson_plans;
CREATE TRIGGER trigger_lesson_plans_updated_at
    BEFORE UPDATE ON lesson_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_lesson_plans_updated_at();

-- ============================================
-- 6. Add comments for documentation
-- ============================================

COMMENT ON TABLE coach_credentials IS 'Stores coach authentication credentials (mirrors member_credentials pattern)';
COMMENT ON COLUMN coach_credentials.employee_id IS 'Links to employees table (1:1 relationship for coaches)';
COMMENT ON COLUMN coach_credentials.password_hash IS 'Argon2id hashed password';
COMMENT ON COLUMN coach_credentials.failed_login_attempts IS 'Count of consecutive failed login attempts';
COMMENT ON COLUMN coach_credentials.locked_until IS 'Account locked until this time (null = not locked)';

COMMENT ON TABLE student_notes IS 'Coach notes about their assigned students';
COMMENT ON COLUMN student_notes.note_type IS 'Type: PROGRESS, GOAL, INJURY, FEEDBACK, GENERAL';
COMMENT ON COLUMN student_notes.is_private IS 'If true, only the coach can see this note';

COMMENT ON TABLE lesson_plans IS 'Lesson plan templates and session-specific plans';
COMMENT ON COLUMN lesson_plans.is_template IS 'If true, this is a reusable template';
COMMENT ON COLUMN lesson_plans.warmup_exercises IS 'JSON array of warmup exercises';
COMMENT ON COLUMN lesson_plans.main_exercises IS 'JSON array of main workout exercises';
COMMENT ON COLUMN lesson_plans.cooldown_exercises IS 'JSON array of cooldown exercises';

-- ============================================
-- 7. Create credentials for existing coaches
-- ============================================
-- Initialize credentials for employees with coach-related job titles

INSERT INTO coach_credentials (employee_id, created_at)
SELECT
    e.id,
    NOW()
FROM employees e
JOIN job_titles jt ON e.job_title_id = jt.id
WHERE jt.code IN ('COACH', 'HEAD_COACH', 'PT', 'TRAINER', 'FITNESS_INSTRUCTOR')
  AND e.status = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1 FROM coach_credentials cc WHERE cc.employee_id = e.id
  )
ON CONFLICT (employee_id) DO NOTHING;
