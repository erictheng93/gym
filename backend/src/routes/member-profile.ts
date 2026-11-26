import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, members, branches, contracts, membershipPlans, memberCredentials, memberSocialAccounts, otpTokens, otpSendLogs } from '../db/index.js';
import { eq, and, ne, desc, inArray, sql } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember, rateLimiter, limitMax, getClientIp } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';
import {
  generateOtp,
  consumeOtp,
  deliverPhoneOtp,
  memberPhoneOtpIdentifier,
  otpDevMode,
  phoneOtpLogError,
  OTP_TTL_MS,
  SMS_UNAVAILABLE_RESPONSE,
} from '../services/otp.js';

// =============================================================================
// MEMBER PROFILE ROUTES
// =============================================================================
// Profile management for member-app
// Endpoints: /me (GET, PUT), /phone/otp, /phone, /complete-profile

const app = new Hono<{ Variables: MemberVariables }>();

/** The token's member, only within the token's tenant. */
const ownMember = (m: { id: string; tenantId: string }) =>
  and(eq(members.id, m.id), eq(members.tenantId, m.tenantId));

// Apply member auth middleware
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

// No `phone`: a phone change must be proven with a code (POST /phone/otp, then
// POST /phone). A body that still carries one is refused, not silently ignored.
const updateProfileSchema = z.object({
  fullName: z.string().min(2, '姓名至少 2 個字元').max(100).optional(),
  phone: z.unknown().optional(),
  email:z.string().email('請輸入有效的 Email').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式: YYYY-MM-DD').optional(),
  address: z.string().max(500).optional(),
  emergencyContact: z.string().max(100).optional(),
  emergencyPhone: z.string().regex(/^0\d{8,9}$/, '請輸入有效的電話號碼').optional().or(z.literal('')),
  height: z.number().min(50).max(250).optional(),
});

const phoneSchema = z.string().trim().regex(/^09\d{2}[- ]?\d{3}[- ]?\d{3}$/, '請輸入有效的手機號碼')
  .transform(phone => phone.replace(/[- ]/g, ''));

const phoneOtpSchema = z.object({
  phone: phoneSchema,
});

const otpCodeSchema = z.string().regex(/^\d{6}$/, '驗證碼必須是 6 位數字');

const changePhoneSchema = z.object({
  phone: phoneSchema,
  otpCode: otpCodeSchema,
});

const completeProfileSchema = z.object({
  phone: phoneSchema,
  otpCode: otpCodeSchema,
  fullName: z.string().trim().min(2, '姓名至少 2 個字元').max(100).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式: YYYY-MM-DD').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  emergencyContact: z.string().max(100).optional(),
  emergencyPhone: z.string().regex(/^0\d{8,9}$/, '請輸入有效的電話號碼').optional(),
});

const MEMBER_PROFILE_FULL_SELECT = {
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
  branch_id: branches.id,
  branch_name: branches.name,
  branch_address: branches.address,
  branch_phone: branches.phone,
};

const MEMBER_ACTIVE_CONTRACTS_SELECT = {
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
};

const MEMBER_CREDENTIALS_ID_SELECT = { id: memberCredentials.id };

const MEMBER_COMPLETE_PROFILE_RETURNING = {
  id: members.id,
  memberCode: members.memberCode,
  fullName: members.fullName,
  phone: members.phone,
  email: members.email,
  gender: members.gender,
  birthday: members.birthday,
  status: members.status,
};

const MEMBER_SOCIAL_ACCOUNTS_SELECT = {
  provider: memberSocialAccounts.provider,
  email: memberSocialAccounts.email,
  displayName: memberSocialAccounts.displayName,
  createdAt: memberSocialAccounts.createdAt,
};

export const MEMBER_ID_SELECT = { id: members.id };

export const MEMBER_PROFILE_UPDATE_RETURNING = {
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
};

