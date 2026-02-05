import { db } from './index.js';
import { tenants, branches, jobTitles, users, employees, members, memberCredentials, membershipPlans, contracts, payments } from './schema.js';
import { hash } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

async function seed() {
  console.log('🌱 開始建立種子資料...\n');

  // 1. 建立租戶
  console.log('📦 建立租戶...');
  const [tenant] = await db.insert(tenants).values({
    name: 'Gym Nexus 健身中心',
    slug: 'gym-nexus',
    email: 'contact@gymnexus.tw',
    phone: '02-2345-6789',
    planType: 'professional',
    maxBranches: 10,
    maxMembers: 10000,
    maxEmployees: 100,
    maxStorageMb: 10240,
    tenantStatus: 'active',
    settings: {
      timezone: 'Asia/Taipei',
      currency: 'TWD',
      language: 'zh-TW',
    },
  }).returning();
  console.log(`  ✅ 租戶已建立: ${tenant.name} (${tenant.id})\n`);

  // 2. 建立分店 (台北總店 + 4間分店)
  console.log('🏢 建立分店...');
  const branchData = [
    { name: 'Gym Nexus 台北總店', code: 'TPE-HQ', type: 'HEADQUARTER' as const, address: '台北市信義區信義路五段7號', phone: '02-2345-6789' },
    { name: 'Gym Nexus 台中店', code: 'TXG-01', type: 'BRANCH' as const, address: '台中市西屯區台灣大道三段251號', phone: '04-2345-6789' },
    { name: 'Gym Nexus 台南店', code: 'TNN-01', type: 'BRANCH' as const, address: '台南市中西區中山路88號', phone: '06-234-5678' },
    { name: 'Gym Nexus 高雄店', code: 'KHH-01', type: 'BRANCH' as const, address: '高雄市前鎮區中山二路260號', phone: '07-234-5678' },
    { name: 'Gym Nexus 屏東店', code: 'PIF-01', type: 'BRANCH' as const, address: '屏東縣屏東市自由路527號', phone: '08-765-4321' },
  ];

  const createdBranches = await db.insert(branches).values(
    branchData.map(b => ({
      ...b,
      tenantId: tenant.id,
      settings: {
        openingHours: {
          weekday: '06:00-23:00',
          weekend: '08:00-22:00',
        },
      },
    }))
  ).returning();

  createdBranches.forEach(b => {
    console.log(`  ✅ ${b.name} (${b.type})`);
  });
  console.log();

  const taipeiHQ = createdBranches[0];
  const taichungBranch = createdBranches[1];

  // 3. 建立職稱
  console.log('👔 建立職稱...');
  const jobTitleData = [
    { name: '總經理', code: 'GM', level: 100, permissions: { all: true } },
    { name: '店長', code: 'MGR', level: 80, permissions: { branch: true, members: true, employees: true, reports: true } },
    { name: '副店長', code: 'AMGR', level: 70, permissions: { branch: true, members: true, employees: false, reports: true } },
    { name: '教練主管', code: 'CMGR', level: 60, permissions: { classes: true, members: true, coaches: true } },
    { name: '資深教練', code: 'SRCOACH', level: 50, permissions: { classes: true, members: true } },
    { name: '教練', code: 'COACH', level: 40, permissions: { classes: true, myMembers: true } },
    { name: '櫃檯人員', code: 'FRONT', level: 30, permissions: { checkIn: true, members: true } },
    { name: '清潔人員', code: 'CLEAN', level: 10, permissions: { basic: true } },
  ];

  const createdJobTitles = await db.insert(jobTitles).values(
    jobTitleData.map(j => ({
      name: j.name,
      code: j.code,
      level: j.level,
      permissionsConfig: j.permissions,
      tenantId: tenant.id,
    }))
  ).returning();

  createdJobTitles.forEach(j => {
    console.log(`  ✅ ${j.name} (Level: ${j.level})`);
  });
  console.log();

  const gmTitle = createdJobTitles.find(j => j.name === '總經理')!;
  const managerTitle = createdJobTitles.find(j => j.name === '店長')!;
  const coachTitle = createdJobTitles.find(j => j.name === '教練')!;
  const frontDeskTitle = createdJobTitles.find(j => j.name === '櫃檯人員')!;

  // 4. 建立管理員帳號
  console.log('👤 建立管理員帳號...');
  const adminPasswordHash = await hash('admin', ARGON2_OPTIONS);

  const [adminUser] = await db.insert(users).values({
    email: 'admin@gym.com',
    passwordHash: adminPasswordHash,
    role: 'admin',
    tenantId: tenant.id,
    isActive: true,
    emailVerified: true,
  }).returning();
  console.log(`  ✅ 管理員帳號: admin@gym.com / admin\n`);

  // 5. 建立員工
  console.log('👥 建立員工...');
  const employeeData = [
    { fullName: '王大明', email: 'admin@gym.com', phone: '0912-345-678', branch: taipeiHQ, jobTitle: gmTitle, userId: adminUser.id, code: 'EMP001' },
    { fullName: '李美玲', email: 'manager.taipei@gym.com', phone: '0923-456-789', branch: taipeiHQ, jobTitle: managerTitle, code: 'EMP002' },
    { fullName: '張志豪', email: 'manager.taichung@gym.com', phone: '0934-567-890', branch: taichungBranch, jobTitle: managerTitle, code: 'EMP003' },
    { fullName: '陳建宏', email: 'coach.chen@gym.com', phone: '0945-678-901', branch: taipeiHQ, jobTitle: coachTitle, code: 'EMP004' },
    { fullName: '林小華', email: 'coach.lin@gym.com', phone: '0956-789-012', branch: taipeiHQ, jobTitle: coachTitle, code: 'EMP005' },
    { fullName: '黃雅婷', email: 'coach.huang@gym.com', phone: '0967-890-123', branch: taichungBranch, jobTitle: coachTitle, code: 'EMP006' },
    { fullName: '吳佳琪', email: 'frontdesk@gym.com', phone: '0978-901-234', branch: taipeiHQ, jobTitle: frontDeskTitle, code: 'EMP007' },
  ];

  // 為店長和教練建立登入帳號
  const managerPasswordHash = await hash('manager123', ARGON2_OPTIONS);
  const coachPasswordHash = await hash('coach123', ARGON2_OPTIONS);
  const staffPasswordHash = await hash('staff123', ARGON2_OPTIONS);

  for (const emp of employeeData) {
    let userId = emp.userId;
    const jobLevel = emp.jobTitle.level ?? 0;

    // 如果不是管理員，建立新的 user 帳號
    if (!userId && jobLevel >= 40) {
      let passwordHash = staffPasswordHash;
      if (jobLevel >= 80) passwordHash = managerPasswordHash;
      else if (jobLevel >= 40) passwordHash = coachPasswordHash;

      const [newUser] = await db.insert(users).values({
        email: emp.email,
        passwordHash,
        role: jobLevel >= 80 ? 'manager' : 'staff',
        tenantId: tenant.id,
        isActive: true,
        emailVerified: true,
      }).returning();
      userId = newUser.id;
    }

    await db.insert(employees).values({
      employeeCode: emp.code,
      fullName: emp.fullName,
      email: emp.email,
      phone: emp.phone,
      branchId: emp.branch.id,
      jobTitleId: emp.jobTitle.id,
      userId: userId,
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      hireDate: '2024-01-01',
      tenantId: tenant.id,
    });

    console.log(`  ✅ ${emp.fullName} - ${emp.jobTitle.name} @ ${emp.branch.name}`);
  }
  console.log();

  // 6. 建立會員
  console.log('🏋️ 建立會員...');
  const memberPasswordHash = await hash('member123', ARGON2_OPTIONS);

  const memberData = [
    { fullName: '趙小明', email: 'member1@example.com', phone: '0911-111-111', gender: 'MALE' as const, branch: taipeiHQ, code: 'MEM001' },
    { fullName: '錢美美', email: 'member2@example.com', phone: '0922-222-222', gender: 'FEMALE' as const, branch: taipeiHQ, code: 'MEM002' },
    { fullName: '孫大強', email: 'member3@example.com', phone: '0933-333-333', gender: 'MALE' as const, branch: taipeiHQ, code: 'MEM003' },
    { fullName: '周小芳', email: 'member4@example.com', phone: '0944-444-444', gender: 'FEMALE' as const, branch: taichungBranch, code: 'MEM004' },
    { fullName: '吳健身', email: 'member5@example.com', phone: '0955-555-555', gender: 'MALE' as const, branch: taichungBranch, code: 'MEM005' },
    { fullName: '鄭美麗', email: 'admin@gym.com', phone: '0966-666-666', gender: 'FEMALE' as const, branch: taipeiHQ, code: 'MEM006' },
  ];

  for (const mem of memberData) {
    const [member] = await db.insert(members).values({
      memberCode: mem.code,
      fullName: mem.fullName,
      email: mem.email,
      phone: mem.phone,
      gender: mem.gender,
      branchId: mem.branch.id,
      status: 'ACTIVE',
      joinDate: '2024-06-01',
      tenantId: tenant.id,
    }).returning();

    // 建立會員登入憑證
    await db.insert(memberCredentials).values({
      memberId: member.id,
      passwordHash: memberPasswordHash,
    });

    console.log(`  ✅ ${mem.fullName} (${mem.email}) @ ${mem.branch.name}`);
  }
  console.log();

  // 7. 建立會籍方案
  console.log('📋 建立會籍方案...');
  const planData = [
    { name: '月費會員', code: 'MONTHLY', planType: 'TIME_BASED' as const, durationMonths: 1, price: '1500', description: '每月自動續約' },
    { name: '季費會員', code: 'QUARTERLY', planType: 'TIME_BASED' as const, durationMonths: 3, price: '3999', description: '一次購買三個月' },
    { name: '年費會員', code: 'YEARLY', planType: 'TIME_BASED' as const, durationMonths: 12, price: '12000', description: '年繳優惠方案' },
    { name: '10堂課程包', code: 'CLASS10', planType: 'COUNT_BASED' as const, classCounts: 10, price: '5000', description: '10堂教練課程' },
    { name: '20堂課程包', code: 'CLASS20', planType: 'COUNT_BASED' as const, classCounts: 20, price: '8800', description: '20堂教練課程，優惠價' },
  ];

  const createdPlans = await db.insert(membershipPlans).values(
    planData.map(p => ({
      name: p.name,
      code: p.code,
      planType: p.planType,
      durationMonths: p.durationMonths,
      classCounts: p.classCounts,
      price: p.price,
      description: p.description,
      isActive: true,
      tenantId: tenant.id,
    }))
  ).returning();

  createdPlans.forEach(p => {
    console.log(`  ✅ ${p.name} - $${p.price}`);
  });
  console.log();

  const monthlyPlan = createdPlans.find(p => p.code === 'MONTHLY')!;
  const yearlyPlan = createdPlans.find(p => p.code === 'YEARLY')!;
  const class10Plan = createdPlans.find(p => p.code === 'CLASS10')!;

  // 8. 建立合約
  console.log('📝 建立合約...');

  // 取得已建立的會員
  const existingMembers = await db.select().from(members);

  const today = new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const oneYearFromNow = new Date(today);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const oneMonthFromNow = new Date(today);
  oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
  const sixMonthsFromNow = new Date(today);
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

  const contractData = [
    { member: existingMembers[0], plan: yearlyPlan, startDate: threeMonthsAgo, endDate: oneYearFromNow, status: 'ACTIVE' as const },
    { member: existingMembers[1], plan: monthlyPlan, startDate: oneMonthAgo, endDate: oneMonthFromNow, status: 'ACTIVE' as const },
    { member: existingMembers[2], plan: class10Plan, startDate: oneMonthAgo, endDate: sixMonthsFromNow, status: 'ACTIVE' as const, remainingCounts: 7 },
    { member: existingMembers[3], plan: yearlyPlan, startDate: threeMonthsAgo, endDate: oneYearFromNow, status: 'ACTIVE' as const },
  ];

  const createdContracts = [];
  for (let i = 0; i < contractData.length; i++) {
    const c = contractData[i];
    const contractNo = `CON${String(i + 1).padStart(6, '0')}`;
    const endDateStr = c.endDate.toISOString().split('T')[0];
    const [contract] = await db.insert(contracts).values({
      contractNo,
      memberId: c.member.id,
      planId: c.plan.id,
      branchId: c.member.branchId!,
      status: c.status,
      startDate: c.startDate.toISOString().split('T')[0],
      originalEndDate: endDateStr,
      endDate: endDateStr,
      totalAmount: c.plan.price!,
      paidAmount: c.plan.price!,
      remainingCounts: c.remainingCounts,
      tenantId: tenant.id,
    }).returning();
    createdContracts.push(contract);
    console.log(`  ✅ ${contractNo} - ${c.member.fullName} (${c.plan.name})`);
  }
  console.log();

  // 9. 建立付款記錄
  console.log('💰 建立付款記錄...');

  const paymentData = [
    { contract: createdContracts[0], amount: '12000', date: threeMonthsAgo, method: 'CREDIT_CARD' as const },
    { contract: createdContracts[1], amount: '1500', date: oneMonthAgo, method: 'CASH' as const },
    { contract: createdContracts[2], amount: '5000', date: oneMonthAgo, method: 'BANK_TRANSFER' as const },
    { contract: createdContracts[3], amount: '12000', date: threeMonthsAgo, method: 'CREDIT_CARD' as const },
    // 本月的額外收入
    { contract: createdContracts[1], amount: '1500', date: today, method: 'CASH' as const },
  ];

  for (let i = 0; i < paymentData.length; i++) {
    const p = paymentData[i];
    await db.insert(payments).values({
      memberId: p.contract.memberId,
      contractId: p.contract.id,
      branchId: p.contract.branchId,
      amount: p.amount,
      type: 'INCOME',
      paymentMethod: p.method,
      paymentDate: p.date,
      tenantId: tenant.id,
    });
    console.log(`  ✅ $${p.amount} - ${p.method}`);
  }
  console.log();

  // 總結
  console.log('═'.repeat(50));
  console.log('🎉 種子資料建立完成！\n');
  console.log('📊 資料統計：');
  console.log('─'.repeat(50));
  console.log(`  👥 會員: ${existingMembers.length} 人 (全部 ACTIVE)`);
  console.log(`  📝 合約: ${createdContracts.length} 份 (全部 ACTIVE)`);
  console.log(`  💰 付款: ${paymentData.length} 筆`);
  console.log(`  📋 方案: ${createdPlans.length} 種`);
  console.log();
  console.log('📋 登入帳號一覽：');
  console.log('─'.repeat(50));
  console.log('【Admin Web - 管理後台】');
  console.log('  👑 總經理: admin@gym.com / admin');
  console.log('  🏪 台北店長: manager.taipei@gym.com / manager123');
  console.log('  🏪 台中店長: manager.taichung@gym.com / manager123');
  console.log('  💪 教練: coach.chen@gym.com / coach123');
  console.log();
  console.log('【Member App - 會員 App】');
  console.log('  🏋️ 會員: member1@example.com / member123');
  console.log('  🏋️ 會員: admin@gym.com / member123');
  console.log();
  console.log('【Coach App - 教練 App】');
  console.log('  💪 教練: coach.chen@gym.com / coach123');
  console.log('  💪 教練: coach.lin@gym.com / coach123');
  console.log('═'.repeat(50));
}

seed()
  .then(() => {
    console.log('\n✅ Seed 完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed 失敗:', error);
    process.exit(1);
  });
