-- Create missing tables for backend-v2
-- Note: Column naming follows existing Directus convention (created_at, updated_at)

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(20) DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  name varchar(255) NOT NULL,
  slug varchar(100) UNIQUE NOT NULL,
  email varchar(255) NOT NULL,
  phone varchar(20),
  plan_type varchar(50) DEFAULT 'starter',
  max_branches integer DEFAULT 1,
  max_members integer DEFAULT 100,
  max_employees integer DEFAULT 10,
  max_storage_mb integer DEFAULT 1024,
  tenant_status varchar(20) DEFAULT 'trial',
  trial_ends_at timestamp with time zone,
  billing_cycle varchar(20) DEFAULT 'monthly',
  next_billing_date date,
  monthly_price numeric(10,2),
  settings jsonb DEFAULT '{}',
  created_by uuid
);

-- Users table (authentication - replaces directus_users for gym app)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  email varchar(255) UNIQUE NOT NULL,
  password_hash varchar(255),
  role varchar(50) NOT NULL DEFAULT 'staff',
  employee_id uuid,
  tenant_id uuid,
  is_active boolean DEFAULT true,
  email_verified boolean DEFAULT false,
  last_login_at timestamp with time zone,
  login_count integer DEFAULT 0
);

-- Sessions table (authentication)
CREATE TABLE IF NOT EXISTS sessions (
  id varchar(255) PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid,
  user_id uuid,
  employee_id uuid,
  branch_id uuid,
  action varchar(50) NOT NULL,
  resource_type varchar(100) NOT NULL,
  resource_id uuid,
  description text,
  ip_address inet,
  user_agent text,
  old_values jsonb,
  new_values jsonb,
  diff jsonb,
  request_method varchar(10),
  request_path text,
  request_params jsonb,
  response_status integer,
  response_time_ms integer,
  severity varchar(20) DEFAULT 'info',
  category varchar(50),
  metadata jsonb DEFAULT '{}'
);

-- Classes table
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(20) DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  name varchar(100) NOT NULL,
  description text,
  duration_minutes integer DEFAULT 60 NOT NULL,
  max_capacity integer DEFAULT 20 NOT NULL,
  instructor_id uuid,
  branch_id uuid NOT NULL,
  category varchar(50),
  difficulty_level varchar(20) DEFAULT 'BEGINNER',
  image_url varchar(500),
  is_active boolean DEFAULT true,
  requires_count boolean DEFAULT true,
  count_deduction integer DEFAULT 1
);

-- Class schedules table
CREATE TABLE IF NOT EXISTS class_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(20) DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  class_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  instructor_id uuid,
  day_of_week integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  room varchar(50),
  max_capacity integer,
  is_recurring boolean DEFAULT true,
  valid_from date,
  valid_until date
);

-- Class sessions table
CREATE TABLE IF NOT EXISTS class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(20) DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  schedule_id uuid,
  class_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  instructor_id uuid,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  room varchar(50),
  max_capacity integer NOT NULL,
  current_count integer DEFAULT 0,
  waitlist_count integer DEFAULT 0,
  session_status varchar(20) DEFAULT 'SCHEDULED',
  cancelled_reason text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(20) DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  session_id uuid NOT NULL,
  member_id uuid NOT NULL,
  contract_id uuid,
  booking_status varchar(20) DEFAULT 'CONFIRMED',
  waitlist_position integer,
  booked_at timestamp with time zone DEFAULT now(),
  cancelled_at timestamp with time zone,
  cancel_reason text,
  attended_at timestamp with time zone,
  count_deducted boolean DEFAULT false
);

