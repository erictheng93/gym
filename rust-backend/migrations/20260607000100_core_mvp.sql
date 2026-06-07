create extension if not exists pgcrypto;

create table if not exists tenants (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    name varchar not null,
    slug varchar not null unique,
    email varchar not null,
    phone varchar,
    plan_type varchar,
    max_branches integer,
    max_members integer,
    max_employees integer,
    max_storage_mb integer,
    tenant_status varchar,
    trial_ends_at timestamptz,
    billing_cycle varchar,
    next_billing_date date,
    monthly_price numeric,
    settings jsonb default '{}'::jsonb,
    created_by uuid
);

create table if not exists branches (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    name varchar not null,
    code varchar not null,
    type varchar not null,
    address text,
    phone varchar,
    tax_id varchar,
    settings jsonb default '{}'::jsonb,
    tenant_id uuid references tenants(id)
);

create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email varchar not null unique,
    password_hash varchar,
    role varchar not null,
    employee_id uuid,
    tenant_id uuid references tenants(id),
    is_active boolean default true,
    email_verified boolean default false,
    last_login_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists job_titles (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    name varchar not null,
    code varchar not null,
    description text,
    level integer,
    sort integer,
    permissions_config jsonb not null default '{}'::jsonb,
    tenant_id uuid references tenants(id)
);

create table if not exists employees (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id),
    branch_id uuid not null references branches(id),
    job_title_id uuid not null references job_titles(id),
    employee_code varchar not null,
    full_name varchar not null,
    phone varchar,
    email varchar,
    status varchar not null,
    employment_type varchar not null,
    hire_date date not null,
    resign_date date,
    basic_salary numeric,
    custom_permissions jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    tenant_id uuid references tenants(id)
);

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where table_schema = 'public'
          and table_name = 'users'
          and constraint_name = 'users_employee_id_employees_id_fk'
    ) then
        alter table users
            add constraint users_employee_id_employees_id_fk
            foreign key (employee_id) references employees(id)
            deferrable initially deferred;
    end if;
end $$;

create table if not exists membership_plans (
    id uuid primary key default gen_random_uuid(),
    name varchar not null,
    code varchar not null,
    type varchar not null,
    description text,
    duration_months integer,
    class_counts integer,
    price numeric not null,
    allow_pause boolean not null default false,
    max_pause_days integer,
    allow_transfer boolean not null default false,
    is_active boolean not null default true,
    sort integer,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    tenant_id uuid references tenants(id),
    branch_id uuid references branches(id)
);

create table if not exists members (
    id uuid primary key default gen_random_uuid(),
    member_code varchar not null unique,
    full_name varchar not null,
    phone varchar not null,
    email varchar,
    gender varchar,
    birthday date,
    id_number varchar,
    address text,
    emergency_contact varchar,
    emergency_phone varchar,
    branch_id uuid not null references branches(id),
    sales_person_id uuid references employees(id),
    status varchar not null,
    join_date date not null,
    tags jsonb,
    notes text,
    avatar uuid,
    height real,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    tenant_id uuid references tenants(id)
);

create index if not exists branches_tenant_id_idx on branches(tenant_id);
create index if not exists users_tenant_id_idx on users(tenant_id);
create index if not exists employees_tenant_id_idx on employees(tenant_id);
create index if not exists job_titles_tenant_id_idx on job_titles(tenant_id);
create index if not exists membership_plans_tenant_id_idx on membership_plans(tenant_id);
create index if not exists membership_plans_branch_id_idx on membership_plans(branch_id);
create index if not exists members_tenant_id_idx on members(tenant_id);
create index if not exists members_branch_id_idx on members(branch_id);

