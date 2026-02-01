/**
 * Data Migration Script: Directus → Backend-v2
 *
 * This script migrates data from the Directus-based backend to the new Hono.js backend.
 *
 * Usage:
 *   npx tsx scripts/migrate-data.ts
 *
 * Environment Variables:
 *   SOURCE_DATABASE_URL - Directus PostgreSQL connection string
 *   DATABASE_URL        - Backend-v2 PostgreSQL connection string
 *
 * Important Notes:
 * - Directus uses argon2id for password hashing (compatible with our Argon2)
 * - UUIDs transfer directly (both use UUID v7)
 * - Run in a transaction for rollback capability
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

const { Pool } = pg;

// Source database (Directus)
const SOURCE_DATABASE_URL = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL?.replace('gym_nexus', 'gym_directus');

// Target database (Backend-v2)
const TARGET_DATABASE_URL = process.env.DATABASE_URL;

if (!SOURCE_DATABASE_URL || !TARGET_DATABASE_URL) {
  console.error('❌ Missing database URLs');
  console.error('Set SOURCE_DATABASE_URL and DATABASE_URL environment variables');
  process.exit(1);
}

// Initialize database connections
const sourcePool = new Pool({ connectionString: SOURCE_DATABASE_URL });
const targetPool = new Pool({ connectionString: TARGET_DATABASE_URL });
const targetDb = drizzle(targetPool, { schema });

interface MigrationStats {
  table: string;
  migrated: number;
  skipped: number;
  errors: number;
}

const stats: MigrationStats[] = [];

/**
 * Generic migration function
 */
async function migrateTable<T extends Record<string, unknown>>(
  tableName: string,
  sourceTable: string,
  targetTable: typeof schema[keyof typeof schema],
  transform?: (row: Record<string, unknown>) => T | null
): Promise<void> {
  console.log(`\n📦 Migrating ${tableName}...`);

  const stat: MigrationStats = { table: tableName, migrated: 0, skipped: 0, errors: 0 };

  try {
    // Fetch from source
    const result = await sourcePool.query(`SELECT * FROM ${sourceTable}`);
    const rows = result.rows;

    console.log(`   Found ${rows.length} records`);

    for (const row of rows) {
      try {
        // Transform if needed
        const data = transform ? transform(row) : row as T;

        if (!data) {
          stat.skipped++;
          continue;
        }

        // Insert into target (ignore conflicts)
        await targetDb
          .insert(targetTable as any)
          .values(data)
          .onConflictDoNothing();

        stat.migrated++;
      } catch (err) {
        stat.errors++;
        console.error(`   ⚠️ Error migrating row ${row.id}:`, (err as Error).message);
      }
    }

    console.log(`   ✅ Migrated: ${stat.migrated}, Skipped: ${stat.skipped}, Errors: ${stat.errors}`);
  } catch (err) {
    console.error(`   ❌ Failed to migrate ${tableName}:`, (err as Error).message);
    stat.errors = -1;
  }

  stats.push(stat);
}

/**
 * Migrate Directus users to backend-v2 users
 */
async function migrateUsers(): Promise<Map<string, string>> {
  console.log('\n👤 Migrating Directus users...');

  const userIdMap = new Map<string, string>();

  try {
    const result = await sourcePool.query(`
      SELECT id, email, password, first_name, last_name, status
      FROM directus_users
      WHERE email IS NOT NULL
    `);

    console.log(`   Found ${result.rows.length} users`);

    for (const row of result.rows) {
      try {
        // Check if user already exists
        const existing = await targetDb.query.users.findFirst({
          where: (users, { eq }) => eq(users.email, row.email),
        });

        if (existing) {
          userIdMap.set(row.id, existing.id);
          continue;
        }

        // Insert new user
        const [newUser] = await targetDb
          .insert(schema.users)
          .values({
            email: row.email,
            passwordHash: row.password, // Argon2 hash is compatible
            name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
            isActive: row.status === 'active',
          })
          .returning();

        userIdMap.set(row.id, newUser.id);
      } catch (err) {
        console.error(`   ⚠️ Error migrating user ${row.email}:`, (err as Error).message);
      }
    }

    console.log(`   ✅ Mapped ${userIdMap.size} users`);
  } catch (err) {
    console.error('   ❌ Failed to migrate users:', (err as Error).message);
  }

  return userIdMap;
}

