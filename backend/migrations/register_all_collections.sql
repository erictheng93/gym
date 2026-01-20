-- ============================================
-- Register all business tables as Directus collections
-- ============================================

BEGIN;

-- Insert all collections (skip if already exists)
INSERT INTO directus_collections (collection, icon, hidden, singleton, accountability, collapse, versioning, archive_app_filter)
SELECT table_name,
    CASE
        -- Core entities
        WHEN table_name = 'branches' THEN 'store'
        WHEN table_name = 'employees' THEN 'badge'
        WHEN table_name = 'members' THEN 'people'
        WHEN table_name = 'contracts' THEN 'description'
        WHEN table_name = 'payments' THEN 'payments'
        WHEN table_name = 'membership_plans' THEN 'card_membership'
        WHEN table_name = 'job_titles' THEN 'work'
        -- Classes
        WHEN table_name = 'classes' THEN 'fitness_center'
        WHEN table_name = 'class_schedules' THEN 'calendar_month'
        WHEN table_name = 'class_sessions' THEN 'event'
        WHEN table_name = 'class_bookings' THEN 'event_available'
        WHEN table_name = 'class_categories' THEN 'category'
        WHEN table_name = 'class_records' THEN 'history'
        WHEN table_name = 'class_reviews' THEN 'rate_review'
        -- Check-ins
        WHEN table_name = 'check_ins' THEN 'login'
        WHEN table_name = 'attendances' THEN 'how_to_reg'
        -- Notifications
        WHEN table_name = 'notification_logs' THEN 'notifications'
        WHEN table_name = 'notification_queue' THEN 'schedule_send'
        WHEN table_name = 'push_notifications' THEN 'campaign'
        WHEN table_name = 'push_subscriptions' THEN 'subscriptions'
        -- Marketing
        WHEN table_name = 'campaigns' THEN 'campaign'
        WHEN table_name = 'coupons' THEN 'confirmation_number'
        WHEN table_name = 'coupon_usages' THEN 'redeem'
        WHEN table_name = 'leads' THEN 'person_add'
        WHEN table_name = 'lead_activities' THEN 'history_edu'
        -- HR
        WHEN table_name = 'leave_requests' THEN 'event_busy'
        WHEN table_name = 'salary_records' THEN 'account_balance'
        WHEN table_name = 'performance_reviews' THEN 'assessment'
        WHEN table_name = 'work_schedules' THEN 'schedule'
        WHEN table_name = 'coach_schedules' THEN 'calendar_today'
        -- Logs
        WHEN table_name = 'contract_logs' THEN 'receipt_long'
        WHEN table_name = 'audit_logs' THEN 'policy'
        WHEN table_name = 'sms_logs' THEN 'sms'
        WHEN table_name = 'line_message_logs' THEN 'chat'
        WHEN table_name = 'otp_tokens' THEN 'key'
        WHEN table_name = 'otp_send_logs' THEN 'history'
        -- Others
        WHEN table_name = 'tenants' THEN 'corporate_fare'
        WHEN table_name = 'bookings' THEN 'book_online'
        WHEN table_name = 'invoices' THEN 'receipt'
        WHEN table_name = 'subscriptions' THEN 'card_membership'
        WHEN table_name = 'body_measurements' THEN 'monitor_weight'
        WHEN table_name = 'member_goals' THEN 'flag'
        WHEN table_name = 'member_coaches' THEN 'sports'
        WHEN table_name = 'workout_logs' THEN 'fitness_center'
        WHEN table_name = 'teaching_materials' THEN 'menu_book'
        WHEN table_name = 'marketing_assets' THEN 'perm_media'
        WHEN table_name = 'issue_reports' THEN 'report_problem'
        WHEN table_name = 'promotion_records' THEN 'trending_up'
        ELSE 'table_chart'
    END as icon,
    false as hidden,
    false as singleton,
    'all' as accountability,
    'open' as collapse,
    false as versioning,
    true as archive_app_filter
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT LIKE 'directus_%'
  AND table_name NOT LIKE 'spatial_ref_sys'
  AND table_name NOT IN (SELECT collection FROM directus_collections)
ORDER BY table_name;

COMMIT;

-- Show registered collections count
SELECT COUNT(*) as registered_collections FROM directus_collections;