create table if not exists member_credentials (
    id uuid primary key default gen_random_uuid(),
    member_id uuid not null unique references members(id),
    password_hash varchar not null,
    failed_attempts integer not null default 0,
    locked_until timestamptz,
    password_reset_token_hash varchar,
    password_reset_expires_at timestamptz,
    last_password_change_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists member_credentials_member_id_idx on member_credentials(member_id);

create table if not exists contracts (
    id uuid primary key default gen_random_uuid(),
    contract_no varchar not null unique,
    member_id uuid not null references members(id),
    plan_id uuid not null references membership_plans(id),
    branch_id uuid not null references branches(id),
    sales_person_id uuid references employees(id),
    status varchar not null,
    sign_date date,
    start_date date not null,
    original_end_date date not null,
    end_date date not null,
    remaining_counts integer,
    total_amount numeric not null,
    paid_amount numeric not null,
    payment_status varchar not null,
    digital_signature uuid,
    contract_pdf uuid,
    terms_accepted boolean not null default false,
    notes text,
    created_by uuid references employees(id),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    tenant_id uuid references tenants(id)
);

create index if not exists contracts_tenant_id_idx on contracts(tenant_id);
create index if not exists contracts_member_id_idx on contracts(member_id);
create index if not exists contracts_plan_id_idx on contracts(plan_id);
create index if not exists contracts_branch_id_idx on contracts(branch_id);

create table if not exists payments (
    id uuid primary key default gen_random_uuid(),
    contract_id uuid not null references contracts(id),
    member_id uuid not null references members(id),
    branch_id uuid not null references branches(id),
    amount numeric not null,
    payment_method varchar not null,
    payment_date timestamptz not null,
    type varchar not null,
    receipt_no varchar,
    notes varchar,
    created_by uuid references employees(id),
    created_at timestamptz not null default now(),
    tenant_id uuid references tenants(id)
);

create index if not exists payments_tenant_id_idx on payments(tenant_id);
create index if not exists payments_contract_id_idx on payments(contract_id);
create index if not exists payments_member_id_idx on payments(member_id);
create index if not exists payments_branch_id_idx on payments(branch_id);

create table if not exists check_ins (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    date_created timestamptz default now(),
    date_updated timestamptz default now(),
    member_id uuid not null references members(id),
    branch_id uuid not null references branches(id),
    contract_id uuid references contracts(id),
    check_in_time timestamptz default now(),
    check_in_type varchar,
    check_in_method varchar,
    processed_by_id uuid references employees(id),
    location_ip varchar,
    location_device varchar,
    notes text
);

create index if not exists check_ins_member_id_idx on check_ins(member_id);
create index if not exists check_ins_branch_id_idx on check_ins(branch_id);
create index if not exists check_ins_contract_id_idx on check_ins(contract_id);
create index if not exists check_ins_check_in_time_idx on check_ins(check_in_time);

create table if not exists classes (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    name varchar not null,
    description text,
    duration_minutes integer not null,
    max_capacity integer not null,
    instructor_id uuid references employees(id),
    branch_id uuid not null references branches(id),
    category varchar,
    difficulty_level varchar,
    image_url varchar,
    is_active boolean default true,
    requires_count boolean default false,
    count_deduction integer default 1
);

create index if not exists classes_branch_id_idx on classes(branch_id);
create index if not exists classes_instructor_id_idx on classes(instructor_id);

create table if not exists class_schedules (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    class_id uuid not null references classes(id),
    branch_id uuid not null references branches(id),
    instructor_id uuid references employees(id),
    day_of_week integer not null,
    start_time time not null,
    end_time time not null,
    room varchar,
    max_capacity integer default 20,
    is_recurring boolean default true,
    valid_from date,
    valid_until date
);

create table if not exists class_sessions (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    schedule_id uuid references class_schedules(id),
    class_id uuid not null references classes(id),
    branch_id uuid not null references branches(id),
    instructor_id uuid references employees(id),
    session_date date not null,
    start_time time not null,
    end_time time not null,
    room varchar,
    max_capacity integer not null,
    current_count integer default 0,
    waitlist_count integer default 0,
    session_status varchar default 'SCHEDULED',
    cancelled_reason text,
    cancelled_at timestamptz,
    cancelled_by uuid references employees(id)
);

create table if not exists bookings (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    session_id uuid not null references class_sessions(id),
    member_id uuid not null references members(id),
    contract_id uuid references contracts(id),
    booking_status varchar default 'CONFIRMED',
    waitlist_position integer,
    booked_at timestamptz default now(),
    cancelled_at timestamptz,
    cancel_reason text,
    attended_at timestamptz,
    count_deducted boolean default false
);

create index if not exists class_schedules_class_id_idx on class_schedules(class_id);
create index if not exists class_schedules_branch_id_idx on class_schedules(branch_id);
create index if not exists class_sessions_class_id_idx on class_sessions(class_id);
create index if not exists class_sessions_branch_id_idx on class_sessions(branch_id);
create index if not exists class_sessions_session_date_idx on class_sessions(session_date);
create index if not exists bookings_session_id_idx on bookings(session_id);
create index if not exists bookings_member_id_idx on bookings(member_id);
create index if not exists bookings_contract_id_idx on bookings(contract_id);

create table if not exists attendances (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    employee_id uuid not null references employees(id),
    branch_id uuid references branches(id),
    attendance_date date,
    check_in timestamptz,
    check_out timestamptz,
    check_type varchar default 'REGULAR',
    attendance_status varchar default 'PRESENT',
    late_minutes integer default 0,
    early_leave_minutes integer default 0,
    work_hours numeric,
    overtime_hours numeric default 0,
    location_ip varchar,
    location_gps varchar,
    notes text
);

alter table attendances add column if not exists branch_id uuid references branches(id);
alter table attendances add column if not exists attendance_date date;
alter table attendances add column if not exists check_type varchar default 'REGULAR';
alter table attendances add column if not exists attendance_status varchar default 'PRESENT';
alter table attendances add column if not exists late_minutes integer default 0;
alter table attendances add column if not exists early_leave_minutes integer default 0;
alter table attendances add column if not exists overtime_hours numeric default 0;
alter table attendances add column if not exists notes text;
update attendances set attendance_date = coalesce(attendance_date, check_in::date, created_at::date) where attendance_date is null;

create index if not exists attendances_employee_id_idx on attendances(employee_id);
create index if not exists attendances_branch_id_idx on attendances(branch_id);
create index if not exists attendances_attendance_date_idx on attendances(attendance_date);

create table if not exists leave_requests (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    employee_id uuid not null references employees(id),
    leave_type varchar not null,
    start_date timestamptz not null,
    end_date timestamptz not null,
    leave_status varchar not null default 'PENDING',
    approver_id uuid references employees(id),
    reason text,
    hours_requested numeric,
    days_requested numeric,
    submitted_at timestamptz,
    approved_at timestamptz,
    approval_notes text,
    document_url varchar,
    is_half_day boolean default false,
    half_day_type varchar
);

alter table leave_requests add column if not exists status varchar default 'ACTIVE';
alter table leave_requests add column if not exists updated_at timestamptz default now();
alter table leave_requests add column if not exists hours_requested numeric;
alter table leave_requests add column if not exists days_requested numeric;
alter table leave_requests add column if not exists submitted_at timestamptz;
alter table leave_requests add column if not exists approved_at timestamptz;
alter table leave_requests add column if not exists approval_notes text;
alter table leave_requests add column if not exists document_url varchar;
alter table leave_requests add column if not exists is_half_day boolean default false;
alter table leave_requests add column if not exists half_day_type varchar;

create table if not exists leave_balances (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    employee_id uuid not null references employees(id),
    leave_type varchar not null,
    year integer not null,
    total_days numeric not null default 0,
    used_days numeric not null default 0,
    pending_days numeric not null default 0,
    carried_over_days numeric not null default 0,
    expires_at timestamptz
);

create table if not exists leave_approval_logs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    leave_request_id uuid not null references leave_requests(id),
    action_by uuid not null references employees(id),
    action varchar not null,
    previous_status varchar,
    new_status varchar,
    notes text
);