/**
 * Main migration function
 */
async function migrate(): Promise<void> {
  console.log('🚀 Starting data migration: Directus → Backend-v2');
  console.log('━'.repeat(60));
  console.log(`Source: ${SOURCE_DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Target: ${TARGET_DATABASE_URL?.replace(/:[^:@]+@/, ':****@')}`);
  console.log('━'.repeat(60));

  // Test connections
  try {
    await sourcePool.query('SELECT 1');
    console.log('✅ Source database connected');
  } catch (err) {
    console.error('❌ Cannot connect to source database:', (err as Error).message);
    process.exit(1);
  }

  try {
    await targetPool.query('SELECT 1');
    console.log('✅ Target database connected');
  } catch (err) {
    console.error('❌ Cannot connect to target database:', (err as Error).message);
    process.exit(1);
  }

  // Step 1: Migrate users (needed for foreign keys)
  const userIdMap = await migrateUsers();

  // Step 2: Migrate tenants (if exists)
  await migrateTable(
    'Tenants',
    'tenants',
    schema.tenants,
    (row) => ({
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string || (row.name as string).toLowerCase().replace(/\s+/g, '-'),
      settings: row.settings || {},
      isActive: row.is_active ?? true,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    })
  ).catch(() => console.log('   (tenants table may not exist in source)'));

  // Step 3: Migrate branches
  await migrateTable(
    'Branches',
    'branches',
    schema.branches,
    (row) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as 'HEADQUARTER' | 'BRANCH',
      code: row.code as string,
      address: row.address as string | null,
      phone: row.phone as string | null,
      taxId: row.tax_id as string | null,
      settings: row.settings || {},
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    })
  );

  // Step 4: Migrate job titles
  await migrateTable(
    'Job Titles',
    'job_titles',
    schema.jobTitles,
    (row) => ({
      id: row.id as string,
      name: row.name as string,
      code: row.code as string,
      description: row.description as string | null,
      permissionsConfig: row.permissions_config || {},
      sort: row.sort as number || 0,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    })
  );

  // Step 5: Migrate employees
  await migrateTable(
    'Employees',
    'employees',
    schema.employees,
    (row) => ({
      id: row.id as string,
      userId: row.user_id ? userIdMap.get(row.user_id as string) : null,
      branchId: row.branch_id as string,
      jobTitleId: row.job_title_id as string,
      employeeCode: row.employee_code as string,
      fullName: row.full_name as string,
      phone: row.phone as string | null,
      email: row.email as string | null,
      status: row.status as 'ACTIVE' | 'RESIGNED' | 'LEAVE',
      employmentType: row.employment_type as 'FULL_TIME' | 'PART_TIME' | 'FREELANCE',
      hireDate: row.hire_date as string,
      resignDate: row.resign_date as string | null,
      basicSalary: row.basic_salary?.toString() || '0',
      customPermissions: row.custom_permissions,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    })
  );

  // Step 6: Migrate members
  await migrateTable(
    'Members',
    'members',
    schema.members,
    (row) => ({
      id: row.id as string,
      memberCode: row.member_code as string,
      fullName: row.full_name as string,
      phone: row.phone as string,
      email: row.email as string | null,
      gender: row.gender as 'MALE' | 'FEMALE' | 'OTHER' | null,
      birthday: row.birthday as string | null,
      idNumber: row.id_number as string | null,
      address: row.address as string | null,
      emergencyContact: row.emergency_contact as string | null,
      emergencyPhone: row.emergency_phone as string | null,
      branchId: row.branch_id as string,
      salesPersonId: row.sales_person_id as string | null,
      status: row.status as 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'BANNED',
      joinDate: row.join_date as string,
      tags: row.tags || [],
      notes: row.notes as string | null,
      avatar: row.avatar as string | null,
      height: row.height as number | null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    })
  );

  // Step 7: Migrate membership plans
  await migrateTable(
    'Membership Plans',
    'membership_plans',
    schema.membershipPlans,
    (row) => ({
      id: row.id as string,
      name: row.name as string,
      code: row.code as string,
      type: row.type as 'TIME_BASED' | 'COUNT_BASED',
      description: row.description as string | null,
      durationMonths: row.duration_months as number || 0,
      classCounts: row.class_counts as number || 0,
      price: row.price?.toString() || '0',
      allowPause: row.allow_pause ?? true,
      maxPauseDays: row.max_pause_days as number || 30,
      allowTransfer: row.allow_transfer ?? false,
      isActive: row.is_active ?? true,
      sort: row.sort as number || 0,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    })
  );

  // Step 8: Migrate contracts
  await migrateTable(
    'Contracts',
    'contracts',
    schema.contracts,
    (row) => ({
      id: row.id as string,
      contractNo: row.contract_no as string,
      memberId: row.member_id as string,
      planId: row.plan_id as string,
      branchId: row.branch_id as string,
      salesPersonId: row.sales_person_id as string | null,
      status: row.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED' | 'TRANSFERRED',
      signDate: row.sign_date ? new Date(row.sign_date as string) : null,
      startDate: row.start_date as string,
      originalEndDate: row.original_end_date as string,
      endDate: row.end_date as string,
      remainingCounts: row.remaining_counts as number || 0,
      totalAmount: row.total_amount?.toString() || '0',
      paidAmount: row.paid_amount?.toString() || '0',
      paymentStatus: row.payment_status as 'UNPAID' | 'PARTIAL' | 'PAID',
      digitalSignature: row.digital_signature as string | null,
      contractPdf: row.contract_pdf as string | null,
      termsAccepted: row.terms_accepted ?? false,
      notes: row.notes as string | null,
      createdBy: row.created_by as string | null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    })
  );

  // Step 9: Migrate contract logs
  await migrateTable(
    'Contract Logs',
    'contract_logs',
    schema.contractLogs,
    (row) => ({
      id: row.id as string,
      contractId: row.contract_id as string,
      logType: row.log_type as 'PAUSE' | 'RESUME' | 'EXTENSION' | 'TRANSFER',
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      reason: row.reason as string | null,
      originalMemberId: row.original_member_id as string | null,
      targetMemberId: row.target_member_id as string | null,
      createdBy: row.created_by as string | null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    })
  );

  // Step 10: Migrate payments
  await migrateTable(
    'Payments',
    'payments',
    schema.payments,
    (row) => ({
      id: row.id as string,
      contractId: row.contract_id as string,
      memberId: row.member_id as string,
      branchId: row.branch_id as string,
      amount: row.amount?.toString() || '0',
      paymentMethod: row.payment_method as 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'LINE_PAY' | 'TRANSFER',
      paymentDate: row.payment_date ? new Date(row.payment_date as string) : new Date(),
      type: row.type as 'INCOME' | 'REFUND',
      receiptNo: row.receipt_no as string | null,
      notes: row.notes as string | null,
      createdBy: row.created_by as string | null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    })
  );

  // Step 11: Migrate classes
  await migrateTable(
    'Classes',
    'class_bookings',
    schema.classes,
    (row) => ({
      id: row.id as string,
      branchId: row.branch_id as string,
      coachId: row.coach_id as string,
      name: 'Private Training',
      description: row.notes as string | null,
      startTime: row.scheduled_at ? new Date(row.scheduled_at as string) : new Date(),
      endTime: row.scheduled_at ? new Date(new Date(row.scheduled_at as string).getTime() + (row.duration_minutes as number || 60) * 60000) : new Date(),
      maxCapacity: 1,
      currentBookings: 1,
      status: row.status === 'COMPLETED' ? 'COMPLETED' : row.status === 'BOOKED' ? 'SCHEDULED' : 'CANCELLED',
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    })
  );

  // Step 12: Migrate bookings
  await migrateTable(
    'Bookings',
    'class_bookings',
    schema.bookings,
    (row) => ({
      id: row.id as string,
      classId: row.id as string, // Same as class for 1:1 private training
      memberId: row.member_id as string,
      contractId: row.contract_id as string | null,
      bookingStatus: row.status as 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
      bookedBy: row.booked_by as string | null,
      checkedInAt: row.status === 'COMPLETED' ? row.scheduled_at ? new Date(row.scheduled_at as string) : null : null,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string) : null,
      cancelReason: row.cancel_reason as string | null,
      notes: row.notes as string | null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    })
  );

  // Step 13: Migrate leads
  await migrateTable(
    'Leads',
    'leads',
    schema.leads,
    (row) => ({
      id: row.id as string,
      name: row.name as string,
      phone: row.phone as string,
      email: row.email as string | null,
      source: row.source as 'FB_AD' | 'IG_AD' | 'GOOGLE_AD' | 'WEBSITE' | 'WALK_IN' | 'REFERRAL',
      utmSource: row.utm_source as string | null,
      utmMedium: row.utm_medium as string | null,
      utmCampaign: row.utm_campaign as string | null,
      branchId: row.branch_id as string,
      assignedTo: row.assigned_to as string | null,
      status: row.status as 'NEW' | 'CONTACTED' | 'TRIAL_BOOKED' | 'VISITED' | 'CONVERTED' | 'LOST',
      interest: row.interest,
      notes: row.notes as string | null,
      convertedMemberId: row.converted_member_id as string | null,
      convertedAt: row.converted_at ? new Date(row.converted_at as string) : null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    })
  );

  // Step 14: Migrate campaigns
  await migrateTable(
    'Campaigns',
    'campaigns',
    schema.campaigns,
    (row) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as 'PROMOTION' | 'EVENT' | 'CHECKIN' | 'REFERRAL',
      description: row.description as string | null,
      startDate: row.start_date ? new Date(row.start_date as string) : new Date(),
      endDate: row.end_date ? new Date(row.end_date as string) : new Date(),
      targetAudience: row.target_audience,
      budget: row.budget?.toString() || null,
      actualCost: row.actual_cost?.toString() || null,
      status: row.status as 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED',
      metrics: row.metrics,
      createdBy: row.created_by as string | null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    })
  );

  // Step 15: Migrate coupons
  await migrateTable(
    'Coupons',
    'coupons',
    schema.coupons,
    (row) => ({
      id: row.id as string,
      code: row.code as string,
      name: row.name as string,
      discountType: row.discount_type as 'PERCENTAGE' | 'FIXED_AMOUNT',
      discountValue: row.discount_value?.toString() || '0',
      minPurchase: row.min_purchase?.toString() || '0',
      maxDiscount: row.max_discount?.toString() || null,
      usageLimit: row.usage_limit as number | null,
      usagePerMember: row.usage_per_member as number || 1,
      usedCount: row.used_count as number || 0,
      applicablePlans: row.applicable_plans,
      startDate: row.start_date ? new Date(row.start_date as string) : new Date(),
      endDate: row.end_date ? new Date(row.end_date as string) : new Date(),
      status: row.status as 'ACTIVE' | 'INACTIVE' | 'EXPIRED',
      createdBy: row.created_by as string | null,
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    })
  );

  // Print summary
  console.log('\n' + '━'.repeat(60));
  console.log('📊 Migration Summary');
  console.log('━'.repeat(60));

  let totalMigrated = 0;
  let totalErrors = 0;

  for (const stat of stats) {
    const status = stat.errors === -1 ? '❌' : stat.errors > 0 ? '⚠️' : '✅';
    console.log(`${status} ${stat.table.padEnd(20)} | Migrated: ${String(stat.migrated).padStart(5)} | Errors: ${String(stat.errors).padStart(3)}`);
    totalMigrated += stat.migrated;
    if (stat.errors > 0) totalErrors += stat.errors;
  }

  console.log('━'.repeat(60));
  console.log(`Total Migrated: ${totalMigrated}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log('━'.repeat(60));

  if (totalErrors > 0) {
    console.log('\n⚠️ Migration completed with some errors. Please review the logs above.');
  } else {
    console.log('\n✅ Migration completed successfully!');
  }

  // Cleanup
  await sourcePool.end();
  await targetPool.end();
}

// Run migration
migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
