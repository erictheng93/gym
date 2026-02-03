import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, members, branches, contracts, membershipPlans, memberCredentials, memberSocialAccounts } from '../db/index.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER PROFILE ROUTES
// =============================================================================
// Profile management for member-app
// Endpoints: /me (GET, PUT), /complete-profile

const app = new Hono<{ Variables: MemberVariables }>();

// Apply member auth middleware
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const updateProfileSchema = z.object({
  fullName: z.string().min(2, '姓名至少 2 個字元').max(100).optional(),
  phone: z.string().regex(/^09\d{8}$/, '請輸入有效的手機號碼').optional(),
  email: z.string().email('請輸入有效的 Email').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式: YYYY-MM-DD').optional(),
  address: z.string().max(500).optional(),
  emergencyContact: z.string().max(100).optional(),
  emergencyPhone: z.string().regex(/^0\d{8,9}$/, '請輸入有效的電話號碼').optional().or(z.literal('')),
  height: z.number().min(50).max(250).optional(),
});

const completeProfileSchema = z.object({
  phone: z.string().regex(/^09\d{8}$/, '請輸入有效的手機號碼'),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式: YYYY-MM-DD').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  emergencyContact: z.string().max(100).optional(),
  emergencyPhone: z.string().regex(/^0\d{8,9}$/, '請輸入有效的電話號碼').optional(),
});

