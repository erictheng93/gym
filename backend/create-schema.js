/**
 * 使用 schema/apply 建立完整資料表結構
 */

const DIRECTUS_URL = 'http://localhost:8500';
const ADMIN_EMAIL = 'admin@gym.com';
const ADMIN_PASSWORD = 'admin';

const schema = {
  version: 1,
  directus: '11.14.0',
  collections: [
    // branches
    {
      collection: 'branches',
      meta: { icon: 'store', note: '分店/場館管理', display_template: '{{name}}', hidden: false, singleton: false, accountability: 'all', archive_field: 'status', archive_value: 'archived', unarchive_value: 'active', sort_field: null },
      schema: { name: 'branches' }
    },
    // job_titles
    {
      collection: 'job_titles',
      meta: { icon: 'badge', note: '職位與權限定義', display_template: '{{name}}', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'job_titles' }
    },
    // employees
    {
      collection: 'employees',
      meta: { icon: 'people', note: '員工資料', display_template: '{{full_name}}', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'employees' }
    },
    // members
    {
      collection: 'members',
      meta: { icon: 'person', note: '會員資料', display_template: '{{member_code}} - {{full_name}}', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'members' }
    },
    // membership_plans
    {
      collection: 'membership_plans',
      meta: { icon: 'card_membership', note: '會籍/產品方案', display_template: '{{name}}', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'membership_plans' }
    },
    // contracts
    {
      collection: 'contracts',
      meta: { icon: 'description', note: '電子合約', display_template: '{{contract_no}}', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'contracts' }
    },
    // contract_logs
    {
      collection: 'contract_logs',
      meta: { icon: 'history', note: '合約異動紀錄', display_template: '{{log_type}}', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'contract_logs' }
    },
    // attendances
    {
      collection: 'attendances',
      meta: { icon: 'schedule', note: '員工打卡紀錄', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'attendances' }
    },
    // leave_requests
    {
      collection: 'leave_requests',
      meta: { icon: 'event_busy', note: '休假申請', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'leave_requests' }
    },
    // payments
    {
      collection: 'payments',
      meta: { icon: 'payments', note: '收付款紀錄', display_template: '{{amount}} - {{payment_method}}', hidden: false, singleton: false, accountability: 'all' },
      schema: { name: 'payments' }
    },
    // notifications
    {
      collection: 'notifications',
      meta: { icon: 'notifications', note: '系統通知', display_template: '{{title}}', hidden: false, singleton: false, accountability: 'all', archive_field: 'status', archive_value: 'archived', unarchive_value: 'active' },
      schema: { name: 'notifications' }
    }
  ],
  fields: [
    // ========== branches ==========
    { collection: 'branches', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'branches', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'branches', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'branches', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'branches', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'branches', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'branches', field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_updated', table: 'branches', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'branches', field: 'user_created', type: 'uuid', meta: { special: ['user-created'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: { name: 'user_created', table: 'branches', data_type: 'uuid', is_nullable: true } },
    { collection: 'branches', field: 'user_updated', type: 'uuid', meta: { special: ['user-updated'], interface: 'select-dropdown-m2o', readonly: true, hidden: true, width: 'half' }, schema: { name: 'user_updated', table: 'branches', data_type: 'uuid', is_nullable: true } },
    { collection: 'branches', field: 'name', type: 'string', meta: { interface: 'input', required: true, width: 'half', note: '分店名稱' }, schema: { name: 'name', table: 'branches', data_type: 'varchar', max_length: 255, is_nullable: false } },
    { collection: 'branches', field: 'type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '總店', value: 'HEADQUARTER' }, { text: '分店', value: 'BRANCH' }] } }, schema: { name: 'type', table: 'branches', data_type: 'varchar', max_length: 255, default_value: 'BRANCH', is_nullable: true } },
    { collection: 'branches', field: 'address', type: 'string', meta: { interface: 'input', width: 'full' }, schema: { name: 'address', table: 'branches', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'branches', field: 'phone', type: 'string', meta: { interface: 'input', width: 'half' }, schema: { name: 'phone', table: 'branches', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'branches', field: 'tax_id', type: 'string', meta: { interface: 'input', width: 'half', note: '統一編號' }, schema: { name: 'tax_id', table: 'branches', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'branches', field: 'settings', type: 'json', meta: { interface: 'input-code', options: { language: 'json' }, note: '分店設定' }, schema: { name: 'settings', table: 'branches', data_type: 'json', is_nullable: true } },

    // ========== job_titles ==========
    { collection: 'job_titles', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'job_titles', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'job_titles', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'job_titles', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'job_titles', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'job_titles', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'job_titles', field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_updated', table: 'job_titles', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'job_titles', field: 'name', type: 'string', meta: { interface: 'input', required: true, width: 'half', note: '職位名稱' }, schema: { name: 'name', table: 'job_titles', data_type: 'varchar', max_length: 255, is_nullable: false } },
    { collection: 'job_titles', field: 'permissions_config', type: 'json', meta: { interface: 'input-code', options: { language: 'json' }, note: '權限設定 JSON' }, schema: { name: 'permissions_config', table: 'job_titles', data_type: 'json', is_nullable: true } },

    // ========== employees ==========
    { collection: 'employees', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'employees', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'employees', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'employees', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'employees', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'employees', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'employees', field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_updated', table: 'employees', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'employees', field: 'employee_code', type: 'string', meta: { interface: 'input', width: 'half', note: '員工編號' }, schema: { name: 'employee_code', table: 'employees', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'employees', field: 'full_name', type: 'string', meta: { interface: 'input', required: true, width: 'half' }, schema: { name: 'full_name', table: 'employees', data_type: 'varchar', max_length: 255, is_nullable: false } },
    { collection: 'employees', field: 'user_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '關聯 Directus 帳號' }, schema: { name: 'user_id', table: 'employees', data_type: 'uuid', is_nullable: true, foreign_key_table: 'directus_users', foreign_key_column: 'id' } },
    { collection: 'employees', field: 'branch_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '所屬分店' }, schema: { name: 'branch_id', table: 'employees', data_type: 'uuid', is_nullable: true, foreign_key_table: 'branches', foreign_key_column: 'id' } },
    { collection: 'employees', field: 'job_title_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '職位' }, schema: { name: 'job_title_id', table: 'employees', data_type: 'uuid', is_nullable: true, foreign_key_table: 'job_titles', foreign_key_column: 'id' } },
    { collection: 'employees', field: 'employment_status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '在職', value: 'ACTIVE' }, { text: '離職', value: 'RESIGNED' }, { text: '留停', value: 'LEAVE' }] } }, schema: { name: 'employment_status', table: 'employees', data_type: 'varchar', max_length: 255, default_value: 'ACTIVE', is_nullable: true } },
    { collection: 'employees', field: 'employment_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '全職', value: 'FULL_TIME' }, { text: '兼職', value: 'PART_TIME' }, { text: '自由接案', value: 'FREELANCE' }] } }, schema: { name: 'employment_type', table: 'employees', data_type: 'varchar', max_length: 255, default_value: 'FULL_TIME', is_nullable: true } },
    { collection: 'employees', field: 'basic_salary', type: 'decimal', meta: { interface: 'input', width: 'half', note: '底薪' }, schema: { name: 'basic_salary', table: 'employees', data_type: 'numeric', numeric_precision: 10, numeric_scale: 2, is_nullable: true } },
    { collection: 'employees', field: 'custom_permissions', type: 'json', meta: { interface: 'input-code', options: { language: 'json' }, note: '個人權限覆寫' }, schema: { name: 'custom_permissions', table: 'employees', data_type: 'json', is_nullable: true } },

    // ========== members ==========
    { collection: 'members', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'members', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'members', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'members', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'members', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'members', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'members', field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_updated', table: 'members', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'members', field: 'member_code', type: 'string', meta: { interface: 'input', width: 'half', note: '會員編號', required: true }, schema: { name: 'member_code', table: 'members', data_type: 'varchar', max_length: 255, is_nullable: false, is_unique: true } },
    { collection: 'members', field: 'full_name', type: 'string', meta: { interface: 'input', required: true, width: 'half' }, schema: { name: 'full_name', table: 'members', data_type: 'varchar', max_length: 255, is_nullable: false } },
    { collection: 'members', field: 'phone', type: 'string', meta: { interface: 'input', width: 'half' }, schema: { name: 'phone', table: 'members', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'members', field: 'email', type: 'string', meta: { interface: 'input', width: 'half' }, schema: { name: 'email', table: 'members', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'members', field: 'branch_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '歸屬主場館' }, schema: { name: 'branch_id', table: 'members', data_type: 'uuid', is_nullable: true, foreign_key_table: 'branches', foreign_key_column: 'id' } },
    { collection: 'members', field: 'member_status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '有效', value: 'ACTIVE' }, { text: '過期', value: 'EXPIRED' }, { text: '暫停', value: 'SUSPENDED' }, { text: '黑名單', value: 'BANNED' }] } }, schema: { name: 'member_status', table: 'members', data_type: 'varchar', max_length: 255, default_value: 'ACTIVE', is_nullable: true } },
    { collection: 'members', field: 'join_date', type: 'date', meta: { interface: 'datetime', width: 'half', note: '加入日期' }, schema: { name: 'join_date', table: 'members', data_type: 'date', is_nullable: true } },
    { collection: 'members', field: 'sales_person_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '負責業務/教練' }, schema: { name: 'sales_person_id', table: 'members', data_type: 'uuid', is_nullable: true, foreign_key_table: 'employees', foreign_key_column: 'id' } },
    { collection: 'members', field: 'tags', type: 'json', meta: { interface: 'tags', note: '標籤' }, schema: { name: 'tags', table: 'members', data_type: 'json', is_nullable: true } },
    { collection: 'members', field: 'gender', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '男', value: 'M' }, { text: '女', value: 'F' }, { text: '其他', value: 'O' }] } }, schema: { name: 'gender', table: 'members', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'members', field: 'birthday', type: 'date', meta: { interface: 'datetime', width: 'half' }, schema: { name: 'birthday', table: 'members', data_type: 'date', is_nullable: true } },
    { collection: 'members', field: 'height', type: 'float', meta: { interface: 'input', width: 'half', note: '身高 (cm)' }, schema: { name: 'height', table: 'members', data_type: 'real', is_nullable: true } },
    { collection: 'members', field: 'emergency_contact', type: 'string', meta: { interface: 'input', width: 'half', note: '緊急聯絡人' }, schema: { name: 'emergency_contact', table: 'members', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'members', field: 'emergency_phone', type: 'string', meta: { interface: 'input', width: 'half', note: '緊急聯絡電話' }, schema: { name: 'emergency_phone', table: 'members', data_type: 'varchar', max_length: 255, is_nullable: true } },

    // ========== membership_plans ==========
    { collection: 'membership_plans', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'membership_plans', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'membership_plans', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'membership_plans', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'membership_plans', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'membership_plans', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'membership_plans', field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_updated', table: 'membership_plans', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'membership_plans', field: 'name', type: 'string', meta: { interface: 'input', required: true, width: 'half', note: '方案名稱' }, schema: { name: 'name', table: 'membership_plans', data_type: 'varchar', max_length: 255, is_nullable: false } },
    { collection: 'membership_plans', field: 'plan_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', required: true, options: { choices: [{ text: '期限制 (月/年)', value: 'TIME_BASED' }, { text: '點數/堂數制', value: 'COUNT_BASED' }] } }, schema: { name: 'plan_type', table: 'membership_plans', data_type: 'varchar', max_length: 255, is_nullable: false } },
    { collection: 'membership_plans', field: 'duration_months', type: 'integer', meta: { interface: 'input', width: 'half', note: '期限 (月數)' }, schema: { name: 'duration_months', table: 'membership_plans', data_type: 'integer', is_nullable: true } },
    { collection: 'membership_plans', field: 'class_counts', type: 'integer', meta: { interface: 'input', width: 'half', note: '包含堂數' }, schema: { name: 'class_counts', table: 'membership_plans', data_type: 'integer', is_nullable: true } },
    { collection: 'membership_plans', field: 'price', type: 'decimal', meta: { interface: 'input', width: 'half', required: true, note: '售價' }, schema: { name: 'price', table: 'membership_plans', data_type: 'numeric', numeric_precision: 10, numeric_scale: 2, is_nullable: false } },
    { collection: 'membership_plans', field: 'allow_transfer', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: '允許轉讓' }, schema: { name: 'allow_transfer', table: 'membership_plans', data_type: 'boolean', default_value: false, is_nullable: true } },
    { collection: 'membership_plans', field: 'allow_pause', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: '允許請假暫停' }, schema: { name: 'allow_pause', table: 'membership_plans', data_type: 'boolean', default_value: true, is_nullable: true } },
    { collection: 'membership_plans', field: 'description', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: '方案說明' }, schema: { name: 'description', table: 'membership_plans', data_type: 'text', is_nullable: true } },

    // ========== contracts ==========
    { collection: 'contracts', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'contracts', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'contracts', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'contracts', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'contracts', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'contracts', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'contracts', field: 'date_updated', type: 'timestamp', meta: { special: ['date-updated'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_updated', table: 'contracts', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'contracts', field: 'contract_no', type: 'string', meta: { interface: 'input', width: 'half', note: '合約編號', required: true }, schema: { name: 'contract_no', table: 'contracts', data_type: 'varchar', max_length: 255, is_nullable: false, is_unique: true } },
    { collection: 'contracts', field: 'member_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', required: true, note: '會員' }, schema: { name: 'member_id', table: 'contracts', data_type: 'uuid', is_nullable: true, foreign_key_table: 'members', foreign_key_column: 'id' } },
    { collection: 'contracts', field: 'plan_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', required: true, note: '會籍方案' }, schema: { name: 'plan_id', table: 'contracts', data_type: 'uuid', is_nullable: true, foreign_key_table: 'membership_plans', foreign_key_column: 'id' } },
    { collection: 'contracts', field: 'sign_date', type: 'timestamp', meta: { interface: 'datetime', width: 'half', note: '簽約時間' }, schema: { name: 'sign_date', table: 'contracts', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'contracts', field: 'start_date', type: 'date', meta: { interface: 'datetime', width: 'half', required: true, note: '生效日' }, schema: { name: 'start_date', table: 'contracts', data_type: 'date', is_nullable: true } },
    { collection: 'contracts', field: 'end_date', type: 'date', meta: { interface: 'datetime', width: 'half', note: '到期日 (含順延)' }, schema: { name: 'end_date', table: 'contracts', data_type: 'date', is_nullable: true } },
    { collection: 'contracts', field: 'original_end_date', type: 'date', meta: { interface: 'datetime', width: 'half', note: '原始到期日' }, schema: { name: 'original_end_date', table: 'contracts', data_type: 'date', is_nullable: true } },
    { collection: 'contracts', field: 'contract_status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '草稿', value: 'DRAFT' }, { text: '有效', value: 'ACTIVE' }, { text: '暫停中', value: 'PAUSED' }, { text: '已過期', value: 'EXPIRED' }, { text: '已解約', value: 'TERMINATED' }] } }, schema: { name: 'contract_status', table: 'contracts', data_type: 'varchar', max_length: 255, default_value: 'DRAFT', is_nullable: true } },
    { collection: 'contracts', field: 'remaining_counts', type: 'integer', meta: { interface: 'input', width: 'half', note: '剩餘堂數' }, schema: { name: 'remaining_counts', table: 'contracts', data_type: 'integer', is_nullable: true } },
    { collection: 'contracts', field: 'total_amount', type: 'decimal', meta: { interface: 'input', width: 'half', required: true, note: '合約總金額' }, schema: { name: 'total_amount', table: 'contracts', data_type: 'numeric', numeric_precision: 10, numeric_scale: 2, is_nullable: true } },
    { collection: 'contracts', field: 'payment_status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '未付款', value: 'UNPAID' }, { text: '部分付款', value: 'PARTIAL' }, { text: '已付清', value: 'PAID' }] } }, schema: { name: 'payment_status', table: 'contracts', data_type: 'varchar', max_length: 255, default_value: 'UNPAID', is_nullable: true } },
    { collection: 'contracts', field: 'digital_signature', type: 'uuid', meta: { interface: 'file-image', width: 'half', note: '電子簽名' }, schema: { name: 'digital_signature', table: 'contracts', data_type: 'uuid', is_nullable: true } },
    { collection: 'contracts', field: 'contract_pdf', type: 'uuid', meta: { interface: 'file', width: 'half', note: 'PDF 合約存檔' }, schema: { name: 'contract_pdf', table: 'contracts', data_type: 'uuid', is_nullable: true } },
    { collection: 'contracts', field: 'sales_person_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '簽約業務' }, schema: { name: 'sales_person_id', table: 'contracts', data_type: 'uuid', is_nullable: true, foreign_key_table: 'employees', foreign_key_column: 'id' } },
    { collection: 'contracts', field: 'branch_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '簽約分店' }, schema: { name: 'branch_id', table: 'contracts', data_type: 'uuid', is_nullable: true, foreign_key_table: 'branches', foreign_key_column: 'id' } },
    { collection: 'contracts', field: 'notes', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: '備註' }, schema: { name: 'notes', table: 'contracts', data_type: 'text', is_nullable: true } },

    // ========== contract_logs ==========
    { collection: 'contract_logs', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'contract_logs', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'contract_logs', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'contract_logs', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'contract_logs', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'contract_logs', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'contract_logs', field: 'contract_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', required: true, note: '合約' }, schema: { name: 'contract_id', table: 'contract_logs', data_type: 'uuid', is_nullable: true, foreign_key_table: 'contracts', foreign_key_column: 'id' } },
    { collection: 'contract_logs', field: 'log_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', required: true, options: { choices: [{ text: '請假暫停', value: 'PAUSE' }, { text: '展延', value: 'EXTENSION' }, { text: '轉讓', value: 'TRANSFER' }] } }, schema: { name: 'log_type', table: 'contract_logs', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'contract_logs', field: 'start_date', type: 'date', meta: { interface: 'datetime', width: 'half', note: '開始日期' }, schema: { name: 'start_date', table: 'contract_logs', data_type: 'date', is_nullable: true } },
    { collection: 'contract_logs', field: 'end_date', type: 'date', meta: { interface: 'datetime', width: 'half', note: '結束日期' }, schema: { name: 'end_date', table: 'contract_logs', data_type: 'date', is_nullable: true } },
    { collection: 'contract_logs', field: 'days_affected', type: 'integer', meta: { interface: 'input', width: 'half', note: '影響天數' }, schema: { name: 'days_affected', table: 'contract_logs', data_type: 'integer', is_nullable: true } },
    { collection: 'contract_logs', field: 'reason', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: '原因說明' }, schema: { name: 'reason', table: 'contract_logs', data_type: 'text', is_nullable: true } },
    { collection: 'contract_logs', field: 'created_by_employee', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '操作人員' }, schema: { name: 'created_by_employee', table: 'contract_logs', data_type: 'uuid', is_nullable: true, foreign_key_table: 'employees', foreign_key_column: 'id' } },

    // ========== attendances ==========
    { collection: 'attendances', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'attendances', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'attendances', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'attendances', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'attendances', field: 'employee_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', required: true, note: '員工' }, schema: { name: 'employee_id', table: 'attendances', data_type: 'uuid', is_nullable: true, foreign_key_table: 'employees', foreign_key_column: 'id' } },
    { collection: 'attendances', field: 'check_in', type: 'timestamp', meta: { interface: 'datetime', width: 'half', note: '上班打卡' }, schema: { name: 'check_in', table: 'attendances', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'attendances', field: 'check_out', type: 'timestamp', meta: { interface: 'datetime', width: 'half', note: '下班打卡' }, schema: { name: 'check_out', table: 'attendances', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'attendances', field: 'work_hours', type: 'float', meta: { interface: 'input', width: 'half', note: '工時 (小時)' }, schema: { name: 'work_hours', table: 'attendances', data_type: 'real', is_nullable: true } },
    { collection: 'attendances', field: 'location_ip', type: 'string', meta: { interface: 'input', width: 'half', note: '打卡 IP' }, schema: { name: 'location_ip', table: 'attendances', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'attendances', field: 'location_gps', type: 'string', meta: { interface: 'input', width: 'half', note: 'GPS 座標' }, schema: { name: 'location_gps', table: 'attendances', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'attendances', field: 'branch_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '打卡分店' }, schema: { name: 'branch_id', table: 'attendances', data_type: 'uuid', is_nullable: true, foreign_key_table: 'branches', foreign_key_column: 'id' } },

    // ========== leave_requests ==========
    { collection: 'leave_requests', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'leave_requests', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'leave_requests', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'leave_requests', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'leave_requests', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'leave_requests', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'leave_requests', field: 'employee_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', required: true, note: '員工' }, schema: { name: 'employee_id', table: 'leave_requests', data_type: 'uuid', is_nullable: true, foreign_key_table: 'employees', foreign_key_column: 'id' } },
    { collection: 'leave_requests', field: 'leave_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', required: true, options: { choices: [{ text: '病假', value: 'SICK' }, { text: '年假', value: 'ANNUAL' }, { text: '事假', value: 'PERSONAL' }, { text: '補休', value: 'COMPENSATORY' }] } }, schema: { name: 'leave_type', table: 'leave_requests', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'leave_requests', field: 'start_date', type: 'timestamp', meta: { interface: 'datetime', width: 'half', required: true }, schema: { name: 'start_date', table: 'leave_requests', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'leave_requests', field: 'end_date', type: 'timestamp', meta: { interface: 'datetime', width: 'half', required: true }, schema: { name: 'end_date', table: 'leave_requests', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'leave_requests', field: 'leave_status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '待審核', value: 'PENDING' }, { text: '已核准', value: 'APPROVED' }, { text: '已駁回', value: 'REJECTED' }] } }, schema: { name: 'leave_status', table: 'leave_requests', data_type: 'varchar', max_length: 255, default_value: 'PENDING', is_nullable: true } },
    { collection: 'leave_requests', field: 'approver_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '核准人' }, schema: { name: 'approver_id', table: 'leave_requests', data_type: 'uuid', is_nullable: true, foreign_key_table: 'employees', foreign_key_column: 'id' } },
    { collection: 'leave_requests', field: 'reason', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: '請假原因' }, schema: { name: 'reason', table: 'leave_requests', data_type: 'text', is_nullable: true } },

    // ========== payments ==========
    { collection: 'payments', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'payments', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'payments', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'payments', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'payments', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'payments', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'payments', field: 'contract_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '關聯合約' }, schema: { name: 'contract_id', table: 'payments', data_type: 'uuid', is_nullable: true, foreign_key_table: 'contracts', foreign_key_column: 'id' } },
    { collection: 'payments', field: 'member_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '會員' }, schema: { name: 'member_id', table: 'payments', data_type: 'uuid', is_nullable: true, foreign_key_table: 'members', foreign_key_column: 'id' } },
    { collection: 'payments', field: 'amount', type: 'decimal', meta: { interface: 'input', width: 'half', required: true, note: '金額' }, schema: { name: 'amount', table: 'payments', data_type: 'numeric', numeric_precision: 10, numeric_scale: 2, is_nullable: false } },
    { collection: 'payments', field: 'payment_method', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '現金', value: 'CASH' }, { text: '信用卡', value: 'CREDIT_CARD' }, { text: 'LINE Pay', value: 'LINE_PAY' }, { text: '銀行轉帳', value: 'TRANSFER' }] } }, schema: { name: 'payment_method', table: 'payments', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'payments', field: 'payment_date', type: 'timestamp', meta: { interface: 'datetime', width: 'half', note: '付款時間' }, schema: { name: 'payment_date', table: 'payments', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'payments', field: 'payment_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: '收入', value: 'INCOME' }, { text: '退款', value: 'REFUND' }] } }, schema: { name: 'payment_type', table: 'payments', data_type: 'varchar', max_length: 255, default_value: 'INCOME', is_nullable: true } },
    { collection: 'payments', field: 'branch_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '業績歸屬分店' }, schema: { name: 'branch_id', table: 'payments', data_type: 'uuid', is_nullable: true, foreign_key_table: 'branches', foreign_key_column: 'id' } },
    { collection: 'payments', field: 'received_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '收款人員' }, schema: { name: 'received_by', table: 'payments', data_type: 'uuid', is_nullable: true, foreign_key_table: 'employees', foreign_key_column: 'id' } },
    { collection: 'payments', field: 'notes', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: '備註' }, schema: { name: 'notes', table: 'payments', data_type: 'text', is_nullable: true } },

    // ========== notifications ==========
    { collection: 'notifications', field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] }, schema: { name: 'id', table: 'notifications', data_type: 'uuid', is_primary_key: true, is_nullable: false, has_auto_increment: false } },
    { collection: 'notifications', field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'full', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { name: 'status', table: 'notifications', data_type: 'varchar', default_value: 'active', max_length: 255, is_nullable: true } },
    { collection: 'notifications', field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], interface: 'datetime', readonly: true, hidden: true, width: 'half' }, schema: { name: 'date_created', table: 'notifications', data_type: 'timestamp with time zone', is_nullable: true } },
    { collection: 'notifications', field: 'notification_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', required: true, options: { choices: [{ text: '7天到期提醒', value: 'expiring_7d' }, { text: '3天到期提醒', value: 'expiring_3d' }, { text: '1天到期提醒', value: 'expiring_1d' }, { text: '付款提醒', value: 'payment_reminder' }, { text: '系統通知', value: 'system' }] } }, schema: { name: 'notification_type', table: 'notifications', data_type: 'varchar', max_length: 255, is_nullable: false } },
    { collection: 'notifications', field: 'title', type: 'string', meta: { interface: 'input', width: 'full', required: true, note: '通知標題' }, schema: { name: 'title', table: 'notifications', data_type: 'varchar', max_length: 255, is_nullable: false } },
    { collection: 'notifications', field: 'message', type: 'text', meta: { interface: 'input-multiline', width: 'full', note: '通知內容' }, schema: { name: 'message', table: 'notifications', data_type: 'text', is_nullable: true } },
    { collection: 'notifications', field: 'reference_type', type: 'string', meta: { interface: 'input', width: 'half', note: '關聯類型 (contract_expiration, payment_due, etc.)' }, schema: { name: 'reference_type', table: 'notifications', data_type: 'varchar', max_length: 255, is_nullable: true } },
    { collection: 'notifications', field: 'reference_id', type: 'uuid', meta: { interface: 'input', width: 'half', note: '關聯 ID' }, schema: { name: 'reference_id', table: 'notifications', data_type: 'uuid', is_nullable: true } },
    { collection: 'notifications', field: 'branch_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '分店' }, schema: { name: 'branch_id', table: 'notifications', data_type: 'uuid', is_nullable: true, foreign_key_table: 'branches', foreign_key_column: 'id' } },
    { collection: 'notifications', field: 'target_user_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], width: 'half', note: '目標用戶' }, schema: { name: 'target_user_id', table: 'notifications', data_type: 'uuid', is_nullable: true, foreign_key_table: 'directus_users', foreign_key_column: 'id' } },
    { collection: 'notifications', field: 'is_read', type: 'boolean', meta: { interface: 'boolean', width: 'half', note: '已讀' }, schema: { name: 'is_read', table: 'notifications', data_type: 'boolean', default_value: false, is_nullable: true } },
    { collection: 'notifications', field: 'read_at', type: 'timestamp', meta: { interface: 'datetime', width: 'half', note: '已讀時間' }, schema: { name: 'read_at', table: 'notifications', data_type: 'timestamp with time zone', is_nullable: true } }
  ],
  relations: [
    // employees relations
    { collection: 'employees', field: 'user_id', related_collection: 'directus_users', meta: { many_collection: 'employees', many_field: 'user_id', one_collection: 'directus_users', one_field: null }, schema: { table: 'employees', column: 'user_id', foreign_key_table: 'directus_users', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'employees', field: 'branch_id', related_collection: 'branches', meta: { many_collection: 'employees', many_field: 'branch_id', one_collection: 'branches', one_field: 'employees' }, schema: { table: 'employees', column: 'branch_id', foreign_key_table: 'branches', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'employees', field: 'job_title_id', related_collection: 'job_titles', meta: { many_collection: 'employees', many_field: 'job_title_id', one_collection: 'job_titles', one_field: null }, schema: { table: 'employees', column: 'job_title_id', foreign_key_table: 'job_titles', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    // members relations
    { collection: 'members', field: 'branch_id', related_collection: 'branches', meta: { many_collection: 'members', many_field: 'branch_id', one_collection: 'branches', one_field: 'members' }, schema: { table: 'members', column: 'branch_id', foreign_key_table: 'branches', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'members', field: 'sales_person_id', related_collection: 'employees', meta: { many_collection: 'members', many_field: 'sales_person_id', one_collection: 'employees', one_field: null }, schema: { table: 'members', column: 'sales_person_id', foreign_key_table: 'employees', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    // contracts relations
    { collection: 'contracts', field: 'member_id', related_collection: 'members', meta: { many_collection: 'contracts', many_field: 'member_id', one_collection: 'members', one_field: 'contracts' }, schema: { table: 'contracts', column: 'member_id', foreign_key_table: 'members', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'CASCADE' } },
    { collection: 'contracts', field: 'plan_id', related_collection: 'membership_plans', meta: { many_collection: 'contracts', many_field: 'plan_id', one_collection: 'membership_plans', one_field: null }, schema: { table: 'contracts', column: 'plan_id', foreign_key_table: 'membership_plans', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'contracts', field: 'branch_id', related_collection: 'branches', meta: { many_collection: 'contracts', many_field: 'branch_id', one_collection: 'branches', one_field: null }, schema: { table: 'contracts', column: 'branch_id', foreign_key_table: 'branches', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'contracts', field: 'sales_person_id', related_collection: 'employees', meta: { many_collection: 'contracts', many_field: 'sales_person_id', one_collection: 'employees', one_field: null }, schema: { table: 'contracts', column: 'sales_person_id', foreign_key_table: 'employees', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    // contract_logs relations
    { collection: 'contract_logs', field: 'contract_id', related_collection: 'contracts', meta: { many_collection: 'contract_logs', many_field: 'contract_id', one_collection: 'contracts', one_field: 'logs' }, schema: { table: 'contract_logs', column: 'contract_id', foreign_key_table: 'contracts', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'CASCADE' } },
    { collection: 'contract_logs', field: 'created_by_employee', related_collection: 'employees', meta: { many_collection: 'contract_logs', many_field: 'created_by_employee', one_collection: 'employees', one_field: null }, schema: { table: 'contract_logs', column: 'created_by_employee', foreign_key_table: 'employees', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    // attendances relations
    { collection: 'attendances', field: 'employee_id', related_collection: 'employees', meta: { many_collection: 'attendances', many_field: 'employee_id', one_collection: 'employees', one_field: 'attendances' }, schema: { table: 'attendances', column: 'employee_id', foreign_key_table: 'employees', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'CASCADE' } },
    { collection: 'attendances', field: 'branch_id', related_collection: 'branches', meta: { many_collection: 'attendances', many_field: 'branch_id', one_collection: 'branches', one_field: null }, schema: { table: 'attendances', column: 'branch_id', foreign_key_table: 'branches', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    // leave_requests relations
    { collection: 'leave_requests', field: 'employee_id', related_collection: 'employees', meta: { many_collection: 'leave_requests', many_field: 'employee_id', one_collection: 'employees', one_field: 'leave_requests' }, schema: { table: 'leave_requests', column: 'employee_id', foreign_key_table: 'employees', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'CASCADE' } },
    { collection: 'leave_requests', field: 'approver_id', related_collection: 'employees', meta: { many_collection: 'leave_requests', many_field: 'approver_id', one_collection: 'employees', one_field: null }, schema: { table: 'leave_requests', column: 'approver_id', foreign_key_table: 'employees', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    // payments relations
    { collection: 'payments', field: 'contract_id', related_collection: 'contracts', meta: { many_collection: 'payments', many_field: 'contract_id', one_collection: 'contracts', one_field: 'payments' }, schema: { table: 'payments', column: 'contract_id', foreign_key_table: 'contracts', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'payments', field: 'member_id', related_collection: 'members', meta: { many_collection: 'payments', many_field: 'member_id', one_collection: 'members', one_field: null }, schema: { table: 'payments', column: 'member_id', foreign_key_table: 'members', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'payments', field: 'branch_id', related_collection: 'branches', meta: { many_collection: 'payments', many_field: 'branch_id', one_collection: 'branches', one_field: null }, schema: { table: 'payments', column: 'branch_id', foreign_key_table: 'branches', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'payments', field: 'received_by', related_collection: 'employees', meta: { many_collection: 'payments', many_field: 'received_by', one_collection: 'employees', one_field: null }, schema: { table: 'payments', column: 'received_by', foreign_key_table: 'employees', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    // notifications relations
    { collection: 'notifications', field: 'branch_id', related_collection: 'branches', meta: { many_collection: 'notifications', many_field: 'branch_id', one_collection: 'branches', one_field: null }, schema: { table: 'notifications', column: 'branch_id', foreign_key_table: 'branches', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } },
    { collection: 'notifications', field: 'target_user_id', related_collection: 'directus_users', meta: { many_collection: 'notifications', many_field: 'target_user_id', one_collection: 'directus_users', one_field: null }, schema: { table: 'notifications', column: 'target_user_id', foreign_key_table: 'directus_users', foreign_key_column: 'id', on_update: 'NO ACTION', on_delete: 'SET NULL' } }
  ]
};

async function apply() {
  const loginRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.access_token;
  console.log('✓ 登入成功');

  // 計算 diff
  console.log('計算 schema diff...');
  const diffRes = await fetch(`${DIRECTUS_URL}/schema/diff?force=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(schema)
  });

  if (!diffRes.ok) {
    const err = await diffRes.json();
    console.log('Diff error:', JSON.stringify(err, null, 2));
    return;
  }

  const diff = await diffRes.json();
  console.log('Diff 結果:', JSON.stringify(diff.data, null, 2).substring(0, 500) + '...');

  if (!diff.data || Object.keys(diff.data).length === 0) {
    console.log('No changes needed');
    return;
  }

  // 應用變更
  console.log('應用 schema...');
  const applyRes = await fetch(`${DIRECTUS_URL}/schema/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(diff.data)
  });

  if (!applyRes.ok) {
    const err = await applyRes.json();
    console.log('Apply error:', JSON.stringify(err, null, 2));
    return;
  }

  console.log('✅ Schema 建立完成！');
}

apply();
