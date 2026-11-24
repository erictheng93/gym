import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import { escapeHtml, isAllowedPdfRequest } from '../src/services/pdf.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  memberAuthRequest,
  getAuthToken,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_MEMBER_ID,
  TEST_MEMBER_B_ID,
  TEST_CONTRACT_B_ID,
} from './helpers.js';

describe('escapeHtml', () => {
  it('escapes script tags and quotes', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(escapeHtml(`a&b'c`)).toBe('a&amp;b&#39;c');
  });

  it('handles null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('PDF request allowlist', () => {
  it('only allows data: and about: requests', () => {
    expect(isAllowedPdfRequest('data:text/html,hi')).toBe(true);
    expect(isAllowedPdfRequest('about:blank')).toBe(true);
    expect(isAllowedPdfRequest('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPdfRequest('file:///etc/passwd')).toBe(false);
  });
});

describe('Tenant isolation: files, pdf, check-ins, member issues', () => {
  let authToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  it('rejects unauthenticated GET /api/files with 401', async () => {
    const res = await app.request('/api/files');
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated POST /api/files with 401', async () => {
    const form = new FormData();
    form.set('file', new File(['hello'], 'a.txt', { type: 'text/plain' }));
    const res = await app.request('/api/files', { method: 'POST', body: form });
    expect(res.status).toBe(401);
  });

  it('returns 404 for another tenant contract PDF', async () => {
    const res = await authRequest(`/api/pdf/contracts/${TEST_CONTRACT_B_ID}/pdf`, { token: authToken });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a payment PDF that is not in the tenant', async () => {
    const res = await authRequest('/api/pdf/invoices/00000000-0000-4000-8000-0000000000ff/pdf', { token: authToken });
    expect(res.status).toBe(404);
  });

  it('returns 404 when checking in a member of another tenant', async () => {
    const res = await authRequest('/api/check-ins', {
      method: 'POST',
      token: authToken,
      body: JSON.stringify({ memberId: TEST_MEMBER_B_ID, branchId: TEST_BRANCH_ID }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when checking in with another tenant contract', async () => {
    const res = await authRequest('/api/check-ins', {
      method: 'POST',
      token: authToken,
      body: JSON.stringify({
        memberId: TEST_MEMBER_ID,
        branchId: TEST_BRANCH_ID,
        contractId: TEST_CONTRACT_B_ID,
      }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when a member reports an issue against another tenant branch', async () => {
    const res = await memberAuthRequest('/api/member/issues', {
      method: 'POST',
      body: JSON.stringify({
        branchId: TEST_BRANCH_B_ID,
        type: 'EQUIPMENT',
        title: 'Broken treadmill',
        content: 'The treadmill is broken and needs repair.',
      }),
    });
    expect(res.status).toBe(404);
  });
});
