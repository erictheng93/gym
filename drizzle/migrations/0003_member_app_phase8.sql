-- Migration: Member-App Phase 8 Tables
-- Created: 2026-01-31
-- Description: Add tables for member authentication, social accounts, reviews, workouts, goals, measurements, and issues

-- Create enums if not exist
DO $$ BEGIN
  CREATE TYPE "social_provider" AS ENUM ('GOOGLE', 'LINE', 'APPLE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "exercise_category" AS ENUM ('STRENGTH', 'CARDIO', 'FLEXIBILITY', 'BALANCE', 'HIIT', 'YOGA', 'PILATES', 'SPORTS', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "goal_type" AS ENUM ('WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS', 'BODY_COMPOSITION', 'CUSTOM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "goal_status" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED', 'PAUSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "issue_type" AS ENUM ('EQUIPMENT', 'SERVICE', 'CLEANLINESS', 'SAFETY', 'SUGGESTION', 'COMPLAINT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "issue_status" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "issue_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Member Credentials Table (Password Authentication)
CREATE TABLE IF NOT EXISTS "member_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "password_hash" varchar(255) NOT NULL,
  "failed_attempts" integer DEFAULT 0 NOT NULL,
  "locked_until" timestamp,
  "password_reset_token_hash" varchar(255),
  "password_reset_expires" timestamp,
  "last_login" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "member_credentials_member_id_unique" UNIQUE("member_id")
);

-- Member Social Accounts Table (OAuth)
CREATE TABLE IF NOT EXISTS "member_social_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "provider" social_provider NOT NULL,
  "provider_user_id" varchar(255) NOT NULL,
  "email" varchar(255),
  "name" varchar(255),
  "avatar_url" text,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamp,
  "raw_data" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "member_social_accounts_provider_user_unique" UNIQUE("provider", "provider_user_id"),
  CONSTRAINT "member_social_accounts_member_provider_unique" UNIQUE("member_id", "provider")
);

-- Class Reviews Table
CREATE TABLE IF NOT EXISTS "class_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid NOT NULL REFERENCES "class_bookings"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "coach_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "rating" integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  "review_text" text,
  "is_anonymous" boolean DEFAULT false NOT NULL,
  "staff_response" text,
  "responded_by" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "responded_at" timestamp,
  "is_visible" boolean DEFAULT true NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "class_reviews_booking_unique" UNIQUE("booking_id")
);

-- Workout Logs Table
CREATE TABLE IF NOT EXISTS "workout_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "workout_date" date NOT NULL,
  "start_time" time,
  "end_time" time,
  "duration_minutes" integer,
  "exercise_category" exercise_category NOT NULL,
  "exercise_name" varchar(255) NOT NULL,
  "sets" integer,
  "reps" integer,
  "weight" decimal(10,2),
  "distance" decimal(10,2),
  "calories_burned" integer,
  "heart_rate_avg" integer,
  "notes" text,
  "related_class_id" uuid REFERENCES "classes"("id") ON DELETE SET NULL,
  "tenant_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Member Goals Table
CREATE TABLE IF NOT EXISTS "member_goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "goal_type" goal_type NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "target_value" decimal(10,2),
  "current_value" decimal(10,2),
  "unit" varchar(50),
  "start_date" date NOT NULL,
  "target_date" date,
  "status" goal_status DEFAULT 'ACTIVE' NOT NULL,
  "milestones" jsonb DEFAULT '[]'::jsonb,
  "completed_at" timestamp,
  "tenant_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Body Measurements Table
CREATE TABLE IF NOT EXISTS "body_measurements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "measurement_date" date NOT NULL,
  "weight" decimal(5,2),
  "body_fat_percentage" decimal(4,1),
  "muscle_mass" decimal(5,2),
  "bmi" decimal(4,1),
  "chest" decimal(5,1),
  "waist" decimal(5,1),
  "hips" decimal(5,1),
  "thigh" decimal(5,1),
  "arm" decimal(4,1),
  "notes" text,
  "tenant_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Issue Reports Table
CREATE TABLE IF NOT EXISTS "issue_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "issue_type" issue_type NOT NULL,
  "subject" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb,
  "location" varchar(255),
  "status" issue_status DEFAULT 'OPEN' NOT NULL,
  "priority" issue_priority DEFAULT 'MEDIUM' NOT NULL,
  "assigned_to_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "resolution" text,
  "resolved_at" timestamp,
  "member_satisfaction" integer CHECK (member_satisfaction >= 1 AND member_satisfaction <= 5),
  "member_feedback" text,
  "tenant_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_member_credentials_member_id" ON "member_credentials"("member_id");
CREATE INDEX IF NOT EXISTS "idx_member_social_accounts_member_id" ON "member_social_accounts"("member_id");
CREATE INDEX IF NOT EXISTS "idx_member_social_accounts_provider" ON "member_social_accounts"("provider");
CREATE INDEX IF NOT EXISTS "idx_class_reviews_member_id" ON "class_reviews"("member_id");
CREATE INDEX IF NOT EXISTS "idx_class_reviews_class_id" ON "class_reviews"("class_id");
CREATE INDEX IF NOT EXISTS "idx_class_reviews_coach_id" ON "class_reviews"("coach_id");
CREATE INDEX IF NOT EXISTS "idx_class_reviews_tenant_id" ON "class_reviews"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_workout_logs_member_id" ON "workout_logs"("member_id");
CREATE INDEX IF NOT EXISTS "idx_workout_logs_workout_date" ON "workout_logs"("workout_date");
CREATE INDEX IF NOT EXISTS "idx_workout_logs_tenant_id" ON "workout_logs"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_member_goals_member_id" ON "member_goals"("member_id");
CREATE INDEX IF NOT EXISTS "idx_member_goals_status" ON "member_goals"("status");
CREATE INDEX IF NOT EXISTS "idx_member_goals_tenant_id" ON "member_goals"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_body_measurements_member_id" ON "body_measurements"("member_id");
CREATE INDEX IF NOT EXISTS "idx_body_measurements_date" ON "body_measurements"("measurement_date");
CREATE INDEX IF NOT EXISTS "idx_body_measurements_tenant_id" ON "body_measurements"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_issue_reports_member_id" ON "issue_reports"("member_id");
CREATE INDEX IF NOT EXISTS "idx_issue_reports_branch_id" ON "issue_reports"("branch_id");
CREATE INDEX IF NOT EXISTS "idx_issue_reports_status" ON "issue_reports"("status");
CREATE INDEX IF NOT EXISTS "idx_issue_reports_tenant_id" ON "issue_reports"("tenant_id");