create index if not exists leave_requests_employee_id_idx on leave_requests(employee_id);
create index if not exists leave_requests_leave_status_idx on leave_requests(leave_status);
create index if not exists leave_balances_employee_id_idx on leave_balances(employee_id);
create index if not exists leave_approval_logs_leave_request_id_idx on leave_approval_logs(leave_request_id);

create table if not exists shift_schedules (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'published',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    branch_id uuid not null references branches(id),
    name varchar not null,
    start_time time not null,
    end_time time not null,
    break_start time,
    break_end time,
    grace_period_minutes integer default 15,
    early_leave_minutes integer default 15,
    overtime_start_after time,
    is_default boolean default false,
    applicable_days jsonb default '["MON","TUE","WED","THU","FRI"]'::jsonb,
    tenant_id uuid references tenants(id)
);

create table if not exists employee_shifts (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    employee_id uuid not null references employees(id),
    shift_schedule_id uuid not null references shift_schedules(id),
    effective_date date not null,
    end_date date,
    tenant_id uuid references tenants(id)
);

create index if not exists shift_schedules_tenant_id_idx on shift_schedules(tenant_id);
create index if not exists shift_schedules_branch_id_idx on shift_schedules(branch_id);
create index if not exists employee_shifts_tenant_id_idx on employee_shifts(tenant_id);
create index if not exists employee_shifts_employee_id_idx on employee_shifts(employee_id);
create index if not exists employee_shifts_shift_schedule_id_idx on employee_shifts(shift_schedule_id);

create table if not exists makeup_requests (
    id uuid primary key default gen_random_uuid(),
    status varchar default 'ACTIVE',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    employee_id uuid not null references employees(id),
    branch_id uuid not null references branches(id),
    target_date date not null,
    makeup_type varchar not null,
    requested_check_in time,
    requested_check_out time,
    reason text not null,
    document_url varchar,
    request_status varchar not null default 'PENDING',
    approver_id uuid references employees(id),
    approved_at timestamptz,
    approval_notes text,
    submitted_at timestamptz
);

create table if not exists makeup_approval_logs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    makeup_request_id uuid not null references makeup_requests(id),
    action_by uuid not null references employees(id),
    action varchar not null,
    previous_status varchar,
    new_status varchar,
    notes text
);

