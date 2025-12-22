-- Migration: 009_class_system.sql
-- Description: Complete class booking system with atomic operations
-- Date: 2024-12-22

-- ============================================
-- Classes Table (Course Definitions)
-- ============================================
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ,
    user_created UUID REFERENCES directus_users(id),
    user_updated UUID REFERENCES directus_users(id),

    name VARCHAR(100) NOT NULL,                -- Class name
    description TEXT,                          -- Class description
    duration_minutes INTEGER NOT NULL DEFAULT 60,  -- Duration in minutes
    max_capacity INTEGER NOT NULL DEFAULT 20,  -- Maximum participants
    instructor_id UUID REFERENCES employees(id), -- Default instructor
    branch_id UUID NOT NULL REFERENCES branches(id), -- Branch
    category VARCHAR(50),                      -- Category: YOGA, CARDIO, STRENGTH, DANCE, etc.
    difficulty_level VARCHAR(20) DEFAULT 'BEGINNER', -- BEGINNER, INTERMEDIATE, ADVANCED
    image_url VARCHAR(500),                    -- Class image
    is_active BOOLEAN DEFAULT TRUE,            -- Whether class is active
    requires_count BOOLEAN DEFAULT TRUE,       -- Whether to deduct from count-based contracts
    count_deduction INTEGER DEFAULT 1,         -- How many counts to deduct

    CONSTRAINT chk_class_difficulty CHECK (difficulty_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    CONSTRAINT chk_class_category CHECK (category IN ('YOGA', 'CARDIO', 'STRENGTH', 'DANCE', 'SPINNING', 'PILATES', 'BOXING', 'SWIMMING', 'OTHER'))
);

-- ============================================
-- Class Schedules Table (Weekly Recurring)
-- ============================================
CREATE TABLE IF NOT EXISTS class_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ,
    user_created UUID REFERENCES directus_users(id),
    user_updated UUID REFERENCES directus_users(id),

    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id),
    instructor_id UUID REFERENCES employees(id), -- Can override default instructor

    day_of_week INTEGER NOT NULL,              -- 0=Sunday, 1=Monday, ..., 6=Saturday
    start_time TIME NOT NULL,                  -- Start time
    end_time TIME NOT NULL,                    -- End time
    room VARCHAR(50),                          -- Room/studio name

    max_capacity INTEGER,                      -- Override default capacity
    is_recurring BOOLEAN DEFAULT TRUE,         -- Weekly recurring
    valid_from DATE,                           -- Schedule effective from
    valid_until DATE,                          -- Schedule effective until

    CONSTRAINT chk_day_of_week CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_schedule_time CHECK (end_time > start_time),
    CONSTRAINT uq_schedule UNIQUE (class_id, branch_id, day_of_week, start_time)
);

-- ============================================
-- Class Sessions Table (Actual Class Instances)
-- ============================================
CREATE TABLE IF NOT EXISTS class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ,
    user_created UUID REFERENCES directus_users(id),
    user_updated UUID REFERENCES directus_users(id),

    schedule_id UUID REFERENCES class_schedules(id), -- Source schedule (nullable for ad-hoc)
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id),
    instructor_id UUID REFERENCES employees(id),

    session_date DATE NOT NULL,                -- Session date
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room VARCHAR(50),

    max_capacity INTEGER NOT NULL,
    current_count INTEGER DEFAULT 0,           -- Current bookings
    waitlist_count INTEGER DEFAULT 0,          -- Waitlist count

    session_status VARCHAR(20) DEFAULT 'SCHEDULED', -- SCHEDULED, CANCELLED, COMPLETED
    cancelled_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES directus_users(id),

    CONSTRAINT chk_session_status CHECK (session_status IN ('SCHEDULED', 'CANCELLED', 'COMPLETED')),
    CONSTRAINT chk_session_time CHECK (end_time > start_time),
    CONSTRAINT uq_session UNIQUE (class_id, branch_id, session_date, start_time)
);

