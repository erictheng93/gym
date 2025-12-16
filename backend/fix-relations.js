/**
 * Fix Relations Script
 *
 * Fixes the member-contract relation and adds missing collections
 */

const DIRECTUS_URL = 'http://localhost:8055';
const ADMIN_EMAIL = 'admin@gym.com';
const ADMIN_PASSWORD = 'admin';

async function fix() {
  console.log('🔧 Fixing Relations...\n');

  // Login
  const loginRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.access_token;
  console.log('✅ Logged in\n');

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
      return { ok: response.ok, status: response.status, data: JSON.parse(text) };
    } catch {
      return { ok: response.ok, status: response.status, data: text };
    }
  }

  // 1. Check existing relations
  console.log('1. Checking existing relations...');
  const relationsRes = await apiRequest('GET', '/relations');
  const relations = relationsRes.data.data || [];

  // Find member-contract relation
  const memberContractRel = relations.find(r =>
    r.collection === 'contracts' && r.field === 'member_id'
  );

  if (memberContractRel) {
    console.log('   Found contracts.member_id relation:');
    console.log(`   - one_field: ${memberContractRel.meta?.one_field || 'NOT SET'}`);

    // Check if one_field is set
    if (!memberContractRel.meta?.one_field) {
      console.log('\n   Updating relation to add one_field...');
      const updateRes = await apiRequest('PATCH', `/relations/contracts/member_id`, {
        meta: {
          ...memberContractRel.meta,
          one_field: 'contracts'
        }
      });

      if (updateRes.ok) {
        console.log('   ✅ Updated relation - added contracts field to members');
      } else {
        console.log('   ❌ Failed to update:', updateRes.data);
      }
    }
  } else {
    console.log('   ❌ contracts.member_id relation not found!');

    // Create the relation
    console.log('   Creating relation...');
    const createRes = await apiRequest('POST', '/relations', {
      collection: 'contracts',
      field: 'member_id',
      related_collection: 'members',
      meta: {
        many_collection: 'contracts',
        many_field: 'member_id',
        one_collection: 'members',
        one_field: 'contracts',
        one_deselect_action: 'nullify'
      },
      schema: {
        on_delete: 'SET NULL'
      }
    });

    if (createRes.ok) {
      console.log('   ✅ Created relation');
    } else {
      console.log('   ❌ Failed:', createRes.data);
    }
  }

  // 2. Add O2M field to members collection for contracts
  console.log('\n2. Adding contracts field to members...');
  const fieldsRes = await apiRequest('GET', '/fields/members');
  const memberFields = fieldsRes.data.data || [];
  const hasContractsField = memberFields.some(f => f.field === 'contracts');

  if (!hasContractsField) {
    const createFieldRes = await apiRequest('POST', '/fields/members', {
      field: 'contracts',
      type: 'alias',
      meta: {
        special: ['o2m'],
        interface: 'list-o2m',
        display: 'related-values',
        display_options: {
          template: '{{contract_no}} - {{contract_status}}'
        },
        options: {
          enableCreate: true,
          enableSelect: true
        }
      }
    });

    if (createFieldRes.ok) {
      console.log('   ✅ Added contracts field to members');
    } else {
      console.log('   Result:', createFieldRes.status, JSON.stringify(createFieldRes.data).substring(0, 200));
    }
  } else {
    console.log('   ✅ contracts field already exists on members');
  }

  // 3. Add payments field to members
  console.log('\n3. Adding payments field to members...');
  const hasPaymentsField = memberFields.some(f => f.field === 'payments');

  if (!hasPaymentsField) {
    // First check/create relation
    const paymentMemberRel = relations.find(r =>
      r.collection === 'payments' && r.field === 'member_id'
    );

    if (paymentMemberRel && !paymentMemberRel.meta?.one_field) {
      await apiRequest('PATCH', `/relations/payments/member_id`, {
        meta: {
          ...paymentMemberRel.meta,
          one_field: 'payments'
        }
      });
    }

    const createFieldRes = await apiRequest('POST', '/fields/members', {
      field: 'payments',
      type: 'alias',
      meta: {
        special: ['o2m'],
        interface: 'list-o2m',
        display: 'related-values'
      }
    });

    if (createFieldRes.ok) {
      console.log('   ✅ Added payments field to members');
    } else {
      console.log('   Result:', createFieldRes.status);
    }
  } else {
    console.log('   ✅ payments field already exists on members');
  }

  // 4. Create notifications collection if missing
  console.log('\n4. Checking notifications collection...');
  const collectionsRes = await apiRequest('GET', '/collections');
  const collections = collectionsRes.data.data.map(c => c.collection);

  if (!collections.includes('notifications')) {
    console.log('   Creating notifications collection...');

    const createCollRes = await apiRequest('POST', '/collections', {
      collection: 'notifications',
      meta: {
        icon: 'notifications',
        note: '系統通知',
        display_template: '{{title}}',
        hidden: false,
        singleton: false,
        accountability: 'all',
        archive_field: 'status',
        archive_value: 'archived',
        unarchive_value: 'active'
      },
      schema: {
        name: 'notifications'
      }
    });

    if (createCollRes.ok) {
      console.log('   ✅ Created notifications collection');

      // Add fields
      const notificationFields = [
        { field: 'id', type: 'uuid', meta: { hidden: true, readonly: true, special: ['uuid'] }, schema: { is_primary_key: true, is_nullable: false } },
        { field: 'status', type: 'string', meta: { interface: 'select-dropdown', options: { choices: [{ text: 'Active', value: 'active' }, { text: 'Archived', value: 'archived' }] } }, schema: { default_value: 'active' } },
        { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], hidden: true } },
        { field: 'notification_type', type: 'string', meta: { interface: 'select-dropdown', required: true, options: { choices: [{ text: '到期提醒', value: 'expiring' }, { text: '付款提醒', value: 'payment' }, { text: '系統通知', value: 'system' }] } } },
        { field: 'title', type: 'string', meta: { interface: 'input', required: true } },
        { field: 'message', type: 'text', meta: { interface: 'input-multiline' } },
        { field: 'is_read', type: 'boolean', meta: { interface: 'boolean' }, schema: { default_value: false } },
        { field: 'branch_id', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'] } }
      ];

      for (const field of notificationFields) {
        await apiRequest('POST', '/fields/notifications', field);
      }
      console.log('   ✅ Added notification fields');

      // Add permissions
      const policiesRes = await apiRequest('GET', '/policies?filter[name][_eq]=Store Manager Branch Access');
      if (policiesRes.ok && policiesRes.data.data.length > 0) {
        const policyId = policiesRes.data.data[0].id;
        for (const action of ['create', 'read', 'update', 'delete']) {
          await apiRequest('POST', '/permissions', {
            policy: policyId,
            collection: 'notifications',
            action,
            permissions: { branch_id: { _eq: '$CURRENT_USER.branch_id' } },
            fields: ['*']
          });
        }
        console.log('   ✅ Added permissions');
      }
    } else {
      console.log('   ❌ Failed:', createCollRes.data);
    }
  } else {
    console.log('   ✅ notifications collection exists');
  }

  // 5. Test the relations
  console.log('\n5. Testing relations...');
  const testRes = await apiRequest('GET', '/items/members?limit=1&fields=*,contracts.*,payments.*');

  if (testRes.ok && testRes.data.data.length > 0) {
    const member = testRes.data.data[0];
    console.log(`   Member: ${member.full_name}`);
    console.log(`   Contracts: ${member.contracts?.length || 0}`);
    console.log(`   Payments: ${member.payments?.length || 0}`);
  }

  console.log('\n🎉 Done!');
}

fix().catch(console.error);
