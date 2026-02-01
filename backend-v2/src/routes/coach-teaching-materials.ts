import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, teachingMaterials, files } from '../db/index.js';
import { eq, and, sql, like, or, inArray } from 'drizzle-orm';
import { coachAuthMiddleware, requireCoach } from '../middleware/index.js';
import type { CoachVariables } from '../middleware/index.js';

// =============================================================================
// COACH TEACHING MATERIALS ROUTES
// =============================================================================
// CRUD operations for teaching materials (exercises, videos, documents)

const app = new Hono<{ Variables: CoachVariables }>();

// Apply auth middleware to all routes
app.use('*', coachAuthMiddleware, requireCoach);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createMaterialSchema = z.object({
  type: z.enum(['EXERCISE', 'VIDEO', 'DOCUMENT', 'TEMPLATE']),
  category: z.string().min(1, '請選擇分類'),
  name: z.string().min(1, '請輸入名稱'),
  description: z.string().optional(),
  file_id: z.string().uuid().optional(),
  video_url: z.string().url().optional(),
  muscle_groups: z.array(z.string()).optional().default([]),
  equipment: z.array(z.string()).optional().default([]),
  difficulty: z.string().optional(),
  instructions: z.array(z.string()).optional().default([]),
  tips: z.array(z.string()).optional().default([]),
  common_mistakes: z.array(z.string()).optional().default([]),
});