-- ============================================
-- Bookings Table (Member Reservations)
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ,
    user_created UUID REFERENCES directus_users(id),
    user_updated UUID REFERENCES directus_users(id),

    session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id),
    contract_id UUID REFERENCES contracts(id), -- For count deduction

    booking_status VARCHAR(20) DEFAULT 'CONFIRMED', -- CONFIRMED, WAITLIST, CANCELLED, ATTENDED, NO_SHOW
    waitlist_position INTEGER,                 -- Position in waitlist

    booked_at TIMESTAMPTZ DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,

    attended_at TIMESTAMPTZ,                   -- Check-in time
    count_deducted BOOLEAN DEFAULT FALSE,      -- Whether count was deducted

    CONSTRAINT chk_booking_status CHECK (booking_status IN ('CONFIRMED', 'WAITLIST', 'CANCELLED', 'ATTENDED', 'NO_SHOW')),
    CONSTRAINT uq_member_session UNIQUE (session_id, member_id)
);

-- ============================================
-- Indexes
-- ============================================

-- Classes
CREATE INDEX IF NOT EXISTS idx_classes_branch ON classes(branch_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_classes_category ON classes(category, is_active);
CREATE INDEX IF NOT EXISTS idx_classes_instructor ON classes(instructor_id);

-- Schedules
CREATE INDEX IF NOT EXISTS idx_schedules_lookup ON class_schedules(branch_id, day_of_week, start_time) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_schedules_class ON class_schedules(class_id);

-- Sessions
CREATE INDEX IF NOT EXISTS idx_sessions_date ON class_sessions(branch_id, session_date, start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_upcoming ON class_sessions(session_date, session_status) WHERE session_status = 'SCHEDULED';
CREATE INDEX IF NOT EXISTS idx_sessions_schedule ON class_sessions(schedule_id);

-- Bookings
CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_upcoming ON bookings(member_id, booking_status, session_id) WHERE booking_status IN ('CONFIRMED', 'WAITLIST');

-- ============================================
-- Atomic Functions
-- ============================================

-- Book a class session
CREATE OR REPLACE FUNCTION book_class_session(
    p_session_id UUID,
    p_member_id UUID,
    p_contract_id UUID DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    booking_id UUID,
    booking_status VARCHAR,
    waitlist_position INTEGER,
    message TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_max_capacity INTEGER;
    v_current_count INTEGER;
    v_waitlist_count INTEGER;
    v_session_status VARCHAR;
    v_session_date DATE;
    v_booking_id UUID;
    v_position INTEGER;
    v_member_status VARCHAR;
BEGIN
    -- Check member status
    SELECT member_status INTO v_member_status
    FROM members WHERE id = p_member_id AND status = 'active';

    IF v_member_status IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::INTEGER, '會員不存在'::TEXT;
        RETURN;
    END IF;

    IF v_member_status != 'ACTIVE' THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::INTEGER, '會員狀態無效，無法預約'::TEXT;
        RETURN;
    END IF;

    -- Lock session row
    SELECT max_capacity, current_count, waitlist_count, session_status, session_date
    INTO v_max_capacity, v_current_count, v_waitlist_count, v_session_status, v_session_date
    FROM class_sessions
    WHERE id = p_session_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::INTEGER, '課程場次不存在'::TEXT;
        RETURN;
    END IF;

    IF v_session_status != 'SCHEDULED' THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::INTEGER, '課程已取消或已結束'::TEXT;
        RETURN;
    END IF;

    IF v_session_date < CURRENT_DATE THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::INTEGER, '無法預約過去的課程'::TEXT;
        RETURN;
    END IF;

    -- Check existing booking
    IF EXISTS(
        SELECT 1 FROM bookings
        WHERE session_id = p_session_id
          AND member_id = p_member_id
          AND status = 'active'
          AND booking_status NOT IN ('CANCELLED')
    ) THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::INTEGER, '您已預約此課程'::TEXT;
        RETURN;
    END IF;

    -- Determine booking status
    IF v_current_count < v_max_capacity THEN
        -- Confirmed booking
        INSERT INTO bookings (session_id, member_id, contract_id, booking_status)
        VALUES (p_session_id, p_member_id, p_contract_id, 'CONFIRMED')
        RETURNING id INTO v_booking_id;

        UPDATE class_sessions
        SET current_count = current_count + 1, date_updated = NOW()
        WHERE id = p_session_id;

        RETURN QUERY SELECT TRUE, v_booking_id, 'CONFIRMED'::VARCHAR, NULL::INTEGER, '預約成功！'::TEXT;
    ELSE
        -- Waitlist
        v_position := v_waitlist_count + 1;

        INSERT INTO bookings (session_id, member_id, contract_id, booking_status, waitlist_position)
        VALUES (p_session_id, p_member_id, p_contract_id, 'WAITLIST', v_position)
        RETURNING id INTO v_booking_id;

        UPDATE class_sessions
        SET waitlist_count = waitlist_count + 1, date_updated = NOW()
        WHERE id = p_session_id;

        RETURN QUERY SELECT TRUE, v_booking_id, 'WAITLIST'::VARCHAR, v_position, FORMAT('已加入候補名單，目前排序第 %s 位', v_position)::TEXT;
    END IF;
END;
$$;

-- Cancel a booking
CREATE OR REPLACE FUNCTION cancel_booking(
    p_booking_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    promoted_booking_id UUID,
    promoted_member_id UUID,
    message TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_session_id UUID;
    v_booking_status VARCHAR;
    v_promoted_id UUID;
    v_promoted_member UUID;
    v_session_date DATE;
    v_start_time TIME;
BEGIN
    -- Lock booking
    SELECT session_id, booking_status
    INTO v_session_id, v_booking_status
    FROM bookings
    WHERE id = p_booking_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, '預約不存在'::TEXT;
        RETURN;
    END IF;

    IF v_booking_status IN ('CANCELLED', 'ATTENDED', 'NO_SHOW') THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, '此預約無法取消'::TEXT;
        RETURN;
    END IF;

    -- Check cancellation deadline (e.g., 2 hours before)
    SELECT session_date, start_time INTO v_session_date, v_start_time
    FROM class_sessions WHERE id = v_session_id;

    IF (v_session_date + v_start_time) < (NOW() + INTERVAL '2 hours') THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, '課程開始前 2 小時內無法取消'::TEXT;
        RETURN;
    END IF;

    -- Update booking status
    UPDATE bookings SET
        booking_status = 'CANCELLED',
        cancelled_at = NOW(),
        cancel_reason = p_reason,
        date_updated = NOW()
    WHERE id = p_booking_id;

    IF v_booking_status = 'CONFIRMED' THEN
        -- Decrease confirmed count
        UPDATE class_sessions
        SET current_count = current_count - 1, date_updated = NOW()
        WHERE id = v_session_id;

        -- Promote first waitlisted
        SELECT id, member_id INTO v_promoted_id, v_promoted_member
        FROM bookings
        WHERE session_id = v_session_id
          AND booking_status = 'WAITLIST'
          AND status = 'active'
        ORDER BY waitlist_position
        LIMIT 1
        FOR UPDATE;

        IF v_promoted_id IS NOT NULL THEN
            UPDATE bookings SET
                booking_status = 'CONFIRMED',
                waitlist_position = NULL,
                date_updated = NOW()
            WHERE id = v_promoted_id;

            UPDATE class_sessions SET
                current_count = current_count + 1,
                waitlist_count = waitlist_count - 1,
                date_updated = NOW()
            WHERE id = v_session_id;

            -- Reorder waitlist positions
            WITH reordered AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position) as new_pos
                FROM bookings
                WHERE session_id = v_session_id
                  AND booking_status = 'WAITLIST'
                  AND status = 'active'
            )
            UPDATE bookings b SET
                waitlist_position = r.new_pos,
                date_updated = NOW()
            FROM reordered r
            WHERE b.id = r.id;

            RETURN QUERY SELECT TRUE, v_promoted_id, v_promoted_member, '取消成功，已遞補候補會員'::TEXT;
            RETURN;
        END IF;
    ELSE
        -- Waitlist cancellation
        UPDATE class_sessions
        SET waitlist_count = waitlist_count - 1, date_updated = NOW()
        WHERE id = v_session_id;

        -- Reorder remaining waitlist
        WITH reordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position) as new_pos
            FROM bookings
            WHERE session_id = v_session_id
              AND booking_status = 'WAITLIST'
              AND status = 'active'
        )
        UPDATE bookings b SET
            waitlist_position = r.new_pos,
            date_updated = NOW()
        FROM reordered r
        WHERE b.id = r.id;
    END IF;

    RETURN QUERY SELECT TRUE, NULL::UUID, NULL::UUID, '取消成功'::TEXT;
