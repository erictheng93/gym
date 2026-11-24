import { Hono } from 'hono';
import { authMiddleware, requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { generateContractPdf, generateInvoicePdf } from '../services/pdf.js';

// =============================================================================
// PDF GENERATION ROUTES
// =============================================================================
// Endpoints for generating PDF documents

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

// Apply auth middleware
app.use('*', authMiddleware, requireAuth, requireTenant);

// -----------------------------------------------------------------------------
// GET /api/contracts/:id/pdf - Download Contract PDF
// -----------------------------------------------------------------------------

app.get('/contracts/:id/pdf', async (c) => {
  const contractId = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const result = await generateContractPdf(contractId, tenantId);

  if (!result.success && result.notFound) {
    return c.json({ success: false, error: result.error || 'Not found' }, 404);
  }

  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || 'Failed to generate PDF' }, 500);
  }

  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="contract-${contractId}.pdf"`,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/invoices/:id/pdf - Download Invoice/Receipt PDF
// -----------------------------------------------------------------------------

app.get('/invoices/:id/pdf', async (c) => {
  const paymentId = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const result = await generateInvoicePdf(paymentId, tenantId);

  if (!result.success && result.notFound) {
    return c.json({ success: false, error: result.error || 'Not found' }, 404);
  }

  if (!result.success || !result.buffer) {
    return c.json({ success: false, error: result.error || 'Failed to generate PDF' }, 500);
  }

  return new Response(result.buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${paymentId}.pdf"`,
    },
  });
});

export default app;
