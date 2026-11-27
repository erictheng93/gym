import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { hash } from '@node-rs/argon2';
import { and, eq, inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { db, contracts, contractLogs, payments, members, membershipPlans, files, users, sessions } from '../src/db/index.js';
import { fileService } from '../src/services/files.js';
import { generateContractHtml } from '../src/services/pdf.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  authRequest,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
  TEST_BRANCH_ID,
  TEST_MEMBER_ID,
  TEST_PLAN_ID,
  TEST_CONTRACT_B_ID,
  TEST_MEMBER_B_ID,
} from './helpers.js';

// =============================================================================
// TRANSFER / RENEW / EARLY RESUME / SIGNATURE AGAINST A REAL DATABASE
// =============================================================================
// docs/product-decisions.md rows 2-5. R2 is replaced by an in-memory S3 client so
// the real FileService (tenant-scoped key + files row) runs end to end.

const r2 = vi.hoisted(() => {
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  return { objects: new Map<string, Buffer>() };
});

vi.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(public input: { Key: string; Body?: Buffer }) {} }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  class S3Client {
    async send(command: Command) {
      const key = command.input.Key;
      if (command instanceof PutObjectCommand) r2.objects.set(key, Buffer.from(command.input.Body!));
      if (command instanceof DeleteObjectCommand) r2.objects.delete(key);
      if (command instanceof GetObjectCommand) {
        const body = r2.objects.get(key);
        if (!body) throw new Error('NoSuchKey');
        return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
      }
      return {};
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: async (_client: unknown, command: { input: { Key: string } }) => `https://r2.test/${command.input.Key}?signed=1`,
}));

// Lets one test make the last step of the transfer transaction throw.
const failRecalculate = vi.hoisted(() => ({ on: false }));
vi.mock('../src/services/contract-payment.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/contract-payment.js')>();
  return {
    ...actual,
    recalculateContractPayment: async (...args: Parameters<typeof actual.recalculateContractPayment>) => {
      if (failRecalculate.on) throw new Error('injected failure at the end of the transfer');
      return actual.recalculateContractPayment(...args);
    },
  };
});

// 1x1 PNG
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

const TRANSFER_TIME_PLAN_ID = crypto.randomUUID();
const TRANSFER_COUNT_PLAN_ID = crypto.randomUUID();
const RECIPIENT_ID = crypto.randomUUID();
const BANNED_ID = crypto.randomUUID();
const MANAGER_ID = crypto.randomUUID();
const STAFF_ID = crypto.randomUUID();
const PASSWORD = 'PlanTest123!';

const DAY_MS = 24 * 60 * 60 * 1000;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

type Status = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED';

async function createContract(opts: {
  status?: Status; planId?: string; memberId?: string; endDate?: string; remainingCounts?: number | null; signed?: boolean;
} = {}) {
  const id = crypto.randomUUID();
  await db.insert(contracts).values({
    id,
    contractNo: `TR${id.slice(0, 8)}`,
    memberId: opts.memberId ?? TEST_MEMBER_ID,
    planId: opts.planId ?? TRANSFER_TIME_PLAN_ID,
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
    startDate: '2026-01-01',
    originalEndDate: opts.endDate ?? '2027-03-31',
    endDate: opts.endDate ?? '2027-03-31',
    status: opts.status ?? 'ACTIVE',
    remainingCounts: opts.remainingCounts ?? null,
    totalAmount: '3000',
    paidAmount: '3000',
    paymentStatus: 'PAID',
    digitalSignature: opts.signed ? crypto.randomUUID() : null,
  });
  return id;
}

const getContract = async (id: string) => (await db.select().from(contracts).where(eq(contracts.id, id)))[0]!;
const logsOf = (contractId: string) => db.select().from(contractLogs).where(eq(contractLogs.contractId, contractId));
const paymentsOf = (contractId: string) => db.select().from(payments).where(eq(payments.contractId, contractId));
const transferredFrom = (id: string) => db.select().from(contracts).where(eq(contracts.transferredFromContractId, id));