const updateMaterialSchema = z.object({
  category: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  file_id: z.string().uuid().optional().nullable(),
  video_url: z.string().url().optional().nullable(),
  muscle_groups: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  difficulty: z.string().optional(),
  instructions: z.array(z.string()).optional(),
  tips: z.array(z.string()).optional(),
  common_mistakes: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

// -----------------------------------------------------------------------------
// GET /api/coach/teaching-materials - List Teaching Materials
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const coach = c.get('coach')!;
  const {
    type,
    category,
    difficulty,
    muscle_groups,
    equipment: equipmentFilter,
    search,
    limit = '20',
    offset = '0',
  } = c.req.query();

  const limitNum = Math.min(parseInt(limit), 100);
  const offsetNum = parseInt(offset);

  // Build conditions - materials from same tenant
  const conditions = [
    eq(teachingMaterials.tenantId, coach.tenantId),
    eq(teachingMaterials.isActive, true),
  ];

  if (type) {
    conditions.push(eq(teachingMaterials.type, type as 'EXERCISE' | 'VIDEO' | 'DOCUMENT' | 'TEMPLATE'));
  }

  if (category) {
    conditions.push(eq(teachingMaterials.category, category));
  }

  if (difficulty) {
    conditions.push(eq(teachingMaterials.difficulty, difficulty));
  }

  if (search) {
    conditions.push(
      or(
        like(teachingMaterials.name, `%${search}%`),
        like(teachingMaterials.description, `%${search}%`)
      )!
    );
  }

  // For muscle_groups and equipment, we need to use JSON containment
  // This is a simplified approach - in production you might want GIN indexes

  // Get materials
  let materialsData = await db
    .select({
      id: teachingMaterials.id,
      type: teachingMaterials.type,
      category: teachingMaterials.category,
      name: teachingMaterials.name,
      description: teachingMaterials.description,
      fileId: teachingMaterials.fileId,
      videoUrl: teachingMaterials.videoUrl,
      thumbnailUrl: teachingMaterials.thumbnailUrl,
      muscleGroups: teachingMaterials.muscleGroups,
      equipment: teachingMaterials.equipment,
      difficulty: teachingMaterials.difficulty,
      createdAt: teachingMaterials.createdAt,
    })
    .from(teachingMaterials)
    .where(and(...conditions))
    .orderBy(teachingMaterials.category, teachingMaterials.name)
    .limit(limitNum)
    .offset(offsetNum);

  // Filter by muscle_groups if provided
  if (muscle_groups) {
    const targetGroups = muscle_groups.split(',');
    materialsData = materialsData.filter(m => {
      const groups = m.muscleGroups as string[] || [];
      return targetGroups.some(g => groups.includes(g));
    });
  }

  // Filter by equipment if provided
  if (equipmentFilter) {
    const targetEquipment = equipmentFilter.split(',');
    materialsData = materialsData.filter(m => {
      const equip = m.equipment as string[] || [];
      return targetEquipment.some(e => equip.includes(e));
    });
  }

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(teachingMaterials)
    .where(and(...conditions));

  return c.json({
    success: true,
    data: materialsData.map(m => ({
      id: m.id,
      type: m.type,
      category: m.category,
      name: m.name,
      description: m.description,
      file_id: m.fileId,
      video_url: m.videoUrl,
      thumbnail_url: m.thumbnailUrl,
      muscle_groups: m.muscleGroups,
      equipment: m.equipment,
      difficulty: m.difficulty,
      created_at: m.createdAt,
    })),
    meta: {
      total: Number(countResult?.count || 0),
      limit: limitNum,
      offset: offsetNum,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/teaching-materials/categories - Get Categories by Type
// -----------------------------------------------------------------------------

app.get('/categories', async (c) => {
  const coach = c.get('coach')!;

  // Get categories grouped by type
  const categoriesData = await db
    .select({
      type: teachingMaterials.type,
      category: teachingMaterials.category,
      count: sql<number>`count(*)`,
    })
    .from(teachingMaterials)
    .where(
      and(
        eq(teachingMaterials.tenantId, coach.tenantId),
        eq(teachingMaterials.isActive, true)
      )
    )
    .groupBy(teachingMaterials.type, teachingMaterials.category)
    .orderBy(teachingMaterials.type, teachingMaterials.category);

  // Group by type
  const result: Record<string, Array<{ category: string; count: number }>> = {};

  for (const row of categoriesData) {
    if (!result[row.type]) {
      result[row.type] = [];
    }
    result[row.type].push({
      category: row.category,
      count: Number(row.count),
    });
  }

  return c.json({
    success: true,
    data: result,
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/teaching-materials/muscle-groups - Get Muscle Groups
// -----------------------------------------------------------------------------

app.get('/muscle-groups', async (c) => {
  const coach = c.get('coach')!;

  // Get all unique muscle groups
  const materialsData = await db
    .select({ muscleGroups: teachingMaterials.muscleGroups })
    .from(teachingMaterials)
    .where(
      and(
        eq(teachingMaterials.tenantId, coach.tenantId),
        eq(teachingMaterials.isActive, true)
      )
    );

  // Extract unique muscle groups
  const muscleGroupsSet = new Set<string>();
  for (const m of materialsData) {
    const groups = m.muscleGroups as string[] || [];
    for (const g of groups) {
      muscleGroupsSet.add(g);
    }
  }

  const muscleGroups = Array.from(muscleGroupsSet).sort();

  return c.json({
    success: true,
    data: muscleGroups,
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/teaching-materials/equipment - Get Equipment Types
// -----------------------------------------------------------------------------

app.get('/equipment', async (c) => {
  const coach = c.get('coach')!;

  // Get all unique equipment
  const materialsData = await db
    .select({ equipment: teachingMaterials.equipment })
    .from(teachingMaterials)
    .where(
      and(
        eq(teachingMaterials.tenantId, coach.tenantId),
        eq(teachingMaterials.isActive, true)
      )
    );

  // Extract unique equipment
  const equipmentSet = new Set<string>();
  for (const m of materialsData) {
    const equip = m.equipment as string[] || [];
    for (const e of equip) {
      equipmentSet.add(e);
    }
  }

  const equipment = Array.from(equipmentSet).sort();

  return c.json({
    success: true,
    data: equipment,
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/teaching-materials/search - Search Materials
// -----------------------------------------------------------------------------

app.get('/search', async (c) => {
  const coach = c.get('coach')!;
  const {
    q,
    muscle_groups,
    equipment: equipmentFilter,
    difficulty,
    types,
    limit = '20',
  } = c.req.query();

  const limitNum = Math.min(parseInt(limit), 50);

  // Build conditions
  const conditions = [
    eq(teachingMaterials.tenantId, coach.tenantId),
    eq(teachingMaterials.isActive, true),
  ];

  if (q) {
    conditions.push(
      or(
        like(teachingMaterials.name, `%${q}%`),
        like(teachingMaterials.description, `%${q}%`),
        like(teachingMaterials.category, `%${q}%`)
      )!
    );
  }

  if (difficulty) {
    conditions.push(eq(teachingMaterials.difficulty, difficulty));
  }

  if (types) {
    const typeList = types.split(',') as Array<'EXERCISE' | 'VIDEO' | 'DOCUMENT' | 'TEMPLATE'>;
    conditions.push(inArray(teachingMaterials.type, typeList));
  }

  // Get materials
  let materialsData = await db
    .select({
      id: teachingMaterials.id,
      type: teachingMaterials.type,
      category: teachingMaterials.category,
      name: teachingMaterials.name,
      description: teachingMaterials.description,
      thumbnailUrl: teachingMaterials.thumbnailUrl,
      muscleGroups: teachingMaterials.muscleGroups,
      equipment: teachingMaterials.equipment,
      difficulty: teachingMaterials.difficulty,
    })
    .from(teachingMaterials)
    .where(and(...conditions))
    .orderBy(teachingMaterials.name)
    .limit(limitNum);

  // Filter by muscle_groups if provided
  if (muscle_groups) {
    const targetGroups = muscle_groups.split(',');
    materialsData = materialsData.filter(m => {
      const groups = m.muscleGroups as string[] || [];
      return targetGroups.some(g => groups.includes(g));
    });
  }

  // Filter by equipment if provided
  if (equipmentFilter) {
    const targetEquipment = equipmentFilter.split(',');
    materialsData = materialsData.filter(m => {
      const equip = m.equipment as string[] || [];
      return targetEquipment.some(e => equip.includes(e));
    });
  }

  return c.json({
    success: true,
    data: materialsData.map(m => ({
      id: m.id,
      type: m.type,
      category: m.category,
      name: m.name,
      description: m.description,
      thumbnail_url: m.thumbnailUrl,
      muscle_groups: m.muscleGroups,
      equipment: m.equipment,
      difficulty: m.difficulty,
    })),
  });
});

// -----------------------------------------------------------------------------
// GET /api/coach/teaching-materials/:id - Get Material Details
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const coach = c.get('coach')!;
  const { id } = c.req.param();

  // Get material
  const [material] = await db
    .select()
    .from(teachingMaterials)
    .where(
      and(
        eq(teachingMaterials.id, id),
        eq(teachingMaterials.tenantId, coach.tenantId)
      )
    )
    .limit(1);

  if (!material) {
    return c.json({
      success: false,
      error: '找不到教學資源',
      code: 'NOT_FOUND',
    }, 404);
  }

  // Get file info if linked
  let fileInfo = null;
  if (material.fileId) {
    const [file] = await db
      .select({
        id: files.id,
        filename: files.filename,
        mimeType: files.mimeType,
        size: files.size,
      })
      .from(files)
      .where(eq(files.id, material.fileId))
      .limit(1);

    if (file) {
      fileInfo = {
        id: file.id,
        filename: file.filename,
        mime_type: file.mimeType,
        size: file.size,
      };
    }
  }

  // Get related materials (same muscle groups or category)
  const muscleGroups = material.muscleGroups as string[] || [];
  let related: Array<{
    id: string;
    type: string;
    name: string;
    category: string;
    difficulty: string | null;
    muscleGroups: unknown;
  }> = [];

  if (muscleGroups.length > 0) {
    const allMaterials = await db
      .select({
        id: teachingMaterials.id,
        type: teachingMaterials.type,
        name: teachingMaterials.name,
        category: teachingMaterials.category,
        difficulty: teachingMaterials.difficulty,
        muscleGroups: teachingMaterials.muscleGroups,
      })
      .from(teachingMaterials)
      .where(
        and(
          eq(teachingMaterials.tenantId, coach.tenantId),
          eq(teachingMaterials.isActive, true),
          sql`${teachingMaterials.id} != ${id}`
        )
      )
      .limit(50);

    // Filter by shared muscle groups
    related = allMaterials
      .filter(m => {
        const groups = m.muscleGroups as string[] || [];
        return muscleGroups.some(g => groups.includes(g));
      })
      .slice(0, 5);
  }

  return c.json({
    success: true,
    data: {
      id: material.id,
      type: material.type,
      category: material.category,
      name: material.name,
      description: material.description,
      file_id: material.fileId,
      file: fileInfo,
      video_url: material.videoUrl,
      thumbnail_url: material.thumbnailUrl,
      muscle_groups: material.muscleGroups,
      equipment: material.equipment,
      difficulty: material.difficulty,
      instructions: material.instructions,
      tips: material.tips,
      common_mistakes: material.commonMistakes,
      is_active: material.isActive,
      created_at: material.createdAt,
      updated_at: material.updatedAt,
      related: related.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
        category: r.category,
        difficulty: r.difficulty,
        muscle_groups: r.muscleGroups,
      })),
    },
  });
});

// -----------------------------------------------------------------------------
// POST /api/coach/teaching-materials - Create Teaching Material
// -----------------------------------------------------------------------------

app.post(
  '/',
  zValidator('json', createMaterialSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const data = c.req.valid('json');

    // Create material
    const [material] = await db
      .insert(teachingMaterials)
      .values({
        type: data.type,
        category: data.category,
        name: data.name,
        description: data.description,
        fileId: data.file_id,
        videoUrl: data.video_url,
        muscleGroups: data.muscle_groups,
        equipment: data.equipment,
        difficulty: data.difficulty,
        instructions: data.instructions,
        tips: data.tips,
        commonMistakes: data.common_mistakes,
        createdBy: coach.id,
        tenantId: coach.tenantId,
      })
      .returning();

    return c.json({
      success: true,
      message: '教學資源已建立',
      data: {
        id: material.id,
        type: material.type,
        name: material.name,
      },
    }, 201);
  }
);

// -----------------------------------------------------------------------------
// PATCH /api/coach/teaching-materials/:id - Update Teaching Material
// -----------------------------------------------------------------------------

app.patch(
  '/:id',
  zValidator('json', updateMaterialSchema),
  async (c) => {
    const coach = c.get('coach')!;
    const { id } = c.req.param();
    const data = c.req.valid('json');

    // Verify material exists and belongs to tenant
    const [existingMaterial] = await db
      .select()
      .from(teachingMaterials)
      .where(
        and(
          eq(teachingMaterials.id, id),
          eq(teachingMaterials.tenantId, coach.tenantId)
        )
      )
      .limit(1);

    if (!existingMaterial) {
      return c.json({
        success: false,
        error: '找不到教學資源',
        code: 'NOT_FOUND',
      }, 404);
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.category !== undefined) updateData.category = data.category;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.file_id !== undefined) updateData.fileId = data.file_id;
    if (data.video_url !== undefined) updateData.videoUrl = data.video_url;
    if (data.muscle_groups !== undefined) updateData.muscleGroups = data.muscle_groups;
    if (data.equipment !== undefined) updateData.equipment = data.equipment;
    if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
    if (data.instructions !== undefined) updateData.instructions = data.instructions;
    if (data.tips !== undefined) updateData.tips = data.tips;
    if (data.common_mistakes !== undefined) updateData.commonMistakes = data.common_mistakes;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;

    // Update material
    await db
      .update(teachingMaterials)
      .set(updateData)
      .where(eq(teachingMaterials.id, id));

    return c.json({
      success: true,
      message: '教學資源已更新',
    });
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/coach/teaching-materials/:id - Soft Delete Teaching Material
// -----------------------------------------------------------------------------

app.delete('/:id', async (c) => {
  const coach = c.get('coach')!;
  const { id } = c.req.param();

  // Verify material exists and belongs to tenant
  const [existingMaterial] = await db
    .select()
    .from(teachingMaterials)
    .where(
      and(
        eq(teachingMaterials.id, id),
        eq(teachingMaterials.tenantId, coach.tenantId)
      )
    )
    .limit(1);

  if (!existingMaterial) {
    return c.json({
      success: false,
      error: '找不到教學資源',
      code: 'NOT_FOUND',
    }, 404);
  }

  // Soft delete (set isActive to false)
  await db
    .update(teachingMaterials)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(teachingMaterials.id, id));

  return c.json({
    success: true,
    message: '教學資源已刪除',
  });
});

export default app;
