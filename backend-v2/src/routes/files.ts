/**
 * Files API Routes
 * Handles file uploads, downloads, and management
 */

import { Hono } from 'hono';
import { db, files } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { fileService } from '../services/files.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';

type Variables = AuthVariables & TenantVariables;

const app = new Hono<{ Variables: Variables }>();

/**
 * GET /api/files
 * List files with pagination
 */
app.get('/', async (c) => {
  const tenantId = c.get('tenantId');
  const { page = '1', limit = '20', folder } = c.req.query();

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(files.tenantId, tenantId)];
  if (folder) {
    conditions.push(eq(files.folder, folder));
  }

  const allFiles = await db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.dateCreated))
    .limit(limitNum)
    .offset(offset);

  // Add public URLs to files
  const filesWithUrls = allFiles.map(file => ({
    ...file,
    url: fileService.getPublicUrl(file.storageKey),
  }));

  return c.json({
    success: true,
    data: filesWithUrls,
    pagination: {
      page: pageNum,
      limit: limitNum,
    },
  });
});

/**
 * GET /api/files/:id
 * Get file by ID
 */
app.get('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const { id } = c.req.param();

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, id),
        eq(files.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!file) {
    return c.json({ success: false, error: '檔案不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...file,
      url: fileService.getPublicUrl(file.storageKey),
    },
  });
});

/**
 * GET /api/files/:id/download
 * Get signed download URL
 */
app.get('/:id/download', async (c) => {
  const tenantId = c.get('tenantId');
  const { id } = c.req.param();
  const { expires = '3600' } = c.req.query();

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, id),
        eq(files.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!file) {
    return c.json({ success: false, error: '檔案不存在' }, 404);
  }

  const signedUrl = await fileService.getSignedUrl(id, parseInt(expires));

  if (!signedUrl) {
    return c.json({ success: false, error: '無法生成下載連結' }, 500);
  }

  return c.json({
    success: true,
    data: {
      url: signedUrl,
      expiresIn: parseInt(expires),
    },
  });
});

/**
 * POST /api/files
 * Upload a new file
 */
app.post('/', async (c) => {
  const user = c.get('user');
  const tenantId = c.get('tenantId');

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: '請選擇檔案' }, 400);
  }

  const folder = typeof body['folder'] === 'string' ? body['folder'] : undefined;
  const title = typeof body['title'] === 'string' ? body['title'] : undefined;
  const description = typeof body['description'] === 'string' ? body['description'] : undefined;

  // Validate file size (max 50MB)
  if (file.size > 50 * 1024 * 1024) {
    return c.json({ success: false, error: '檔案大小不得超過 50MB' }, 400);
  }

  // Validate file type
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ];

  if (!allowedTypes.includes(file.type)) {
    return c.json({ success: false, error: '不支援的檔案類型' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();

  const result = await fileService.upload(
    {
      name: file.name,
      type: file.type,
      size: file.size,
      data: arrayBuffer,
    },
    {
      folder,
      tenantId,
      uploadedBy: user?.id,
    }
  );

  if (!result) {
    return c.json({ success: false, error: '上傳失敗' }, 500);
  }

  // Update title and description if provided
  if (title || description) {
    await db
      .update(files)
      .set({
        title,
        description,
        dateUpdated: new Date(),
      })
      .where(eq(files.id, result.id));
  }

  return c.json({
    success: true,
    data: {
      id: result.id,
      url: result.url,
    },
  }, 201);
});

/**
 * PATCH /api/files/:id
 * Update file metadata
 */
app.patch('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const { id } = c.req.param();

  const [existingFile] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, id),
        eq(files.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!existingFile) {
    return c.json({ success: false, error: '檔案不存在' }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    description?: string;
    folder?: string;
  }>();

  const [updated] = await db
    .update(files)
    .set({
      title: body.title,
      description: body.description,
      folder: body.folder,
      dateUpdated: new Date(),
    })
    .where(eq(files.id, id))
    .returning();

  return c.json({
    success: true,
    data: {
      ...updated,
      url: fileService.getPublicUrl(updated.storageKey),
    },
  });
});

/**
 * DELETE /api/files/:id
 * Delete a file
 */
app.delete('/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const { id } = c.req.param();

  const [existingFile] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, id),
        eq(files.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!existingFile) {
    return c.json({ success: false, error: '檔案不存在' }, 404);
  }

  const deleted = await fileService.delete(id);

  if (!deleted) {
    return c.json({ success: false, error: '刪除失敗' }, 500);
  }

  return c.json({ success: true, message: '檔案已刪除' });
});

/**
 * GET /api/files/stats
 * Get storage statistics
 */
app.get('/stats', async (c) => {
  const tenantId = c.get('tenantId');

  const allFiles = await db
    .select({
      size: files.size,
      mimeType: files.mimeType,
      folder: files.folder,
    })
    .from(files)
    .where(eq(files.tenantId, tenantId));

  const totalSize = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  const totalCount = allFiles.length;

  // Group by mime type
  const byType = allFiles.reduce((acc, f) => {
    const type = f.mimeType?.split('/')[0] || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group by folder
  const byFolder = allFiles.reduce((acc, f) => {
    const folder = f.folder || 'root';
    acc[folder] = (acc[folder] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return c.json({
    success: true,
    data: {
      totalFiles: totalCount,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      byType,
      byFolder,
    },
  });
});

export default app;