// -----------------------------------------------------------------------------
// GET /api/member/me - Get current member profile
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const memberInfo = c.get('member')!;

  // Concurrently fetch full member details with branch info, active contracts, credentials, and social accounts
  const [[memberResult], activeContracts, [credentials], socialAccounts] = await Promise.all([
    db
      .select(MEMBER_PROFILE_FULL_SELECT)
      .from(members)
      .leftJoin(branches, eq(members.branchId, branches.id))
      .where(ownMember(memberInfo))
      .limit(1),
    db
      .select(MEMBER_ACTIVE_CONTRACTS_SELECT)
      .from(contracts)
      .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(and(
        eq(contracts.memberId, memberInfo.id),
        eq(contracts.tenantId, memberInfo.tenantId),
        inArray(contracts.status, ['ACTIVE', 'PAUSED']),
      ))
      .orderBy(desc(contracts.endDate)),
    db
      .select(MEMBER_CREDENTIALS_ID_SELECT)
      .from(memberCredentials)
      .where(eq(memberCredentials.memberId, memberInfo.id))
      .limit(1),
    db
      .select(MEMBER_SOCIAL_ACCOUNTS_SELECT)
      .from(memberSocialAccounts)
      .where(eq(memberSocialAccounts.memberId, memberInfo.id)),
  ]);

  if (!memberResult) {
    return c.json({
      success: false,
      error: '會員不存在',
      code: 'MEMBER_NOT_FOUND',
    }, 404);
  }

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
        id: memberResult.id,
        memberCode: memberResult.memberCode,
        fullName: memberResult.fullName,
        phone: memberResult.phone,
        email: memberResult.email,
        gender: memberResult.gender,
        birthday: memberResult.birthday,
        address: memberResult.address,
        emergencyContact: memberResult.emergencyContact,
        emergencyPhone: memberResult.emergencyPhone,
        status: memberResult.status,
        joinDate: memberResult.joinDate,
        avatar: memberResult.avatar,
        height: memberResult.height,
        hasPassword: !!credentials,
        socialAccounts: socialAccounts.map(sa => ({
          provider: sa.provider,
          email: sa.email,
          displayName: sa.displayName,
          linkedAt: sa.createdAt,
        })),
      },
      branch: memberResult.branch_id ? {
        id: memberResult.branch_id,
        name: memberResult.branch_name,
        address: memberResult.branch_address,
        phone: memberResult.branch_phone,
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
    const { phone, ...updates } = c.req.valid('json');

    if (phone !== undefined) {
      return c.json({
        success: false,
        error: '變更手機號碼需要簡訊驗證，請使用手機驗證流程',
        code: 'PHONE_VERIFICATION_REQUIRED',
      }, 400);
    }

    const [existingEmailMember] = updates.email
      ? await db.select(MEMBER_ID_SELECT).from(members).where(and(eq(members.email, updates.email), ne(members.id, memberInfo.id))).limit(1)
      : [];

    if (existingEmailMember) {
      return c.json({
        success: false,
        error: '此 Email 已被使用',
        code: 'EMAIL_TAKEN',
      }, 400);
    }

    // Update member
    const [updatedMember] = await db
      .update(members)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(ownMember(memberInfo))
      .returning(MEMBER_PROFILE_UPDATE_RETURNING);

    if (!updatedMember) {
      return c.json({ success: false, error: '會員不存在', code: 'MEMBER_NOT_FOUND' }, 404);
    }

    return c.json({
      success: true,
      data: {
        member: updatedMember,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// Phone verification (complete-profile)
// -----------------------------------------------------------------------------
// The phone saved by /complete-profile must be proven with a code sent to that
// number for this member: the token's identifier binds member + phone (see
// memberPhoneOtpIdentifier), and consumeOtp enforces expiry, attempts and
// single use. No login tokens are issued here.

const PHONE_TAKEN_RESPONSE = {
  success: false,
  error: '此手機號碼已被其他會員使用，請改用其他號碼或洽櫃台協助',
  code: 'PHONE_TAKEN',
} as const;

/** Whether another member of the tenant has `phone` (ignoring separators). */
async function phoneTakenByOther(
  member: { id: string; tenantId: string },
  phone: string,
  executor: Pick<typeof db, 'select'> = db,
): Promise<boolean> {
  const [taken] = await executor
    .select(MEMBER_ID_SELECT)
    .from(members)
    .where(and(
      eq(members.tenantId, member.tenantId),
      eq(sql`translate(${members.phone}, '- ', '')`, phone),
      ne(members.id, member.id),
    ))
    .limit(1);
  return !!taken;
}

const memberRateKey = (c: Context<{ Variables: MemberVariables }>) => c.get('member')?.id ?? 'anonymous';

const phoneOtpSendLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: limitMax(1),
  keyGenerator: (c) => `member-phone-otp:send:${memberRateKey(c)}`,
  message: '發送過於頻繁，請 1 分鐘後再試',
});

const phoneOtpSendHourlyLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: limitMax(5),
  keyGenerator: (c) => `member-phone-otp:send:hourly:${memberRateKey(c)}`,
  message: '發送次數已達上限，請稍後再試',
});

const phoneOtpSendIpLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: limitMax(20),
  keyGenerator: (c) => `member-phone-otp:send:ip:${getClientIp(c)}`,
  message: '發送次數已達上限，請稍後再試',
});

const completeProfileLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: limitMax(5),
  keyGenerator: (c) => `member-phone-otp:verify:${memberRateKey(c)}`,
  message: '驗證次數過多，請 15 分鐘後再試',
});

// -----------------------------------------------------------------------------
// POST /api/member/me/phone/otp - Send a phone verification code
// -----------------------------------------------------------------------------

app.post(
  '/phone/otp',
  zValidator('json', phoneOtpSchema),
  phoneOtpSendLimiter,
  phoneOtpSendHourlyLimiter,
  phoneOtpSendIpLimiter,
  async (c) => {
    const memberInfo = c.get('member')!;
    const { phone } = c.req.valid('json');
    const ip = getClientIp(c);
    const ipAddress = ip === 'unknown' ? undefined : ip;

    const [member] = await db
      .select({ id: members.id, status: members.status, branchId: members.branchId })
      .from(members)
      .where(ownMember(memberInfo))
      .limit(1);

    if (!member) {
      return c.json({ success: false, error: '會員不存在', code: 'MEMBER_NOT_FOUND' }, 404);
    }
    if (member.status === 'BANNED') {
      return c.json({ success: false, error: '帳號已停權', code: 'MEMBER_BANNED' }, 403);
    }
    if (await phoneTakenByOther(memberInfo, phone)) {
      return c.json(PHONE_TAKEN_RESPONSE, 409);
    }

    const identifier = memberPhoneOtpIdentifier(memberInfo.id, phone);
    const code = generateOtp();

    // One live code per member + phone: a resend replaces the previous code
    await db.delete(otpTokens).where(and(
      eq(otpTokens.identifier, identifier),
      eq(otpTokens.identifierType, 'phone'),
    ));
    await db.insert(otpTokens).values({
      identifier,
      identifierType: 'phone',
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      ipAddress,
      userAgent: c.req.header('user-agent') || '',
    });

    const delivery = await deliverPhoneOtp({ phone, code, memberId: member.id, branchId: member.branchId });

    await db.insert(otpSendLogs).values({
      identifier: phone,
      identifierType: 'phone',
      ipAddress,
      success: delivery.ok && delivery.delivered,
      errorMessage: phoneOtpLogError(delivery),
    });

    if (!delivery.ok) {
      // The code never reached the phone: drop it and say so
      await db.delete(otpTokens).where(and(
        eq(otpTokens.identifier, identifier),
        eq(otpTokens.identifierType, 'phone'),
      ));
      return c.json(SMS_UNAVAILABLE_RESPONSE, 503);
    }

    const exposeCode = otpDevMode();
    return c.json({
      success: true,
      message: '驗證碼已發送',
      data: {
        expiresIn: OTP_TTL_MS / 1000,
        ...(exposeCode && { otp: code }),
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/me/complete-profile - Complete profile after social login
// -----------------------------------------------------------------------------
// Body: { phone, otpCode, fullName?, birthday?, gender?, emergencyContact?, emergencyPhone? }
// `otpCode` must come from POST /phone/otp for this member and this phone.

class PhoneTakenError extends Error {}

/**
 * Save `phone` (plus `fields`) on the member if `otpCode` is the code sent to
 * that phone for this member. Same-phone claims in a tenant are serialized by
 * an advisory lock, and a phone held by another member of the tenant is refused.
 */
async function saveVerifiedPhone(
  memberInfo: { id: string; tenantId: string },
  phone: string,
  otpCode: string,
  fields: Partial<Pick<typeof members.$inferInsert,
    'fullName' | 'birthday' | 'gender' | 'emergencyContact' | 'emergencyPhone'>> = {},
) {
  try {
    return await db.transaction(async (tx) => {
      // Serialize claims of the same phone within a tenant
      const lockKey = `member-phone:${memberInfo.tenantId}:${phone}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      if (await phoneTakenByOther(memberInfo, phone, tx)) {
        throw new PhoneTakenError();
      }

      const otp = await consumeOtp(
        and(
          eq(otpTokens.identifier, memberPhoneOtpIdentifier(memberInfo.id, phone)),
          eq(otpTokens.identifierType, 'phone'),
        ),
        otpCode,
        tx,
      );
      // Returning (not throwing) commits the counted attempt
      if (!otp.ok) return { ok: false as const, failure: otp.failure };

      const [updatedMember] = await tx
        .update(members)
        .set({ ...fields, phone, updatedAt: new Date() })
        .where(ownMember(memberInfo))
        .returning(MEMBER_COMPLETE_PROFILE_RETURNING);

      return { ok: true as const, member: updatedMember };
    });
  } catch (error) {
    if (error instanceof PhoneTakenError) return { ok: false as const, taken: true as const };
    throw error;
  }
}

app.post(
  '/complete-profile',
  zValidator('json', completeProfileSchema),
  completeProfileLimiter,
  async (c) => {
    const memberInfo = c.get('member')!;
    const { phone, otpCode, ...fields } = c.req.valid('json');

    const result = await saveVerifiedPhone(memberInfo, phone, otpCode, {
      ...(fields.fullName && { fullName: fields.fullName }),
      birthday: fields.birthday || null,
      gender: fields.gender || null,
      emergencyContact: fields.emergencyContact || null,
      emergencyPhone: fields.emergencyPhone || null,
    });

    if (!result.ok) {
      return 'taken' in result
        ? c.json(PHONE_TAKEN_RESPONSE, 409)
        : c.json({ success: false, ...result.failure }, 400);
    }
    if (!result.member) {
      return c.json({ success: false, error: '會員不存在', code: 'MEMBER_NOT_FOUND' }, 404);
    }

    return c.json({
      success: true,
      message: '資料已更新',
      data: {
        member: result.member,
        profileComplete: true,
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/me/phone - Change the phone of an existing profile
// -----------------------------------------------------------------------------
// Body: { phone, otpCode } — `otpCode` from POST /phone/otp for this member and
// this phone. Only the phone changes (complete-profile also rewrites the other
// profile fields).

app.post(
  '/phone',
  zValidator('json', changePhoneSchema),
  completeProfileLimiter,
  async (c) => {
    const memberInfo = c.get('member')!;
    const { phone, otpCode } = c.req.valid('json');

    const result = await saveVerifiedPhone(memberInfo, phone, otpCode);

    if (!result.ok) {
      return 'taken' in result
        ? c.json(PHONE_TAKEN_RESPONSE, 409)
        : c.json({ success: false, ...result.failure }, 400);
    }
    if (!result.member) {
      return c.json({ success: false, error: '會員不存在', code: 'MEMBER_NOT_FOUND' }, 404);
    }

    return c.json({
      success: true,
      message: '手機號碼已更新',
      data: { member: result.member },
    });
  }
);

export default app;
