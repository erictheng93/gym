CREATE TABLE "attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_created" timestamp with time zone DEFAULT now(),
	"employee_id" uuid NOT NULL,
	"check_in" timestamp with time zone,
	"check_out" timestamp with time zone,
	"work_hours" numeric(5, 2),
	"branch_id" uuid,
	"location_ip" varchar(50),
	"location_gps" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_created" timestamp with time zone DEFAULT now(),
	"tenant_id" uuid,
	"user_id" uuid,
	"employee_id" uuid,
	"branch_id" uuid,
	"action" varchar(50) NOT NULL,
	"resource_type" varchar(100) NOT NULL,
	"resource_id" uuid,
	"description" text,
	"ip_address" "inet",
	"user_agent" text,
	"old_values" jsonb,
	"new_values" jsonb,
	"diff" jsonb,
	"request_method" varchar(10),
	"request_path" text,
	"request_params" jsonb,
	"response_status" integer,
	"response_time_ms" integer,
	"severity" varchar(20) DEFAULT 'info',
	"category" varchar(50),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"contract_id" uuid,
	"booking_status" varchar(20) DEFAULT 'CONFIRMED',
	"waitlist_position" integer,
	"booked_at" timestamp with time zone DEFAULT now(),
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"attended_at" timestamp with time zone,
	"count_deducted" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"address" text,
	"phone" varchar(50),
	"tax_id" varchar(20),
	"settings" jsonb DEFAULT '{}'::jsonb,
	"tenant_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" text,
	"campaign_type" varchar(30),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"target_audience" text,
	"budget" numeric(10, 2),
	"discount_type" varchar(30),
	"discount_value" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"terms" text,
	"created_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"member_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"contract_id" uuid,
	"check_in_time" timestamp with time zone DEFAULT now(),
	"check_in_type" varchar(20) DEFAULT 'ENTRY',
	"check_in_method" varchar(20),
	"processed_by_id" uuid,
	"location_ip" varchar(50),
	"location_device" varchar(100),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "class_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"class_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"instructor_id" uuid,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room" varchar(50),
	"max_capacity" integer,
	"is_recurring" boolean DEFAULT true,
	"valid_from" date,
	"valid_until" date
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"schedule_id" uuid,
	"class_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"instructor_id" uuid,
	"session_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room" varchar(50),
	"max_capacity" integer NOT NULL,
	"current_count" integer DEFAULT 0,
	"waitlist_count" integer DEFAULT 0,
	"session_status" varchar(20) DEFAULT 'SCHEDULED',
	"cancelled_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"name" varchar(100) NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"max_capacity" integer DEFAULT 20 NOT NULL,
	"instructor_id" uuid,
	"branch_id" uuid NOT NULL,
	"category" varchar(50),
	"difficulty_level" varchar(20) DEFAULT 'BEGINNER',
	"image_url" varchar(500),
	"is_active" boolean DEFAULT true,
	"requires_count" boolean DEFAULT true,
	"count_deduction" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "contract_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"contract_id" uuid NOT NULL,
	"log_type" varchar(20) NOT NULL,
	"start_date" date,
	"end_date" date,
	"days_affected" integer,
	"reason" text,
	"created_by_employee" uuid,
	"branch_id" uuid,
	"original_member_id" uuid,
	"target_member_id" uuid,
	"tenant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"contract_no" varchar(30),
	"member_id" uuid NOT NULL,
	"plan_id" uuid,
	"sign_date" date,
	"start_date" date NOT NULL,
	"end_date" date,
	"original_end_date" date,
	"contract_status" varchar(20) DEFAULT 'DRAFT',
	"remaining_counts" integer,
	"total_amount" numeric(12, 2),
	"payment_status" varchar(20) DEFAULT 'UNPAID',
	"sales_person_id" uuid,
	"branch_id" uuid,
	"notes" text,
	"digital_signature" uuid,
	"contract_pdf" uuid,
	"tenant_id" uuid,
	CONSTRAINT "contracts_contract_no_unique" UNIQUE("contract_no")
);
--> statement-breakpoint
CREATE TABLE "coupon_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_created" timestamp with time zone DEFAULT now(),
	"coupon_id" uuid NOT NULL,
	"member_id" uuid,
	"contract_id" uuid,
	"discount_amount" numeric(10, 2) NOT NULL,
	"used_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"campaign_id" uuid,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"discount_type" varchar(20) NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"min_purchase" numeric(10, 2),
	"max_discount" numeric(10, 2),
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"usage_limit" integer,
	"usage_limit_per_member" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"applicable_plans" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"employee_code" varchar(20),
	"full_name" varchar(100) NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"branch_id" uuid,
	"job_title_id" uuid,
	"user_id" uuid,
	"employment_status" varchar(20) DEFAULT 'ACTIVE',
	"employment_type" varchar(20),
	"hire_date" date,
	"basic_salary" numeric(12, 2),
	"custom_permissions" jsonb,
	"tenant_id" uuid,
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"tenant_id" uuid,
	"uploaded_by" uuid,
	"filename" varchar(255) NOT NULL,
	"original_filename" varchar(255),
	"mime_type" varchar(100),
	"size" integer,
	"storage_key" varchar(500) NOT NULL,
	"folder" varchar(255),
	"title" varchar(255),
	"description" text,
	"width" integer,
	"height" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid,
	"invoice_number" varchar(50) NOT NULL,
	"amount_subtotal" numeric(10, 2) NOT NULL,
	"amount_tax" numeric(10, 2) DEFAULT '0',
	"amount_total" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'TWD',
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"payment_method" varchar(50),
	"payment_transaction_id" varchar(100),
	"line_items" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "job_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"name" varchar(100) NOT NULL,
	"level" integer DEFAULT 0,
	"permissions_config" jsonb DEFAULT '{}'::jsonb,
	"tenant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"lead_id" uuid NOT NULL,
	"activity_type" varchar(30) NOT NULL,
	"content" text,
	"created_by" uuid,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"tenant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"full_name" varchar(100) NOT NULL,
	"phone" varchar(20),
	"email" varchar(100),
	"source" varchar(30),
	"source_detail" text,
	"branch_id" uuid NOT NULL,
	"assigned_to_id" uuid,
	"lead_status" varchar(30) DEFAULT 'NEW',
	"notes" text,
	"interests" jsonb DEFAULT '[]'::jsonb,
	"expected_budget" numeric(10, 2),
	"converted_member_id" uuid,
	"converted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"employee_id" uuid NOT NULL,
	"leave_type" varchar(20) NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"leave_status" varchar(20) DEFAULT 'PENDING',
	"approver_id" uuid,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"member_code" varchar(20),
	"full_name" varchar(100) NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"branch_id" uuid,
	"member_status" varchar(20) DEFAULT 'ACTIVE',
	"join_date" date,
	"sales_person_id" uuid,
	"gender" varchar(10),
	"birthday" date,
	"address" text,
	"emergency_contact" varchar(100),
	"emergency_phone" varchar(50),
	"tags" jsonb,
	"notes" text,
	"height" real,
	"tenant_id" uuid,
	CONSTRAINT "members_member_code_unique" UNIQUE("member_code")
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"name" varchar(100) NOT NULL,
	"plan_type" varchar(20) NOT NULL,
	"duration_months" integer,
	"class_counts" integer,
	"price" numeric(12, 2) NOT NULL,
	"allow_transfer" boolean DEFAULT false,
	"allow_pause" boolean DEFAULT false,
	"description" text,
	"is_active" boolean DEFAULT true,
	"tenant_id" uuid,
	"branch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"notification_type" varchar(50),
	"type" varchar(50),
	"title" varchar(255) NOT NULL,
	"message" text,
	"data" text,
	"reference_type" varchar(255),
	"reference_id" uuid,
	"branch_id" uuid,
	"target_user_id" uuid,
	"target_member_id" uuid,
	"target_employee_id" uuid,
	"recipient_type" varchar(20),
	"recipient_id" uuid,
	"priority" varchar(20) DEFAULT 'NORMAL',
	"is_read" boolean DEFAULT false,
	"read_status" boolean DEFAULT false,
	"read_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"tenant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "otp_send_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" varchar(100) NOT NULL,
	"identifier_type" varchar(20) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now(),
	"ip_address" "inet",
	"success" boolean DEFAULT true,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "otp_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" varchar(100) NOT NULL,
	"identifier_type" varchar(20) NOT NULL,
	"code" varchar(6) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"verified" boolean DEFAULT false,
	"verified_at" timestamp with time zone,
	"ip_address" "inet",
	"user_agent" text,
	"date_created" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"contract_id" uuid,
	"member_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" varchar(20),
	"payment_date" timestamp with time zone,
	"payment_type" varchar(20) DEFAULT 'INCOME',
	"branch_id" uuid,
	"received_by" uuid,
	"notes" text,
	"tenant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"user_id" uuid,
	"member_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"is_active" boolean DEFAULT true,
	"error_count" integer DEFAULT 0,
	"notify_booking_reminder" boolean DEFAULT true,
	"notify_class_cancelled" boolean DEFAULT true,
	"notify_contract_expiry" boolean DEFAULT true,
	"tenant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"date_created" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"tenant_id" uuid NOT NULL,
	"plan_type" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"billing_cycle" varchar(20) DEFAULT 'monthly' NOT NULL,
	"current_period_start" date NOT NULL,
	"current_period_end" date NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false,
	"cancelled_at" timestamp with time zone,
	"monthly_price" numeric(10, 2),
	"yearly_price" numeric(10, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20),
	"plan_type" varchar(50) DEFAULT 'starter',
	"max_branches" integer DEFAULT 1,
	"max_members" integer DEFAULT 100,
	"max_employees" integer DEFAULT 10,
	"max_storage_mb" integer DEFAULT 1024,
	"tenant_status" varchar(20) DEFAULT 'trial',
	"trial_ends_at" timestamp with time zone,
	"billing_cycle" varchar(20) DEFAULT 'monthly',
	"next_billing_date" date,
	"monthly_price" numeric(10, 2),
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_created" timestamp with time zone DEFAULT now(),
	"tenant_id" uuid NOT NULL,
	"record_date" date DEFAULT CURRENT_DATE NOT NULL,
	"members_count" integer DEFAULT 0,
	"employees_count" integer DEFAULT 0,
	"branches_count" integer DEFAULT 0,
	"storage_mb" integer DEFAULT 0,
	"api_calls_count" integer DEFAULT 0,
	"api_bandwidth_mb" integer DEFAULT 0,
	"active_contracts_count" integer DEFAULT 0,
	"daily_revenue" numeric(12, 2) DEFAULT '0',
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"role" varchar(50) NOT NULL,
	"employee_id" uuid,
	"tenant_id" uuid,
	"is_active" boolean DEFAULT true,
	"email_verified" boolean DEFAULT false,
	"last_login_at" timestamp with time zone,
	"date_created" timestamp with time zone DEFAULT now(),
	"date_updated" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_employees_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_processed_by_id_employees_id_fk" FOREIGN KEY ("processed_by_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_instructor_id_employees_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_schedule_id_class_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."class_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_instructor_id_employees_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_instructor_id_employees_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_logs" ADD CONSTRAINT "contract_logs_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_logs" ADD CONSTRAINT "contract_logs_created_by_employee_employees_id_fk" FOREIGN KEY ("created_by_employee") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_logs" ADD CONSTRAINT "contract_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_logs" ADD CONSTRAINT "contract_logs_original_member_id_members_id_fk" FOREIGN KEY ("original_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_logs" ADD CONSTRAINT "contract_logs_target_member_id_members_id_fk" FOREIGN KEY ("target_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_logs" ADD CONSTRAINT "contract_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_sales_person_id_employees_id_fk" FOREIGN KEY ("sales_person_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_job_title_id_job_titles_id_fk" FOREIGN KEY ("job_title_id") REFERENCES "public"."job_titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_titles" ADD CONSTRAINT "job_titles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_employees_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_member_id_members_id_fk" FOREIGN KEY ("converted_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approver_id_employees_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_sales_person_id_employees_id_fk" FOREIGN KEY ("sales_person_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_member_id_members_id_fk" FOREIGN KEY ("target_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_employee_id_employees_id_fk" FOREIGN KEY ("target_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_employees_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attendances_employee" ON "attendances" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_date" ON "audit_logs" USING btree ("date_created");--> statement-breakpoint
