/**
 * Setup Admin Permissions Script
 *
 * This script configures full permissions for the admin user role
 * to access all collections including relational fields.
 */

const DIRECTUS_URL = 'http://localhost:8055';
const ADMIN_EMAIL = 'admin@gym.com';
const ADMIN_PASSWORD = 'admin';

// All business collections that need permissions
const COLLECTIONS = [
  'branches',
  'job_titles',
  'employees',
  'members',
  'membership_plans',
  'contracts',
  'contract_logs',
  'payments',
  'attendances',
  'leave_requests',
  'notifications'
];

async function setup() {
  console.log('🔧 Setting up Admin Permissions...\n');

  // 1. Login
  console.log('1. Logging in...');
  const loginRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });

  if (!loginRes.ok) {
    console.error('❌ Login failed. Make sure Directus is running and credentials are correct.');
    console.error('   Run: cd backend && docker-compose up -d');
    process.exit(1);
  }

  const loginData = await loginRes.json();
  const token = loginData.data.access_token;
  console.log('   ✅ Logged in successfully\n');

  // Helper function for API requests
  async function apiRequest(method, endpoint, body = null) {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${DIRECTUS_URL}${endpoint}`, options);
    const text = await response.text();

    try {
      return { ok: response.ok, data: JSON.parse(text) };
    } catch {
      return { ok: response.ok, data: text };
    }
  }

  // 2. Get current user info
  console.log('2. Getting current user info...');
  const meRes = await apiRequest('GET', '/users/me');
  if (!meRes.ok) {
    console.error('❌ Failed to get user info');
    process.exit(1);
  }
  const currentUser = meRes.data.data;
  console.log(`   User: ${currentUser.email}`);
  console.log(`   Role: ${currentUser.role || 'No role assigned'}\n`);

  // 3. Check if user has admin role
  console.log('3. Checking role permissions...');

  if (currentUser.role) {
    const roleRes = await apiRequest('GET', `/roles/${currentUser.role}`);
    if (roleRes.ok) {
      const role = roleRes.data.data;
      console.log(`   Role name: ${role.name}`);
      console.log(`   Admin access: ${role.admin_access}`);

      if (role.admin_access) {
        console.log('   ✅ User has admin access - should have full permissions\n');
      } else {
        console.log('   ⚠️ User does not have admin access\n');
      }
    }
  }

  // 4. Check existing collections
  console.log('4. Checking collections...');
  const collectionsRes = await apiRequest('GET', '/collections');

  if (collectionsRes.ok) {
    const existingCollections = collectionsRes.data.data.map(c => c.collection);
    console.log(`   Found ${existingCollections.length} collections`);

    for (const col of COLLECTIONS) {
      if (existingCollections.includes(col)) {
        console.log(`   ✅ ${col}`);
      } else {
        console.log(`   ❌ ${col} - MISSING`);
      }
    }
  }
  console.log('');

  // 5. Check payments collection specifically
  console.log('5. Testing payments collection access...');
  const paymentsRes = await apiRequest('GET', '/items/payments?limit=1');

  if (paymentsRes.ok) {
    console.log(`   ✅ Can access payments collection`);
    console.log(`   Found ${paymentsRes.data.data?.length || 0} payments\n`);
  } else {
    console.log(`   ❌ Cannot access payments: ${JSON.stringify(paymentsRes.data)}`);
    console.log('   This may need schema setup first.\n');
  }

  // 6. Check members with contracts relation
  console.log('6. Testing member-contract relation...');
  const membersRes = await apiRequest('GET', '/items/members?limit=1&fields=*,contracts.*');

  if (membersRes.ok) {
    const members = membersRes.data.data;
    if (members && members.length > 0) {
      console.log(`   ✅ Can access members with contracts`);
      console.log(`   Member: ${members[0].full_name}`);
      console.log(`   Contracts: ${members[0].contracts?.length || 0}\n`);
    } else {
      console.log('   ⚠️ No members found in database\n');
    }
  } else {
    console.log(`   ❌ Cannot access members with contracts relation`);
    console.log(`   Error: ${JSON.stringify(paymentsRes.data)}\n`);
  }

  // 7. Get existing policies for role
  console.log('7. Checking policies...');
  const policiesRes = await apiRequest('GET', '/policies');

  if (policiesRes.ok) {
    const policies = policiesRes.data.data;
    console.log(`   Found ${policies.length} policies`);

    for (const policy of policies) {
      console.log(`   - ${policy.name} (admin: ${policy.admin_access})`);
    }
  }
  console.log('');

  // 8. Get existing permissions
  console.log('8. Checking permissions...');
  const permissionsRes = await apiRequest('GET', '/permissions');

  if (permissionsRes.ok) {
    const permissions = permissionsRes.data.data;
    console.log(`   Found ${permissions.length} permission rules`);

    // Group by collection
    const byCollection = {};
    for (const perm of permissions) {
      if (!byCollection[perm.collection]) {
        byCollection[perm.collection] = [];
      }
      byCollection[perm.collection].push(perm.action);
    }

    for (const [col, actions] of Object.entries(byCollection)) {
      console.log(`   - ${col}: ${actions.join(', ')}`);
    }
  }
  console.log('');

  console.log('========================================');
  console.log('📋 Summary');
  console.log('========================================\n');

  console.log('If collections are missing, run:');
  console.log('   node create-schema.js\n');

  console.log('If data is missing, run:');
  console.log('   docker exec -i gym_database psql -U directus -d gym_nexus < seed.sql\n');

  console.log('If permissions need setup, run:');
  console.log('   node setup-rls.js\n');

  console.log('🎉 Permission check complete!');
}

setup().catch(console.error);
