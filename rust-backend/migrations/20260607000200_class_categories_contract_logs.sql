create table if not exists class_categories (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id),
    status varchar not null default 'published',
    sort integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz,
    created_by uuid references employees(id),
    updated_by uuid references employees(id),
    code varchar not null,
    name varchar not null,
    name_en varchar,
    parent_id uuid references class_categories(id),
    icon varchar,
    color varchar not null default '#6366f1',
    image_url varchar,
    description text,
    is_active boolean not null default true,
    requires_equipment boolean not null default false,
    equipment_list jsonb not null default '[]'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    owner_branch_id uuid references branches(id),
    visibility varchar not null default 'shared',
    unique (tenant_id, code)
);

create index if not exists class_categories_tenant_id_idx on class_categories(tenant_id);
create index if not exists class_categories_parent_id_idx on class_categories(parent_id);
create index if not exists class_categories_owner_branch_id_idx on class_categories(owner_branch_id);

create table if not exists contract_logs (
    id uuid primary key default gen_random_uuid(),
    contract_id uuid not null references contracts(id),
    log_type varchar not null,
    start_date date,
    end_date date,
    days_affected integer,
    reason text,
    created_by_employee uuid references employees(id),
    original_member_id uuid references members(id),
    target_member_id uuid references members(id),
    branch_id uuid references branches(id),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz,
    tenant_id uuid not null references tenants(id)
);

create index if not exists contract_logs_tenant_id_idx on contract_logs(tenant_id);
create index if not exists contract_logs_contract_id_idx on contract_logs(contract_id);
create index if not exists contract_logs_branch_id_idx on contract_logs(branch_id);
