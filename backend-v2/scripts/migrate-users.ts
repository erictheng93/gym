/**
 * User Migration Script
 * Migrates users from directus_users to the new users table
 * Preserves Argon2 password hashes
 */
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgres://gym_dev:gym_dev_password@localhost:15432/gym_dev';

async function migrateUsers() {
  console.log('[Migration] Starting user migration from directus_users to users...');

  const sql = postgres(connectionString);

  try {
    // Step 1: Create users table if not exists
    console.log('[Migration] Ensuring users table exists...');
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        role VARCHAR(50) NOT NULL,
        employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
        tenant_id UUID REFERENCES tenants(id),
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `;

    // Step 2: Create sessions table if not exists
    console.log('[Migration] Ensuring sessions table exists...');
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL
      )
    `;

    // Step 3: Get role mappings from Directus
    console.log('[Migration] Fetching Directus roles...');
    const directusRoles = await sql`
      SELECT id, name FROM directus_roles
    `;

    const roleMap: Record<string, string> = {};
    for (const role of directusRoles) {
      // Map Directus role names to our role system
      const roleName = role.name?.toLowerCase() || '';
      if (roleName === 'administrator') {
        roleMap[role.id] = 'admin';
      } else if (roleName === 'manager') {
        roleMap[role.id] = 'manager';
      } else if (roleName === 'coach') {
        roleMap[role.id] = 'coach';
      } else if (roleName === 'staff') {
        roleMap[role.id] = 'staff';
      } else {
        roleMap[role.id] = 'staff'; // Default to staff
      }
    }
    console.log('[Migration] Role mapping:', roleMap);

    // Step 4: Fetch all directus users with their employee info
    console.log('[Migration] Fetching directus_users...');
    const directusUsers = await sql`
      SELECT
        du.id,
        du.email,
        du.password,
        du.role,
        du.status,
        e.id as employee_id,
        e.branch_id,
        b.tenant_id
      FROM directus_users du
      LEFT JOIN employees e ON e.user_id = du.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE du.email IS NOT NULL
    `;

    console.log(`[Migration] Found ${directusUsers.length} users to migrate`);

    // Step 5: Migrate each user
    let migratedCount = 0;
    let skippedCount = 0;

    for (const directusUser of directusUsers) {
      // Check if user already exists
      const existing = await sql`
        SELECT id FROM users WHERE email = ${directusUser.email}
      `;

      if (existing.length > 0) {
        console.log(`[Migration] Skipping existing user: ${directusUser.email}`);
        skippedCount++;
        continue;
      }

      const role = roleMap[directusUser.role] || 'staff';
      const isActive = directusUser.status === 'active';

      await sql`
        INSERT INTO users (
          id,
          email,
          password_hash,
          role,
          employee_id,
          tenant_id,
          is_active,
          created_at
        ) VALUES (
          ${directusUser.id},
          ${directusUser.email},
          ${directusUser.password},
          ${role},
          ${directusUser.employee_id},
          ${directusUser.tenant_id},
          ${isActive},
          NOW()
        )
      `;

      console.log(`[Migration] Migrated user: ${directusUser.email} (role: ${role})`);
      migratedCount++;
    }

    console.log('\n[Migration] Summary:');
    console.log(`  - Migrated: ${migratedCount} users`);
    console.log(`  - Skipped: ${skippedCount} users (already exist)`);
    console.log('[Migration] User migration completed successfully!');

  } catch (error) {
    console.error('[Migration] Error during migration:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

// Run migration
migrateUsers().catch((error) => {
  console.error('[Migration] Fatal error:', error);
  process.exit(1);
});
