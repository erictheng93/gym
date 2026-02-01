import { Hono } from 'hono';
import { authMiddleware, requireAuth } from '../middleware/index.js';
import type { AuthVariables } from '../middleware/index.js';
import { generateContractPdf, generateInvoicePdf } from '../services/pdf.js';

// =============================================================================
// PDF GENERATION ROUTES
// =============================================================================
// Endpoints for generating PDF documents

const app = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware
app.use('*', authMiddleware, requireAuth);

// -----------------------------------------------------------------------------
// GET /api/contracts/:id/pdf - Download Contract PDF
// -----------------------------------------------------------------------------

app.get('/contracts/:id/pdf', async (c) => {
  const contractId = c.req.param('id');

  const result = await generateContractPdf(contractId);

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

  const result = await generateInvoicePdf(paymentId);

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
