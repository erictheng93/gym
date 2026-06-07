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