async function createUser(id: string, email: string, role: 'staff' | 'manager') {
  await db.insert(users).values({
    id, email, passwordHash: await hash(PASSWORD), role, tenantId: TEST_TENANT_ID, isActive: true, emailVerified: true,
  });
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`login failed: ${JSON.stringify(data)}`);
  return data.data.token as string;
}

describe('Contract transfer / renew / early resume / signature (real DB)', () => {
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;

  const post = (path: string, body?: unknown, token = adminToken) => authRequest(path, {
    method: 'POST',
    token,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  beforeAll(async () => {
    await createTestFixtures();
    adminToken = await getAuthToken();
    managerToken = await createUser(MANAGER_ID, 'pn-manager@gym-nexus.test', 'manager');
    staffToken = await createUser(STAFF_ID, 'pn-staff@gym-nexus.test', 'staff');

    await db.insert(membershipPlans).values([
      {
        id: TRANSFER_TIME_PLAN_ID, name: '季卡（可轉讓）', code: 'PNT3', planType: 'TIME_BASED', durationMonths: 3,
        price: '4500', allowPause: true, allowTransfer: true, tenantId: TEST_TENANT_ID, branchId: TEST_BRANCH_ID,
      },
      {
        id: TRANSFER_COUNT_PLAN_ID, name: '10 堂（可轉讓）', code: 'PNC10', planType: 'COUNT_BASED', classCounts: 10,
        price: '8000', allowPause: true, allowTransfer: true, tenantId: TEST_TENANT_ID, branchId: TEST_BRANCH_ID,
      },
    ]);
    const joinDate = today();
    await db.insert(members).values([
      { id: RECIPIENT_ID, fullName: '受讓會員', phone: '0911000001', memberCode: `PNR${RECIPIENT_ID.slice(0, 6)}`, branchId: TEST_BRANCH_ID, status: 'EXPIRED', joinDate, tenantId: TEST_TENANT_ID },
      { id: BANNED_ID, fullName: '停權會員', phone: '0911000002', memberCode: `PNB${BANNED_ID.slice(0, 6)}`, branchId: TEST_BRANCH_ID, status: 'BANNED', joinDate, tenantId: TEST_TENANT_ID },
    ]);
  });

  afterEach(() => {
    failRecalculate.on = false;
  });

  afterAll(async () => {
    const tenantContracts = db.select({ id: contracts.id }).from(contracts).where(eq(contracts.tenantId, TEST_TENANT_ID));
    await db.delete(payments).where(inArray(payments.contractId, tenantContracts));
    await db.delete(contractLogs).where(inArray(contractLogs.contractId, tenantContracts));
    await db.delete(files).where(inArray(files.tenantId, [TEST_TENANT_ID, TEST_TENANT_B_ID]));
    await db.delete(sessions).where(inArray(sessions.userId, [MANAGER_ID, STAFF_ID]));
    await cleanupTestFixtures();
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/contracts/:id/transfer (decision 2)', () => {
    it('moves the contract to the recipient in one transaction: TRANSFERRED original, new contract, both logs, fee on the new contract', async () => {
      const id = await createContract({ planId: TRANSFER_COUNT_PLAN_ID, remainingCounts: 7 });

      const res = await post(`/api/contracts/${id}/transfer`, {
        toMemberId: RECIPIENT_ID, fee: 300, paymentMethod: 'CASH', reason: '會員出國',
      }, managerToken);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.original.status).toBe('TRANSFERRED');

      expect((await getContract(id)).status).toBe('TRANSFERRED');
      const [created] = await transferredFrom(id);
      expect(created).toMatchObject({
        id: body.data.contract.id,
        memberId: RECIPIENT_ID,
        planId: TRANSFER_COUNT_PLAN_ID,
        branchId: TEST_BRANCH_ID,
        status: 'ACTIVE',
        startDate: today(),
        endDate: '2027-03-31',
        originalEndDate: '2027-03-31',
        remainingCounts: 7,
        totalAmount: '0.00',
        paidAmount: '300.00',
        paymentStatus: 'PAID',
        tenantId: TEST_TENANT_ID,
      });

      for (const contractId of [id, created!.id]) {
        const logs = await logsOf(contractId);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          logType: 'TRANSFER', originalMemberId: TEST_MEMBER_ID, targetMemberId: RECIPIENT_ID, reason: '會員出國', tenantId: TEST_TENANT_ID,
        });
      }

      expect(await paymentsOf(id)).toHaveLength(0);
      const fees = await paymentsOf(created!.id);
      expect(fees).toHaveLength(1);
      expect(fees[0]).toMatchObject({ amount: '300.00', type: 'INCOME', status: 'COMPLETED', paymentMethod: 'CASH', memberId: RECIPIENT_ID });

      const [recipient] = await db.select().from(members).where(eq(members.id, RECIPIENT_ID));
      expect(recipient!.status).toBe('ACTIVE');
    });

    it('records no payment without a fee, and the 0-amount contract reads PAID', async () => {
      const id = await createContract();
      const res = await post(`/api/contracts/${id}/transfer`, { toMemberId: RECIPIENT_ID });
      expect(res.status).toBe(201);
      const [created] = await transferredFrom(id);
      expect(created).toMatchObject({ remainingCounts: null, totalAmount: '0.00', paymentStatus: 'PAID', endDate: '2027-03-31' });
      expect(await paymentsOf(created!.id)).toHaveLength(0);
    });

    it('is manager and above only: staff get 403 and nothing changes', async () => {
      const id = await createContract();
      const res = await post(`/api/contracts/${id}/transfer`, { toMemberId: RECIPIENT_ID }, staffToken);
      expect(res.status).toBe(403);
      expect((await getContract(id)).status).toBe('ACTIVE');
      expect(await transferredFrom(id)).toHaveLength(0);
    });

    it.each([
      ['a plan that does not allow transfer', { planId: TEST_PLAN_ID }, RECIPIENT_ID, '不允許轉讓'],
      ['a PAUSED contract', { status: 'PAUSED' as const }, RECIPIENT_ID, '有效狀態'],
      ['a DRAFT contract', { status: 'DRAFT' as const }, RECIPIENT_ID, '有效狀態'],
      ['a contract past its end date', { endDate: '2020-01-01' }, RECIPIENT_ID, '到期'],
      ['the same member', {}, TEST_MEMBER_ID, '原會員'],
      ['a BANNED recipient', {}, BANNED_ID, '受讓會員狀態'],
    ])('rejects %s with 400 and changes nothing', async (_name, opts, toMemberId, error) => {
      const id = await createContract(opts);
      const before = await getContract(id);

      const res = await post(`/api/contracts/${id}/transfer`, { toMemberId });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain(error);
      expect((await getContract(id)).status).toBe(before.status);
      expect(await transferredFrom(id)).toHaveLength(0);
      expect(await logsOf(id)).toHaveLength(0);
    });

    it('requires a payment method when a fee is given', async () => {
      const id = await createContract();
      const res = await post(`/api/contracts/${id}/transfer`, { toMemberId: RECIPIENT_ID, fee: 100 });
      expect(res.status).toBe(400);
      expect((await getContract(id)).status).toBe('ACTIVE');
    });

    it('404s another tenant\'s contract, and a recipient from another tenant', async () => {
      const other = await post(`/api/contracts/${TEST_CONTRACT_B_ID}/transfer`, { toMemberId: RECIPIENT_ID });
      expect(other.status).toBe(404);
      expect((await getContract(TEST_CONTRACT_B_ID)).status).toBe('ACTIVE');

      const id = await createContract();
      const res = await post(`/api/contracts/${id}/transfer`, { toMemberId: TEST_MEMBER_B_ID });
      expect(res.status).toBe(404);
      expect((await res.json()).error).toContain('受讓會員');
      expect((await getContract(id)).status).toBe('ACTIVE');
    });

    it('rolls back the status change, the new contract, both logs and the fee when the last step fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const id = await createContract({ planId: TRANSFER_COUNT_PLAN_ID, remainingCounts: 4 });
      failRecalculate.on = true;

      const res = await post(`/api/contracts/${id}/transfer`, { toMemberId: RECIPIENT_ID, fee: 500, paymentMethod: 'CASH' });

      expect(res.status).toBe(500);
      expect((await getContract(id)).status).toBe('ACTIVE');
      expect(await transferredFrom(id)).toHaveLength(0);
      expect(await logsOf(id)).toHaveLength(0);
      const fees = await db.select().from(payments).where(and(eq(payments.memberId, RECIPIENT_ID), eq(payments.amount, '500.00')));
      expect(fees).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/contracts/:id/renew (decision 3)', () => {
    it('TIME_BASED: DRAFT at the current plan price, from the day after the old end date, old contract untouched', async () => {
      const id = await createContract({ planId: TRANSFER_TIME_PLAN_ID, endDate: '2027-03-31' });
      await db.update(membershipPlans).set({ price: '4800' }).where(eq(membershipPlans.id, TRANSFER_TIME_PLAN_ID));
      const before = await getContract(id);

      const res = await post(`/api/contracts/${id}/renew`, undefined, staffToken);

      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data).toMatchObject({
        memberId: TEST_MEMBER_ID,
        planId: TRANSFER_TIME_PLAN_ID,
        status: 'DRAFT',
        startDate: '2027-04-01',
        endDate: '2027-07-01',
        originalEndDate: '2027-07-01',
        remainingCounts: null,
        totalAmount: '4800.00',
        paymentStatus: 'UNPAID',
        digitalSignature: null,
      });
      expect(await getContract(id)).toEqual(before);
      expect(await logsOf(id)).toHaveLength(0);
      const logs = await logsOf(data.id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ logType: 'RENEWAL', reason: `續約自合約 ${before.contractNo}` });
    });

    it('COUNT_BASED: class counts from the plan and one year of validity, like create', async () => {
      const id = await createContract({ planId: TRANSFER_COUNT_PLAN_ID, endDate: '2027-03-31', remainingCounts: 2 });
      const res = await post(`/api/contracts/${id}/renew`);
      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data).toMatchObject({ status: 'DRAFT', startDate: '2027-04-01', endDate: '2028-04-01', remainingCounts: 10, totalAmount: '8000.00' });
    });

    it('starts today when the old contract has expired', async () => {
      const id = await createContract({ planId: TRANSFER_COUNT_PLAN_ID, status: 'EXPIRED', endDate: '2025-06-30' });
      const res = await post(`/api/contracts/${id}/renew`);
      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data.startDate).toBe(today());
      expect((await getContract(id)).status).toBe('EXPIRED');
    });

    it('returns 409 with the existing draft instead of creating a second one', async () => {
      const id = await createContract({ planId: TRANSFER_COUNT_PLAN_ID, endDate: '2027-05-31' });
      const first = await (await post(`/api/contracts/${id}/renew`)).json();
      const second = await post(`/api/contracts/${id}/renew`);
      expect(second.status).toBe(409);
      expect((await second.json()).data.id).toBe(first.data.id);
    });

    it.each(['DRAFT', 'PAUSED', 'CANCELLED'] as const)('rejects a %s contract with 400', async (status) => {
      const id = await createContract({ status });
      const res = await post(`/api/contracts/${id}/renew`);
      expect(res.status).toBe(400);
    });

    it('rejects a deactivated plan with 400', async () => {
      const planId = crypto.randomUUID();
      await db.insert(membershipPlans).values({
        id: planId, name: '停售方案', code: 'PNOFF', planType: 'TIME_BASED', durationMonths: 1, price: '1000',
        isActive: false, tenantId: TEST_TENANT_ID, branchId: TEST_BRANCH_ID,
      });
      const id = await createContract({ planId });
      const res = await post(`/api/contracts/${id}/renew`);
      expect(res.status).toBe(400);
    });

    it('404s another tenant\'s contract', async () => {
      const res = await post(`/api/contracts/${TEST_CONTRACT_B_ID}/renew`);
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/contracts/:id/resume (decision 4: early resume)', () => {
    const E = '2027-03-31';
    const pause = (id: string, startOffset: number, endOffset: number) =>
      post(`/api/contracts/${id}/pause`, { startDate: addDays(today(), startOffset), endDate: addDays(today(), endOffset) });

    it('shortens the extension to the days actually paused and logs them', async () => {
      const id = await createContract({ endDate: E });
      expect((await pause(id, -3, 7)).status).toBe(200);
      expect((await getContract(id)).endDate).toBe(addDays(E, 10));

      const res = await post(`/api/contracts/${id}/resume`);

      expect(res.status).toBe(200);
      expect((await res.json()).data.endDate).toBe(addDays(E, 3));
      const contract = await getContract(id);
      expect(contract).toMatchObject({ status: 'ACTIVE', endDate: addDays(E, 3) });
      const resume = (await logsOf(id)).find(l => l.logType === 'RESUME');
      expect(resume).toMatchObject({ daysAffected: 3 });
    });

    it('keeps the full planned extension when resumed on or after the planned end', async () => {
      const id = await createContract({ endDate: E });
      await pause(id, -12, -2);
      await post(`/api/contracts/${id}/resume`);
      expect((await getContract(id)).endDate).toBe(addDays(E, 10));
      expect((await logsOf(id)).find(l => l.logType === 'RESUME')).toMatchObject({ daysAffected: 10 });
    });

    it('accumulates over several pauses', async () => {
      const id = await createContract({ endDate: E });
      await pause(id, -5, 5);       // planned 10, actual 5
      await post(`/api/contracts/${id}/resume`);
      expect((await getContract(id)).endDate).toBe(addDays(E, 5));

      await pause(id, -2, 8);       // planned 10, actual 2
      await post(`/api/contracts/${id}/resume`);
      expect((await getContract(id)).endDate).toBe(addDays(E, 7));
      expect((await logsOf(id)).filter(l => l.logType === 'RESUME').map(l => l.daysAffected).sort()).toEqual([2, 5]);
    });

    it('keeps an extension granted during the pause', async () => {
      const id = await createContract({ endDate: E });
      await pause(id, -3, 7);
      expect((await post(`/api/contracts/${id}/extend`, { days: 5 })).status).toBe(200);
      await post(`/api/contracts/${id}/resume`);
      expect((await getContract(id)).endDate).toBe(addDays(E, 3 + 5));
    });

    it('restores the pre-pause end date when resumed before the pause started', async () => {
      const id = await createContract({ endDate: E });
      await pause(id, 5, 10);
      await post(`/api/contracts/${id}/resume`);
      expect((await getContract(id)).endDate).toBe(E);
      expect((await logsOf(id)).find(l => l.logType === 'RESUME')).toMatchObject({ daysAffected: 0 });
    });

    it('404s another tenant\'s contract', async () => {
      expect((await post(`/api/contracts/${TEST_CONTRACT_B_ID}/resume`)).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/contracts/:id/signature (decision 5)', () => {
    const sign = (id: string, image = PNG_DATA_URL, token = staffToken) => post(`/api/contracts/${id}/signature`, { image }, token);

    it('stores the PNG in tenant-scoped storage, points digital_signature at it, and unlocks activation', async () => {
      const id = await createContract({ status: 'DRAFT' });
      expect((await post(`/api/contracts/${id}/activate`)).status).toBe(400);

      const res = await sign(id);

      expect(res.status).toBe(200);
      const contract = await getContract(id);
      expect(contract.digitalSignature).toBeTruthy();
      expect(contract.termsAccepted).toBe(true);
      const [file] = await db.select().from(files).where(eq(files.id, contract.digitalSignature!));
      expect(file).toMatchObject({ tenantId: TEST_TENANT_ID, mimeType: 'image/png', folder: 'contract-signatures', uploadedBy: STAFF_ID });
      expect(file!.storageKey.startsWith(`${TEST_TENANT_ID}/contract-signatures/`)).toBe(true);
      expect(r2.objects.get(file!.storageKey)?.toString('base64')).toBe(PNG_BASE64);

      const detail = await (await authRequest(`/api/contracts/${id}`, { method: 'GET', token: adminToken })).json();
      expect(detail.data.signatureUrl).toBe(`https://r2.test/${file!.storageKey}?signed=1`);

      expect((await post(`/api/contracts/${id}/activate`)).status).toBe(200);
    });

    it('lets a DRAFT be re-signed', async () => {
      const id = await createContract({ status: 'DRAFT' });
      await sign(id);
      const first = (await getContract(id)).digitalSignature;
      expect((await sign(id)).status).toBe(200);
      expect((await getContract(id)).digitalSignature).not.toBe(first);
    });

    it('signs an unsigned ACTIVE contract once, never overwrites it, and removes the rejected upload', async () => {
      const id = await createContract({ status: 'ACTIVE' });
      expect((await sign(id)).status).toBe(200);
      const signatureId = (await getContract(id)).digitalSignature;
      const filesBefore = await db.select().from(files).where(eq(files.tenantId, TEST_TENANT_ID));

      const res = await sign(id);

      expect(res.status).toBe(400);
      expect((await getContract(id)).digitalSignature).toBe(signatureId);
      expect(await db.select().from(files).where(eq(files.tenantId, TEST_TENANT_ID))).toHaveLength(filesBefore.length);
    });

    it.each([
      ['not a data URL', 'https://evil.test/a.png'],
      ['not PNG', `data:image/png;base64,${Buffer.from('GIF89a-not-a-png').toString('base64')}`],
      ['too large', `data:image/png;base64,${Buffer.concat([Buffer.from(PNG_BASE64, 'base64'), Buffer.alloc(600 * 1024)]).toString('base64')}`],
    ])('rejects an image that is %s with 400', async (_name, image) => {
      const id = await createContract({ status: 'DRAFT' });
      const res = await sign(id, image);
      expect(res.status).toBe(400);
      expect((await getContract(id)).digitalSignature).toBeNull();
    });

    it('404s another tenant\'s contract without uploading anything', async () => {
      const before = r2.objects.size;
      const res = await sign(TEST_CONTRACT_B_ID);
      expect(res.status).toBe(404);
      expect(r2.objects.size).toBe(before);
      expect((await getContract(TEST_CONTRACT_B_ID)).digitalSignature).toBeNull();
    });

    it('reads the signature back only for its own tenant (what the PDF embeds)', async () => {
      const id = await createContract({ status: 'DRAFT' });
      await sign(id);
      const fileId = (await getContract(id)).digitalSignature!;

      const own = await fileService.getContent(fileId, TEST_TENANT_ID);
      expect(own?.mimeType).toBe('image/png');
      expect(own?.data.toString('base64')).toBe(PNG_BASE64);
      expect(await fileService.getContent(fileId, TEST_TENANT_B_ID)).toBeNull();
    });
  });

  describe('contract PDF template', () => {
    const base = {
      contractNo: 'C1', memberName: '王<小明>', memberCode: 'M1', memberPhone: '0900', planName: 'P', planType: 'TIME_BASED',
      startDate: '2026-01-01', endDate: '2026-12-31', totalAmount: 1000, branchName: 'B', createdAt: '2026-01-01T00:00:00Z',
    };

    it('embeds the signature as a data: image above the member signature line', () => {
      const html = generateContractHtml({ ...base, signatureDataUri: PNG_DATA_URL });
      expect(html).toContain(`<img class="signature-image" src="${PNG_DATA_URL}" alt="會員簽名">`);
    });

    it('renders no image for an unsigned contract', () => {
      expect(generateContractHtml(base)).not.toContain('signature-image"');
    });
  });
});