CREATE INDEX "idx_bookings_member" ON "bookings" USING btree ("member_id","booking_status");--> statement-breakpoint
CREATE INDEX "idx_bookings_session" ON "bookings" USING btree ("session_id","booking_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_member_session" ON "bookings" USING btree ("session_id","member_id");--> statement-breakpoint
CREATE INDEX "idx_branches_tenant_id" ON "branches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_branches_tenant_status" ON "branches" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_campaigns_tenant" ON "campaigns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_campaigns_dates" ON "campaigns" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_check_ins_member_id" ON "check_ins" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_branch_id" ON "check_ins" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_time" ON "check_ins" USING btree ("check_in_time");--> statement-breakpoint
CREATE INDEX "idx_schedules_class" ON "class_schedules" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_schedule" ON "class_schedules" USING btree ("class_id","branch_id","day_of_week","start_time");--> statement-breakpoint
CREATE INDEX "idx_sessions_date" ON "class_sessions" USING btree ("branch_id","session_date","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session" ON "class_sessions" USING btree ("class_id","branch_id","session_date","start_time");--> statement-breakpoint
CREATE INDEX "idx_classes_branch" ON "classes" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_classes_category" ON "classes" USING btree ("category","is_active");--> statement-breakpoint
CREATE INDEX "idx_contract_logs_contract" ON "contract_logs" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_logs_tenant" ON "contract_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_member" ON "contracts" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_branch" ON "contracts" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_status" ON "contracts" USING btree ("contract_status");--> statement-breakpoint
CREATE INDEX "idx_contracts_tenant" ON "contracts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_coupon_usages_coupon" ON "coupon_usages" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "idx_coupon_usages_member" ON "coupon_usages" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_coupons_tenant" ON "coupons" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_coupons_code" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coupons_code_tenant" ON "coupons" USING btree ("code","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_employees_branch" ON "employees" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_employees_tenant" ON "employees" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_files_tenant" ON "files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_files_folder" ON "files" USING btree ("folder");--> statement-breakpoint
CREATE INDEX "idx_invoices_tenant" ON "invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_job_titles_tenant" ON "job_titles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_lead_activities_lead" ON "lead_activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_lead_activities_type" ON "lead_activities" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "idx_leads_branch" ON "leads" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_leads_status" ON "leads" USING btree ("lead_status");--> statement-breakpoint
CREATE INDEX "idx_leads_assigned" ON "leads" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "idx_leave_requests_employee" ON "leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_members_branch" ON "members" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_members_status" ON "members" USING btree ("member_status");--> statement-breakpoint
CREATE INDEX "idx_members_tenant" ON "members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_membership_plans_tenant" ON "membership_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_membership_plans_branch" ON "membership_plans" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_branch" ON "notifications" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_target_employee" ON "notifications" USING btree ("target_employee_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_tenant" ON "notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_recipient" ON "notifications" USING btree ("recipient_type","recipient_id");--> statement-breakpoint
CREATE INDEX "idx_payments_contract" ON "payments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_payments_branch" ON "payments" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_payments_tenant" ON "payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_member" ON "push_subscriptions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_user" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_tenant" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tenants_tenant_status" ON "tenants" USING btree ("tenant_status");--> statement-breakpoint
CREATE INDEX "idx_tenants_slug" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_tenants_plan_type" ON "tenants" USING btree ("plan_type");--> statement-breakpoint
CREATE INDEX "idx_usage_records_tenant" ON "usage_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usage_tenant_date" ON "usage_records" USING btree ("tenant_id","record_date");