create index if not exists makeup_requests_employee_id_idx on makeup_requests(employee_id);
create index if not exists makeup_requests_request_status_idx on makeup_requests(request_status);
create index if not exists makeup_approval_logs_makeup_request_id_idx on makeup_approval_logs(makeup_request_id);

create table if not exists payroll_salary_records (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    employee_id uuid not null references employees(id),
    period varchar not null,
    base_salary numeric not null default 0,
    overtime_hours numeric not null default 0,
    overtime_pay numeric not null default 0,
    commission numeric not null default 0,
    bonus numeric not null default 0,
    deductions numeric not null default 0,
    net_salary numeric not null default 0,
    hourly_rate numeric,
    work_days integer not null default 0,
    leave_days jsonb,
    notes text,
    status varchar not null default 'PENDING',
    approved_by uuid references employees(id),
    approved_at timestamptz,
    paid_at timestamptz,
    tenant_id uuid references tenants(id)
);

create table if not exists payroll_promotions (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    employee_id uuid not null references employees(id),
    type varchar not null,
    from_job_title_id uuid references job_titles(id),
    to_job_title_id uuid references job_titles(id),
    from_branch_id uuid references branches(id),
    to_branch_id uuid references branches(id),
    effective_date date not null,
    new_base_salary numeric,
    reason text,
    tenant_id uuid references tenants(id)
);

create index if not exists payroll_salary_records_tenant_id_idx on payroll_salary_records(tenant_id);
create index if not exists payroll_salary_records_employee_id_idx on payroll_salary_records(employee_id);
create index if not exists payroll_salary_records_period_idx on payroll_salary_records(period);
create index if not exists payroll_promotions_tenant_id_idx on payroll_promotions(tenant_id);
create index if not exists payroll_promotions_employee_id_idx on payroll_promotions(employee_id);

create table if not exists kpi_templates (
    id uuid primary key default gen_random_uuid(),
    name varchar not null,
    description text,
    job_title_id uuid references job_titles(id),
    review_type varchar not null default 'MONTHLY',
    kpis jsonb not null default '[]'::jsonb,
    is_default boolean not null default false,
    is_active boolean not null default true,
    created_by uuid references employees(id),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    tenant_id uuid references tenants(id)
);

create table if not exists performance_reviews (
    id uuid primary key default gen_random_uuid(),
    employee_id uuid not null references employees(id),
    reviewer_id uuid references employees(id),
    review_period varchar not null,
    review_type varchar not null,
    kpi_data jsonb not null default '[]'::jsonb,
    scores jsonb,
    overall_score numeric,
    strengths text,
    improvements text,
    improvement_plan text,
    goals jsonb,
    self_assessment text,
    reviewer_comments text,
    status varchar not null default 'DRAFT',
    submitted_at timestamptz,
    reviewed_at timestamptz,
    approved_by uuid references employees(id),
    approved_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    tenant_id uuid references tenants(id)
);

create index if not exists kpi_templates_tenant_id_idx on kpi_templates(tenant_id);
create index if not exists kpi_templates_job_title_id_idx on kpi_templates(job_title_id);
create index if not exists performance_reviews_tenant_id_idx on performance_reviews(tenant_id);
create index if not exists performance_reviews_employee_id_idx on performance_reviews(employee_id);
create index if not exists performance_reviews_reviewer_id_idx on performance_reviews(reviewer_id);
create index if not exists performance_reviews_status_idx on performance_reviews(status);
create index if not exists performance_reviews_review_period_idx on performance_reviews(review_period);

create table if not exists member_goals (
    id uuid primary key default gen_random_uuid(),
    member_id uuid not null references members(id),
    goal_type varchar not null,
    target_value jsonb not null,
    current_value jsonb,
    start_date date not null default current_date,
    target_date date,
    status varchar not null default 'IN_PROGRESS',
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists workout_logs (
    id uuid primary key default gen_random_uuid(),
    member_id uuid not null references members(id),
    date date not null default current_date,
    duration integer,
    calories integer,
    exercises jsonb,
    notes text,
    created_at timestamptz default now()
);

create table if not exists body_measurements (
    id uuid primary key default gen_random_uuid(),
    member_id uuid not null references members(id),
    date date not null default current_date,
    weight real,
    body_fat real,
    muscle_mass real,
    bmi real,
    source varchar not null default 'MANUAL',
    raw_data jsonb,
    created_at timestamptz default now()
);

create index if not exists member_goals_member_id_idx on member_goals(member_id);
create index if not exists member_goals_status_idx on member_goals(status);
create index if not exists workout_logs_member_id_idx on workout_logs(member_id);
create index if not exists workout_logs_date_idx on workout_logs(date);
create index if not exists body_measurements_member_id_idx on body_measurements(member_id);
create index if not exists body_measurements_date_idx on body_measurements(date);
