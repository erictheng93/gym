create table if not exists leads (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id),
    branch_id uuid references branches(id),
    name varchar not null,
    phone varchar not null,
    email varchar,
    source varchar not null default 'WALK_IN',
    utm_source varchar,
    utm_medium varchar,
    utm_campaign varchar,
    assigned_to uuid references employees(id),
    status varchar not null default 'NEW',
    interest jsonb,
    notes text,
    converted_member_id uuid references members(id),
    converted_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table leads add column if not exists tenant_id uuid references tenants(id);
alter table leads add column if not exists branch_id uuid references branches(id);
alter table leads add column if not exists name varchar;
alter table leads add column if not exists full_name varchar;
alter table leads add column if not exists phone varchar;
alter table leads add column if not exists email varchar;
alter table leads add column if not exists source varchar default 'WALK_IN';
alter table leads add column if not exists utm_source varchar;
alter table leads add column if not exists utm_medium varchar;
alter table leads add column if not exists utm_campaign varchar;
alter table leads add column if not exists assigned_to uuid references employees(id);
alter table leads add column if not exists status varchar default 'NEW';
alter table leads add column if not exists interest jsonb;
alter table leads add column if not exists notes text;
alter table leads add column if not exists converted_member_id uuid references members(id);
alter table leads add column if not exists converted_at timestamptz;
alter table leads add column if not exists created_at timestamptz default now();
alter table leads add column if not exists updated_at timestamptz default now();

create index if not exists leads_tenant_id_idx on leads(tenant_id);
create index if not exists leads_branch_id_idx on leads(branch_id);
create index if not exists leads_assigned_to_idx on leads(assigned_to);
create index if not exists leads_status_idx on leads(status);

create table if not exists lead_activities (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id),
    lead_id uuid not null references leads(id) on delete cascade,
    activity_type varchar not null,
    content text not null,
    result text,
    next_action text,
    next_action_date date,
    created_by uuid references employees(id),
    created_at timestamptz default now()
);

alter table lead_activities add column if not exists tenant_id uuid references tenants(id);
alter table lead_activities add column if not exists lead_id uuid references leads(id);
alter table lead_activities add column if not exists activity_type varchar;
alter table lead_activities add column if not exists content text;
alter table lead_activities add column if not exists result text;
alter table lead_activities add column if not exists next_action text;
alter table lead_activities add column if not exists next_action_date date;
alter table lead_activities add column if not exists created_by uuid references employees(id);
alter table lead_activities add column if not exists created_at timestamptz default now();

create index if not exists lead_activities_tenant_id_idx on lead_activities(tenant_id);
create index if not exists lead_activities_lead_id_idx on lead_activities(lead_id);

create table if not exists campaigns (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id),
    name varchar not null,
    type varchar not null,
    description text,
    start_date date not null,
    end_date date not null,
    target_audience jsonb,
    budget numeric,
    actual_cost numeric,
    status varchar not null default 'DRAFT',
    metrics jsonb not null default '{}'::jsonb,
    created_by uuid references employees(id),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table campaigns add column if not exists tenant_id uuid references tenants(id);
alter table campaigns add column if not exists name varchar;
alter table campaigns add column if not exists type varchar;
alter table campaigns add column if not exists description text;
alter table campaigns add column if not exists start_date date;
alter table campaigns add column if not exists end_date date;
alter table campaigns add column if not exists target_audience jsonb;
alter table campaigns add column if not exists budget numeric;
alter table campaigns add column if not exists actual_cost numeric;
alter table campaigns add column if not exists status varchar default 'DRAFT';
alter table campaigns add column if not exists metrics jsonb default '{}'::jsonb;
alter table campaigns add column if not exists created_by uuid references employees(id);
alter table campaigns add column if not exists created_at timestamptz default now();
alter table campaigns add column if not exists updated_at timestamptz default now();

create index if not exists campaigns_tenant_id_idx on campaigns(tenant_id);
create index if not exists campaigns_type_idx on campaigns(type);
create index if not exists campaigns_status_idx on campaigns(status);