-- Check-ins table
CREATE TABLE IF NOT EXISTS check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(20) DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  member_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  contract_id uuid,
  check_in_time timestamp with time zone DEFAULT now(),
  check_in_type varchar(20) DEFAULT 'ENTRY',
  check_in_method varchar(20),
  processed_by_id uuid,
  location_ip varchar(50),
  location_device varchar(100),
  notes text
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  tenant_id uuid,
  uploaded_by uuid,
  filename varchar(255) NOT NULL,
  original_filename varchar(255),
  mime_type varchar(100),
  size integer,
  storage_key varchar(500) NOT NULL,
  folder varchar(255),
  title varchar(255),
  description text,
  width integer,
  height integer,
  metadata jsonb DEFAULT '{}'
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(20) DEFAULT 'active',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  notification_type varchar(50),
  type varchar(50),
  title varchar(255) NOT NULL,
  message text,
  data text,
  reference_type varchar(255),
  reference_id uuid,
  branch_id uuid,
  target_user_id uuid,
  target_member_id uuid,
  target_employee_id uuid,
  recipient_type varchar(20),
  recipient_id uuid,
  priority varchar(20) DEFAULT 'NORMAL',
  is_read boolean DEFAULT false,
  read_status boolean DEFAULT false,
  read_at timestamp with time zone,
  expires_at timestamp with time zone,
  tenant_id uuid
);

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  user_id uuid,
  member_id uuid,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  is_active boolean DEFAULT true,
  error_count integer DEFAULT 0,
  notify_booking_reminder boolean DEFAULT true,
  notify_class_cancelled boolean DEFAULT true,
  notify_contract_expiry boolean DEFAULT true,
  tenant_id uuid
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  tenant_id uuid NOT NULL,
  plan_type varchar(50) NOT NULL,
  status varchar(20) DEFAULT 'active' NOT NULL,
  billing_cycle varchar(20) DEFAULT 'monthly' NOT NULL,
  current_period_start date NOT NULL,
  current_period_end date NOT NULL,
  cancel_at_period_end boolean DEFAULT false,
  cancelled_at timestamp with time zone,
  monthly_price numeric(10,2),
  yearly_price numeric(10,2),
  metadata jsonb DEFAULT '{}'
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  tenant_id uuid NOT NULL,
  subscription_id uuid,
  invoice_number varchar(50) UNIQUE NOT NULL,
  amount_subtotal numeric(10,2) NOT NULL,
  amount_tax numeric(10,2) DEFAULT 0,
  amount_total numeric(10,2) NOT NULL,
  currency varchar(3) DEFAULT 'TWD',
  status varchar(20) DEFAULT 'draft' NOT NULL,
  due_date date NOT NULL,
  paid_at timestamp with time zone,
  period_start date NOT NULL,
  period_end date NOT NULL,
  payment_method varchar(50),
  payment_transaction_id varchar(100),
  line_items jsonb DEFAULT '[]',
  notes text,
  metadata jsonb DEFAULT '{}'
);

-- Usage records table
CREATE TABLE IF NOT EXISTS usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  tenant_id uuid NOT NULL,
  record_date date DEFAULT CURRENT_DATE NOT NULL,
  members_count integer DEFAULT 0,
  employees_count integer DEFAULT 0,
  branches_count integer DEFAULT 0,
  storage_mb integer DEFAULT 0,
  api_calls_count integer DEFAULT 0,
  api_bandwidth_mb integer DEFAULT 0,
  active_contracts_count integer DEFAULT 0,
  daily_revenue numeric(12,2) DEFAULT 0,
  metadata jsonb DEFAULT '{}'
);

-- OTP tokens table
CREATE TABLE IF NOT EXISTS otp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier varchar(100) NOT NULL,
  identifier_type varchar(20) NOT NULL,
  code varchar(6) NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  verified boolean DEFAULT false,
  verified_at timestamp with time zone,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- OTP send logs table
CREATE TABLE IF NOT EXISTS otp_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier varchar(100) NOT NULL,
  identifier_type varchar(20) NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  ip_address inet,
  success boolean DEFAULT true,
  error_message text
);

-- Add missing columns to existing tables
ALTER TABLE branches ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE members ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE contract_logs ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS branch_id uuid;
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE job_titles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE job_titles ADD COLUMN IF NOT EXISTS level integer DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE rfm_scores ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_classes_branch ON classes(branch_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_date ON class_sessions(branch_id, session_date, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_member ON bookings(member_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_check_ins_member ON check_ins(member_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_branch ON check_ins(branch_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_time ON check_ins(check_in_time);
CREATE INDEX IF NOT EXISTS idx_files_tenant ON files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id);

-- Add foreign key references
ALTER TABLE sessions ADD CONSTRAINT IF NOT EXISTS fk_sessions_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS fk_users_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS fk_users_employee
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
