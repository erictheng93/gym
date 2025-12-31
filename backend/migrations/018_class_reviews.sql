-- Migration: 018_class_reviews.sql
-- Description: Class review/rating system for member feedback
-- Date: 2024-12-30

-- ============================================
-- Class Reviews Table
-- ============================================
CREATE TABLE IF NOT EXISTS class_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ,
    user_created UUID REFERENCES directus_users(id),
    user_updated UUID REFERENCES directus_users(id),

    -- Core relationships
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    instructor_id UUID REFERENCES employees(id),
    branch_id UUID NOT NULL REFERENCES branches(id),

    -- Review content
    rating INTEGER NOT NULL,                -- 1-5 stars
    comment TEXT,                           -- Optional text review

    -- Metadata
    session_date DATE NOT NULL,             -- Denormalized for query efficiency
    reviewed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_rating_range CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT uq_booking_review UNIQUE (booking_id)  -- One review per booking
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Primary lookup: reviews for a class
CREATE INDEX IF NOT EXISTS idx_reviews_class
    ON class_reviews(class_id, status)
    WHERE status = 'active';

-- Reviews by session (for session detail page)
CREATE INDEX IF NOT EXISTS idx_reviews_session
    ON class_reviews(session_id, status)
    WHERE status = 'active';

-- Reviews by member (for member's review history)
CREATE INDEX IF NOT EXISTS idx_reviews_member
    ON class_reviews(member_id, date_created DESC)
    WHERE status = 'active';

-- Reviews by instructor (for instructor analytics)
CREATE INDEX IF NOT EXISTS idx_reviews_instructor
    ON class_reviews(instructor_id, rating)
    WHERE status = 'active';

-- Reviews by branch
CREATE INDEX IF NOT EXISTS idx_reviews_branch
    ON class_reviews(branch_id, date_created DESC)
    WHERE status = 'active';

-- Time-based queries (recent reviews)
CREATE INDEX IF NOT EXISTS idx_reviews_recent
    ON class_reviews(date_created DESC)
    WHERE status = 'active';

-- ============================================
-- Function: Check Review Eligibility
-- ============================================
CREATE OR REPLACE FUNCTION can_review_booking(p_booking_id UUID, p_member_id UUID)
RETURNS TABLE (
    can_review BOOLEAN,
    reason TEXT,
    booking_status VARCHAR,
    session_date DATE,
    days_since_session INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
    v_booking RECORD;
    v_days_diff INTEGER;
BEGIN
    -- Get booking info
    SELECT b.booking_status, b.member_id, cs.session_date
    INTO v_booking
    FROM bookings b
    JOIN class_sessions cs ON cs.id = b.session_id
    WHERE b.id = p_booking_id AND b.status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, '預約不存在'::TEXT, NULL::VARCHAR, NULL::DATE, NULL::INTEGER;
        RETURN;
    END IF;

    -- Check member ownership
    IF v_booking.member_id != p_member_id THEN
        RETURN QUERY SELECT FALSE, '無權限評價此預約'::TEXT, v_booking.booking_status, v_booking.session_date, NULL::INTEGER;
        RETURN;
    END IF;

    -- Check attendance status
    IF v_booking.booking_status != 'ATTENDED' THEN
        RETURN QUERY SELECT FALSE, '只有已出席的課程才能評價'::TEXT, v_booking.booking_status, v_booking.session_date, NULL::INTEGER;
        RETURN;
    END IF;

    -- Check time window (7 days)
    v_days_diff := CURRENT_DATE - v_booking.session_date;
    IF v_days_diff > 7 THEN
        RETURN QUERY SELECT FALSE, '評價期限已過（課程結束後 7 天內）'::TEXT, v_booking.booking_status, v_booking.session_date, v_days_diff;
        RETURN;
    END IF;

    IF v_days_diff < 0 THEN
        RETURN QUERY SELECT FALSE, '課程尚未結束'::TEXT, v_booking.booking_status, v_booking.session_date, v_days_diff;
        RETURN;
    END IF;

    -- Check existing review
    IF EXISTS(SELECT 1 FROM class_reviews WHERE booking_id = p_booking_id AND status = 'active') THEN
        RETURN QUERY SELECT FALSE, '已評價過此課程'::TEXT, v_booking.booking_status, v_booking.session_date, v_days_diff;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, '可以評價'::TEXT, v_booking.booking_status, v_booking.session_date, v_days_diff;
END;
$$;

-- ============================================
-- Function: Submit Review (Atomic)
-- ============================================
CREATE OR REPLACE FUNCTION submit_class_review(
    p_booking_id UUID,
    p_member_id UUID,
    p_rating INTEGER,
    p_comment TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    review_id UUID,
    message TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_booking RECORD;
    v_can_review RECORD;
    v_review_id UUID;
BEGIN
    -- Check eligibility
    SELECT * INTO v_can_review FROM can_review_booking(p_booking_id, p_member_id);

    IF NOT v_can_review.can_review THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, v_can_review.reason;
        RETURN;
    END IF;

    -- Validate rating
    IF p_rating < 1 OR p_rating > 5 THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, '評分必須在 1 到 5 之間'::TEXT;
        RETURN;
    END IF;

    -- Get booking details
    SELECT b.*, cs.session_date, cs.class_id, cs.instructor_id, cs.branch_id
    INTO v_booking
    FROM bookings b
    JOIN class_sessions cs ON cs.id = b.session_id
    WHERE b.id = p_booking_id;

    -- Insert review
    INSERT INTO class_reviews (
        booking_id, session_id, class_id, member_id,
        instructor_id, branch_id, rating, comment, session_date
    )
    VALUES (
        p_booking_id, v_booking.session_id, v_booking.class_id, p_member_id,
        v_booking.instructor_id, v_booking.branch_id, p_rating, NULLIF(TRIM(p_comment), ''), v_booking.session_date
    )
    RETURNING id INTO v_review_id;

    RETURN QUERY SELECT TRUE, v_review_id, '評價提交成功！'::TEXT;
END;
$$;

-- ============================================
-- Function: Update Review
-- ============================================
CREATE OR REPLACE FUNCTION update_class_review(
    p_review_id UUID,
    p_member_id UUID,
    p_rating INTEGER,
    p_comment TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_review RECORD;
BEGIN
    -- Get review
    SELECT * INTO v_review
    FROM class_reviews
    WHERE id = p_review_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, '評價不存在'::TEXT;
        RETURN;
    END IF;

    -- Check ownership
    IF v_review.member_id != p_member_id THEN
        RETURN QUERY SELECT FALSE, '無權限修改此評價'::TEXT;
        RETURN;
    END IF;

    -- Validate rating
    IF p_rating < 1 OR p_rating > 5 THEN
        RETURN QUERY SELECT FALSE, '評分必須在 1 到 5 之間'::TEXT;
        RETURN;
    END IF;

    -- Update
    UPDATE class_reviews
    SET rating = p_rating,
        comment = NULLIF(TRIM(p_comment), ''),
        date_updated = NOW()
    WHERE id = p_review_id;

    RETURN QUERY SELECT TRUE, '評價已更新'::TEXT;
END;
$$;

-- ============================================
-- Function: Delete Review (Soft Delete)
-- ============================================
CREATE OR REPLACE FUNCTION delete_class_review(
    p_review_id UUID,
    p_member_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_review RECORD;
BEGIN
    -- Get review
    SELECT * INTO v_review
    FROM class_reviews
    WHERE id = p_review_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, '評價不存在'::TEXT;
        RETURN;
    END IF;

    -- Check ownership
    IF v_review.member_id != p_member_id THEN
        RETURN QUERY SELECT FALSE, '無權限刪除此評價'::TEXT;
        RETURN;
    END IF;

    -- Soft delete
    UPDATE class_reviews
    SET status = 'archived',
        date_updated = NOW()
    WHERE id = p_review_id;

    RETURN QUERY SELECT TRUE, '評價已刪除'::TEXT;
END;
$$;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE class_reviews IS 'Member reviews for attended class sessions';
COMMENT ON FUNCTION can_review_booking IS 'Check if a booking is eligible for review';
COMMENT ON FUNCTION submit_class_review IS 'Atomic function to submit a new review';
COMMENT ON FUNCTION update_class_review IS 'Update an existing review';
COMMENT ON FUNCTION delete_class_review IS 'Soft delete a review';