create table if not exists campaign_assets (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id),
    campaign_id uuid not null references campaigns(id) on delete cascade,
    name varchar not null,
    type varchar not null,
    category varchar,
    file_id uuid,
    content text,
    created_by uuid references employees(id),
    created_at timestamptz default now()
);

create index if not exists campaign_assets_tenant_id_idx on campaign_assets(tenant_id);
create index if not exists campaign_assets_campaign_id_idx on campaign_assets(campaign_id);

create table if not exists coupons (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id),
    code varchar not null,
    name varchar not null,
    discount_type varchar not null,
    discount_value numeric not null,
    min_purchase numeric not null default 0,
    max_discount numeric,
    usage_limit integer,
    usage_per_member integer not null default 1,
    used_count integer not null default 0,
    applicable_plans jsonb,
    start_date date not null,
    end_date date not null,
    status varchar not null default 'ACTIVE',
    created_by uuid references employees(id),
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (tenant_id, code)
);

alter table coupons add column if not exists tenant_id uuid references tenants(id);
alter table coupons add column if not exists code varchar;
alter table coupons add column if not exists name varchar;
alter table coupons add column if not exists discount_type varchar;
alter table coupons add column if not exists discount_value numeric;
alter table coupons add column if not exists min_purchase numeric default 0;
alter table coupons add column if not exists max_discount numeric;
alter table coupons add column if not exists usage_limit integer;
alter table coupons add column if not exists usage_per_member integer default 1;
alter table coupons add column if not exists used_count integer default 0;
alter table coupons add column if not exists applicable_plans jsonb;
alter table coupons add column if not exists start_date date;
alter table coupons add column if not exists valid_from date;
alter table coupons add column if not exists end_date date;
alter table coupons add column if not exists valid_until date;
alter table coupons add column if not exists status varchar default 'ACTIVE';
alter table coupons add column if not exists created_by uuid references employees(id);
alter table coupons add column if not exists created_at timestamptz default now();
alter table coupons add column if not exists updated_at timestamptz default now();

create index if not exists coupons_tenant_id_idx on coupons(tenant_id);
create index if not exists coupons_status_idx on coupons(status);
create index if not exists coupons_discount_type_idx on coupons(discount_type);
create unique index if not exists coupons_tenant_code_uidx on coupons(tenant_id, code);

create table if not exists coupon_usages (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id),
    coupon_id uuid not null references coupons(id),
    member_id uuid not null references members(id),
    contract_id uuid references contracts(id),
    discount_amount numeric not null,
    used_at timestamptz not null default now(),
    used_by uuid references employees(id)
);

alter table coupon_usages add column if not exists tenant_id uuid references tenants(id);
alter table coupon_usages add column if not exists coupon_id uuid references coupons(id);
alter table coupon_usages add column if not exists member_id uuid references members(id);
alter table coupon_usages add column if not exists contract_id uuid references contracts(id);
alter table coupon_usages add column if not exists discount_amount numeric;
alter table coupon_usages add column if not exists used_at timestamptz default now();
alter table coupon_usages add column if not exists used_by uuid references employees(id);

create index if not exists coupon_usages_tenant_id_idx on coupon_usages(tenant_id);
create index if not exists coupon_usages_coupon_id_idx on coupon_usages(coupon_id);
create index if not exists coupon_usages_member_id_idx on coupon_usages(member_id);

create table if not exists rfm_scores (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id),
    member_id uuid not null references members(id) on delete cascade,
    branch_id uuid not null references branches(id),
    recency_score integer not null,
    frequency_score integer not null,
    monetary_score integer not null,
    rfm_segment varchar not null,
    last_payment_date timestamptz,
    last_checkin_date timestamptz,
    total_payments_12m numeric not null default 0,
    total_checkins_12m integer not null default 0,
    calculated_at timestamptz not null default now(),
    unique (tenant_id, member_id)
);

create index if not exists rfm_scores_tenant_id_idx on rfm_scores(tenant_id);
create index if not exists rfm_scores_branch_id_idx on rfm_scores(branch_id);
create index if not exists rfm_scores_segment_idx on rfm_scores(rfm_segment);