END;
$$;

-- Attend class (check-in and deduct count)
CREATE OR REPLACE FUNCTION attend_class(
    p_booking_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    remaining_counts INTEGER,
    message TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_booking_status VARCHAR;
    v_contract_id UUID;
    v_session_id UUID;
    v_session_date DATE;
    v_class_requires_count BOOLEAN;
    v_count_deduction INTEGER;
    v_contract_remaining INTEGER;
    v_plan_type VARCHAR;
BEGIN
    -- Get booking info
    SELECT b.booking_status, b.contract_id, b.session_id, cs.session_date,
           c.requires_count, c.count_deduction
    INTO v_booking_status, v_contract_id, v_session_id, v_session_date,
         v_class_requires_count, v_count_deduction
    FROM bookings b
    JOIN class_sessions cs ON cs.id = b.session_id
    JOIN classes c ON c.id = cs.class_id
    WHERE b.id = p_booking_id AND b.status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, '預約不存在'::TEXT;
        RETURN;
    END IF;

    IF v_booking_status != 'CONFIRMED' THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, '只有已確認的預約才能簽到'::TEXT;
        RETURN;
    END IF;

    IF v_session_date != CURRENT_DATE THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, '只能在課程當天簽到'::TEXT;
        RETURN;
    END IF;

    -- Deduct count if needed
    IF v_class_requires_count AND v_contract_id IS NOT NULL THEN
        SELECT ct.remaining_counts, mp.plan_type
        INTO v_contract_remaining, v_plan_type
        FROM contracts ct
        JOIN membership_plans mp ON mp.id = ct.plan_id
        WHERE ct.id = v_contract_id AND ct.status = 'active';

        IF v_plan_type = 'COUNT_BASED' THEN
            IF v_contract_remaining IS NULL OR v_contract_remaining < v_count_deduction THEN
                RETURN QUERY SELECT FALSE, v_contract_remaining, '剩餘次數不足'::TEXT;
                RETURN;
            END IF;

            -- Deduct count
            UPDATE contracts
            SET remaining_counts = remaining_counts - v_count_deduction,
                date_updated = NOW()
            WHERE id = v_contract_id;

            v_contract_remaining := v_contract_remaining - v_count_deduction;

            -- Log the deduction
            INSERT INTO contract_logs (contract_id, log_type, days_affected, reason, branch_id)
            SELECT v_contract_id, 'CLASS_USED', v_count_deduction,
                   FORMAT('課程簽到: %s', (SELECT name FROM classes WHERE id = (SELECT class_id FROM class_sessions WHERE id = v_session_id))),
                   (SELECT branch_id FROM class_sessions WHERE id = v_session_id);
        END IF;
    END IF;

    -- Update booking
    UPDATE bookings SET
        booking_status = 'ATTENDED',
        attended_at = NOW(),
        count_deducted = v_class_requires_count,
        date_updated = NOW()
    WHERE id = p_booking_id;

    RETURN QUERY SELECT TRUE, v_contract_remaining, '簽到成功！'::TEXT;
END;
$$;

-- Generate sessions from schedules for a date range
CREATE OR REPLACE FUNCTION generate_class_sessions(
    p_branch_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_schedule RECORD;
    v_current_date DATE;
    v_created INTEGER := 0;
BEGIN
    FOR v_schedule IN
        SELECT cs.*, c.max_capacity as class_max_capacity
        FROM class_schedules cs
        JOIN classes c ON c.id = cs.class_id
        WHERE cs.branch_id = p_branch_id
          AND cs.status = 'active'
          AND cs.is_recurring = TRUE
          AND (cs.valid_from IS NULL OR cs.valid_from <= p_end_date)
          AND (cs.valid_until IS NULL OR cs.valid_until >= p_start_date)
    LOOP
        v_current_date := p_start_date;

        WHILE v_current_date <= p_end_date LOOP
            -- Check if day matches
            IF EXTRACT(DOW FROM v_current_date) = v_schedule.day_of_week THEN
                -- Check valid range
                IF (v_schedule.valid_from IS NULL OR v_current_date >= v_schedule.valid_from)
                   AND (v_schedule.valid_until IS NULL OR v_current_date <= v_schedule.valid_until) THEN
                    -- Insert if not exists
                    INSERT INTO class_sessions (
                        schedule_id, class_id, branch_id, instructor_id,
                        session_date, start_time, end_time, room,
                        max_capacity, session_status
                    )
                    VALUES (
                        v_schedule.id, v_schedule.class_id, v_schedule.branch_id,
                        COALESCE(v_schedule.instructor_id, (SELECT instructor_id FROM classes WHERE id = v_schedule.class_id)),
                        v_current_date, v_schedule.start_time, v_schedule.end_time, v_schedule.room,
                        COALESCE(v_schedule.max_capacity, v_schedule.class_max_capacity),
                        'SCHEDULED'
                    )
                    ON CONFLICT (class_id, branch_id, session_date, start_time) DO NOTHING;

                    IF FOUND THEN
                        v_created := v_created + 1;
                    END IF;
                END IF;
            END IF;

            v_current_date := v_current_date + INTERVAL '1 day';
        END LOOP;
    END LOOP;

    RETURN v_created;
END;
$$;

-- Mark no-shows after class ends
CREATE OR REPLACE FUNCTION mark_no_shows()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE bookings b SET
        booking_status = 'NO_SHOW',
        date_updated = NOW()
    FROM class_sessions cs
    WHERE b.session_id = cs.id
      AND b.booking_status = 'CONFIRMED'
      AND b.status = 'active'
      AND cs.session_date < CURRENT_DATE
      AND cs.session_status = 'SCHEDULED';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- Also mark sessions as completed
    UPDATE class_sessions SET
        session_status = 'COMPLETED',
        date_updated = NOW()
    WHERE session_date < CURRENT_DATE
      AND session_status = 'SCHEDULED';

    RETURN v_updated;
END;
$$;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE classes IS 'Class/course definitions';
COMMENT ON TABLE class_schedules IS 'Weekly recurring class schedules';
COMMENT ON TABLE class_sessions IS 'Actual class instances on specific dates';
COMMENT ON TABLE bookings IS 'Member class bookings/reservations';
COMMENT ON FUNCTION book_class_session IS 'Atomic function to book a class with waitlist support';
COMMENT ON FUNCTION cancel_booking IS 'Atomic function to cancel booking with auto-promotion';
COMMENT ON FUNCTION attend_class IS 'Check-in to class and deduct contract counts';
COMMENT ON FUNCTION generate_class_sessions IS 'Generate class sessions from schedules for a date range';
COMMENT ON FUNCTION mark_no_shows IS 'Mark unattended bookings as no-show after class ends';