// -----------------------------------------------------------------------------
// GET /api/member/me - Get current member profile
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const memberInfo = c.get('member')!;

  // Get full member details
  const [member] = await db
    .select({
      id: members.id,
      memberCode: members.memberCode,
      fullName: members.fullName,
      phone: members.phone,
      email: members.email,
      gender: members.gender,
      birthday: members.birthday,
      idNumber: members.idNumber,
      address: members.address,
      emergencyContact: members.emergencyContact,
      emergencyPhone: members.emergencyPhone,
      branchId: members.branchId,
      salesPersonId: members.salesPersonId,
      status: members.status,
      joinDate: members.joinDate,
      tags: members.tags,
      notes: members.notes,
      avatar: members.avatar,
      height: members.height,
      createdAt: members.createdAt,
    })
    .from(members)
    .where(eq(members.id, memberInfo.id))
    .limit(1);

  if (!member) {
    return c.json({
      success: false,
      error: '會員不存在',
      code: 'MEMBER_NOT_FOUND',
    }, 404);
  }

  // Get branch info
  const [branch] = await db
    .select({
      id: branches.id,
      name: branches.name,
      address: branches.address,
      phone: branches.phone,
    })
    .from(branches)
    .where(eq(branches.id, member.branchId))
    .limit(1);

  // Get active contracts with plan info
  const activeContracts = await db
    .select({
      id: contracts.id,
      contractNo: contracts.contractNo,
      status: contracts.status,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      originalEndDate: contracts.originalEndDate,
      remainingCounts: contracts.remainingCounts,
      totalAmount: contracts.totalAmount,
      paidAmount: contracts.paidAmount,
      paymentStatus: contracts.paymentStatus,
      planId: contracts.planId,
      planName: membershipPlans.name,
      planType: membershipPlans.planType,
      planDurationMonths: membershipPlans.durationMonths,
      planClassCounts: membershipPlans.classCounts,
    })
    .from(contracts)
    .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
    .where(and(
      eq(contracts.memberId, member.id),
      inArray(contracts.status, ['ACTIVE', 'PAUSED']),
    ))
    .orderBy(desc(contracts.endDate));

  // Get credentials status (has password)
  const [credentials] = await db
    .select({ id: memberCredentials.id })
    .from(memberCredentials)
    .where(eq(memberCredentials.memberId, member.id))
    .limit(1);

  // Get linked social accounts
  const socialAccounts = await db
    .select({
      provider: memberSocialAccounts.provider,
      email: memberSocialAccounts.email,
      displayName: memberSocialAccounts.displayName,
      createdAt: memberSocialAccounts.createdAt,
    })
    .from(memberSocialAccounts)
    .where(eq(memberSocialAccounts.memberId, member.id));

  // Format contracts
  const formattedContracts = activeContracts.map(c => ({
    id: c.id,
    contractNo: c.contractNo,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    originalEndDate: c.originalEndDate,
    remainingCounts: c.remainingCounts,
    totalAmount: Number(c.totalAmount),
    paidAmount: Number(c.paidAmount),
    paymentStatus: c.paymentStatus,
    plan: {
      id: c.planId,
      name: c.planName,
      type: c.planType,
      durationMonths: c.planDurationMonths,
      classCounts: c.planClassCounts,
    },
    // Calculate days remaining
    daysRemaining: c.endDate
      ? Math.max(0, Math.ceil((new Date(c.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null,
  }));

  return c.json({
    success: true,
    data: {
      member: {
        id: member.id,
        memberCode: member.memberCode,
        fullName: member.fullName,
        phone: member.phone,
        email: member.email,
        gender: member.gender,
        birthday: member.birthday,
        address: member.address,
        emergencyContact: member.emergencyContact,
        emergencyPhone: member.emergencyPhone,
        status: member.status,
        joinDate: member.joinDate,
        avatar: member.avatar,
        height: member.height,
        hasPassword: !!credentials,
        socialAccounts: socialAccounts.map(sa => ({
          provider: sa.provider,
          email: sa.email,
          displayName: sa.displayName,
          linkedAt: sa.createdAt,
        })),
      },
      branch: branch ? {
        id: branch.id,
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
      } : null,
      contracts: formattedContracts,
    },
  });
});

// -----------------------------------------------------------------------------
// PUT /api/member/me - Update member profile
// -----------------------------------------------------------------------------

app.put(
  '/',
  zValidator('json', updateProfileSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const updates = c.req.valid('json');

    // Check if email is already taken by another member
    if (updates.email) {
      const [existingMember] = await db
        .select({ id: members.id })
        .from(members)
        .where(and(
          eq(members.email, updates.email),
        ))
        .limit(1);

      if (existingMember && existingMember.id !== memberInfo.id) {
        return c.json({
          success: false,
          error: '此 Email 已被使用',
          code: 'EMAIL_TAKEN',
        }, 400);
      }
    }

    // Check if phone is already taken by another member
    if (updates.phone) {
      const [existingMember] = await db
        .select({ id: members.id })
        .from(members)
        .where(and(
          eq(members.phone, updates.phone),
        ))
        .limit(1);

      if (existingMember && existingMember.id !== memberInfo.id) {
        return c.json({
          success: false,
          error: '此手機號碼已被使用',
          code: 'PHONE_TAKEN',
        }, 400);
      }
    }

    // Update member
    const [updatedMember] = await db
      .update(members)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(members.id, memberInfo.id))
      .returning({
        id: members.id,
        memberCode: members.memberCode,
        fullName: members.fullName,
        phone: members.phone,
        email: members.email,
        gender: members.gender,
        birthday: members.birthday,
        address: members.address,
        emergencyContact: members.emergencyContact,
        emergencyPhone: members.emergencyPhone,
        status: members.status,
        height: members.height,
      });

    return c.json({
      success: true,
      data: {
        member: updatedMember,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/complete-profile - Complete profile after social login
// -----------------------------------------------------------------------------

app.post(
  '/complete-profile',
  zValidator('json', completeProfileSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const profileData = c.req.valid('json');

    // Get current member
    const [member] = await db
      .select({
        id: members.id,
        phone: members.phone,
      })
      .from(members)
      .where(eq(members.id, memberInfo.id))
      .limit(1);

    if (!member) {
      return c.json({
        success: false,
        error: '會員不存在',
        code: 'MEMBER_NOT_FOUND',
      }, 404);
    }

    // Check if phone is already taken
    if (profileData.phone !== member.phone) {
      const [existingMember] = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.phone, profileData.phone))
        .limit(1);

      if (existingMember) {
        return c.json({
          success: false,
          error: '此手機號碼已被使用',
          code: 'PHONE_TAKEN',
        }, 400);
      }
    }

    // Update member profile
    const [updatedMember] = await db
      .update(members)
      .set({
        phone: profileData.phone,
        birthday: profileData.birthday || null,
        gender: profileData.gender || null,
        emergencyContact: profileData.emergencyContact || null,
        emergencyPhone: profileData.emergencyPhone || null,
        updatedAt: new Date(),
      })
      .where(eq(members.id, memberInfo.id))
      .returning({
        id: members.id,
        memberCode: members.memberCode,
        fullName: members.fullName,
        phone: members.phone,
        email: members.email,
        gender: members.gender,
        birthday: members.birthday,
        status: members.status,
      });

    return c.json({
      success: true,
      data: {
        member: updatedMember,
        profileComplete: true,
      },
    });
  }
);

export default app;
