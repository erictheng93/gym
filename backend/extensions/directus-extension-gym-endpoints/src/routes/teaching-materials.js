/**
 * Teaching Materials Routes
 * /gym/teaching-materials/*
 *
 * 教學資源庫 API
 * - 動作庫（VIDEO, EXERCISE）
 * - 教案範本（TEMPLATE）
 * - 搜尋與篩選
 */

import {
  InvalidPayloadError,
  NotFoundError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * 註冊教學資源路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} coachAuthMiddleware - 教練認證中間件
 */
export function registerTeachingMaterialsRoutes(router, context, coachAuthMiddleware) {
  const { services, database, getSchema, env } = context;

  // ============================================
  // Teaching Materials CRUD
  // ============================================

  /**
   * GET /gym/teaching-materials
   * Get teaching materials list with filters
   */
  router.get('/teaching-materials', coachAuthMiddleware, async (req, res) => {
    try {
      const {
        type,
        category,
        difficulty,
        muscle_groups,
        equipment,
        search,
        limit = 20,
        offset = 0,
      } = req.query;

      let whereClause = 'WHERE tm.is_active = TRUE';
      const params = [];

      if (type) {
        whereClause += ' AND tm.type = ?';
        params.push(type);
      }

      if (category) {
        whereClause += ' AND tm.category = ?';
        params.push(category);
      }

      if (difficulty) {
        whereClause += ' AND tm.difficulty = ?';
        params.push(difficulty);
      }

      if (muscle_groups) {
        // Search in JSONB array
        const groups = muscle_groups.split(',');
        whereClause += ' AND tm.muscle_groups ?| ?';
        params.push(groups);
      }

      if (equipment) {
        // Search in JSONB array
        const equips = equipment.split(',');
        whereClause += ' AND tm.equipment ?| ?';
        params.push(equips);
      }

      if (search) {
        whereClause += ' AND (tm.name ILIKE ? OR tm.description ILIKE ?)';
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern);
      }

      const materialsResult = await database.raw(`
        SELECT tm.*, e.full_name as created_by_name
        FROM teaching_materials tm
        LEFT JOIN employees e ON tm.created_by = e.id
        ${whereClause}
        ORDER BY tm.category, tm.name
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), parseInt(offset)]);

      const materials = materialsResult.rows || materialsResult;

      // Get total count
      const countResult = await database.raw(`
        SELECT COUNT(*) as total FROM teaching_materials tm ${whereClause}
      `, params);
      const total = parseInt(countResult.rows?.[0]?.total || countResult[0]?.total || 0);

      res.json({
        success: true,
        data: materials.map(m => ({
          id: m.id,
          type: m.type,
          category: m.category,
          name: m.name,
          description: m.description,
          file_id: m.file_id,
          video_url: m.video_url,
          muscle_groups: m.muscle_groups,
          equipment: m.equipment,
          difficulty: m.difficulty,
          template_content: m.template_content,
          created_by: m.created_by,
          created_by_name: m.created_by_name,
          created_at: m.created_at,
        })),
        meta: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/teaching-materials/categories
   * Get all categories grouped by type
   */
  router.get('/teaching-materials/categories', coachAuthMiddleware, async (req, res) => {
    try {
      const categoriesResult = await database.raw(`
        SELECT type, category, COUNT(*) as count
        FROM teaching_materials
        WHERE is_active = TRUE
        GROUP BY type, category
        ORDER BY type, category
      `);

      const categories = categoriesResult.rows || categoriesResult;

      // Group by type
      const grouped = categories.reduce((acc, c) => {
        if (!acc[c.type]) {
          acc[c.type] = [];
        }
        acc[c.type].push({
          category: c.category,
          count: parseInt(c.count),
        });
        return acc;
      }, {});

      res.json({
        success: true,
        data: grouped,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/teaching-materials/muscle-groups
   * Get all muscle groups
   */
  router.get('/teaching-materials/muscle-groups', coachAuthMiddleware, async (req, res) => {
    try {
      const muscleGroupsResult = await database.raw(`
        SELECT DISTINCT jsonb_array_elements_text(muscle_groups) as muscle_group
        FROM teaching_materials
        WHERE is_active = TRUE AND muscle_groups IS NOT NULL
        ORDER BY muscle_group
      `);

      const muscleGroups = (muscleGroupsResult.rows || muscleGroupsResult).map(m => m.muscle_group);

      res.json({
        success: true,
        data: muscleGroups,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/teaching-materials/equipment
   * Get all equipment types
   */
  router.get('/teaching-materials/equipment', coachAuthMiddleware, async (req, res) => {
    try {
      const equipmentResult = await database.raw(`
        SELECT DISTINCT jsonb_array_elements_text(equipment) as equipment_item
        FROM teaching_materials
        WHERE is_active = TRUE AND equipment IS NOT NULL
        ORDER BY equipment_item
      `);

      const equipment = (equipmentResult.rows || equipmentResult).map(e => e.equipment_item);

      res.json({
        success: true,
        data: equipment,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/teaching-materials/search
   * Advanced search for materials
   */
  router.get('/teaching-materials/search', coachAuthMiddleware, async (req, res) => {
    try {
      const { q, muscle_groups, equipment, difficulty, types, limit = 20 } = req.query;

      if (!q && !muscle_groups && !equipment && !difficulty) {
        throw InvalidPayloadError('請提供至少一個搜尋條件');
      }

      let whereClause = 'WHERE tm.is_active = TRUE';
      const params = [];

      if (q) {
        whereClause += ' AND (tm.name ILIKE ? OR tm.description ILIKE ? OR tm.category ILIKE ?)';
        const searchPattern = `%${q}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      if (types) {
        const typeList = types.split(',');
        whereClause += ` AND tm.type IN (${typeList.map(() => '?').join(',')})`;
        params.push(...typeList);
      }

      if (muscle_groups) {
        const groups = muscle_groups.split(',');
        whereClause += ' AND tm.muscle_groups ?| ?';
        params.push(groups);
      }

      if (equipment) {
        const equips = equipment.split(',');
        whereClause += ' AND tm.equipment ?| ?';
        params.push(equips);
      }

      if (difficulty) {
        whereClause += ' AND tm.difficulty = ?';
        params.push(difficulty);
      }

      const resultsResult = await database.raw(`
        SELECT tm.*, e.full_name as created_by_name,
               ts_rank(
                 to_tsvector('simple', COALESCE(tm.name, '') || ' ' || COALESCE(tm.description, '')),
                 plainto_tsquery('simple', ?)
               ) as relevance
        FROM teaching_materials tm
        LEFT JOIN employees e ON tm.created_by = e.id
        ${whereClause}
        ORDER BY relevance DESC, tm.name
        LIMIT ?
      `, [q || '', ...params, parseInt(limit)]);

      const results = resultsResult.rows || resultsResult;

      res.json({
        success: true,
        data: results.map(r => ({
          id: r.id,
          type: r.type,
          category: r.category,
          name: r.name,
          description: r.description,
          file_id: r.file_id,
          video_url: r.video_url,
          muscle_groups: r.muscle_groups,
          equipment: r.equipment,
          difficulty: r.difficulty,
          relevance: r.relevance,
        })),
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/teaching-materials/:id
   * Get material details
   */
  router.get('/teaching-materials/:id', coachAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      const materialResult = await database.raw(`
        SELECT tm.*, e.full_name as created_by_name
        FROM teaching_materials tm
        LEFT JOIN employees e ON tm.created_by = e.id
        WHERE tm.id = ? AND tm.is_active = TRUE
      `, [id]);

      const material = materialResult.rows?.[0] || materialResult[0];

      if (!material) {
        throw NotFoundError('教學資源不存在');
      }

      // Get related materials (same category or muscle groups)
      const relatedResult = await database.raw(`
        SELECT id, type, name, category, difficulty, muscle_groups
        FROM teaching_materials
        WHERE is_active = TRUE
          AND id != ?
          AND (category = ? OR muscle_groups ?| ?)
        LIMIT 6
      `, [id, material.category, material.muscle_groups || []]);

      const related = relatedResult.rows || relatedResult;

      res.json({
        success: true,
        data: {
          id: material.id,
          type: material.type,
          category: material.category,
          name: material.name,
          description: material.description,
          file_id: material.file_id,
          video_url: material.video_url,
          muscle_groups: material.muscle_groups,
          equipment: material.equipment,
          difficulty: material.difficulty,
          template_content: material.template_content,
          created_by: material.created_by,
          created_by_name: material.created_by_name,
          created_at: material.created_at,
          related: related.map(r => ({
            id: r.id,
            type: r.type,
            name: r.name,
            category: r.category,
            difficulty: r.difficulty,
            muscle_groups: r.muscle_groups,
          })),
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/teaching-materials
   * Create a new teaching material (coaches can upload)
   */
  router.post('/teaching-materials', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const {
        type,
        category,
        name,
        description,
        file_id,
        video_url,
        muscle_groups,
        equipment,
        difficulty,
        template_content,
      } = req.body || {};

      if (!type || !category || !name) {
        throw InvalidPayloadError('請提供類型、分類和名稱');
      }

      const validTypes = ['VIDEO', 'TEMPLATE', 'EXERCISE'];
      if (!validTypes.includes(type)) {
        throw InvalidPayloadError(`類型必須是: ${validTypes.join(', ')}`);
      }

      if (difficulty) {
        const validDifficulties = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
        if (!validDifficulties.includes(difficulty)) {
          throw InvalidPayloadError(`難度必須是: ${validDifficulties.join(', ')}`);
        }
      }

      const insertResult = await database.raw(`
        INSERT INTO teaching_materials (
          type, category, name, description, file_id, video_url,
          muscle_groups, equipment, difficulty, template_content, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `, [
        type,
        category,
        name,
        description || null,
        file_id || null,
        video_url || null,
        muscle_groups ? JSON.stringify(muscle_groups) : null,
        equipment ? JSON.stringify(equipment) : null,
        difficulty || null,
        template_content ? JSON.stringify(template_content) : null,
        coachId,
      ]);

      const material = insertResult.rows?.[0] || insertResult[0];

      logger.info('Teaching material created', { coachId, materialId: material.id, type });

      res.status(201).json({
        success: true,
        message: '教學資源已建立',
        data: {
          id: material.id,
          type: material.type,
          category: material.category,
          name: material.name,
          created_at: material.created_at,
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PUT /gym/teaching-materials/:id
   * Update a teaching material (only creator or admin)
   */
  router.put('/teaching-materials/:id', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;
      const {
        category,
        name,
        description,
        file_id,
        video_url,
        muscle_groups,
        equipment,
        difficulty,
        template_content,
        is_active,
      } = req.body || {};

      // Verify ownership
      const materialResult = await database.raw(`
        SELECT * FROM teaching_materials WHERE id = ? AND created_by = ?
      `, [id, coachId]);

      const material = materialResult.rows?.[0] || materialResult[0];

      if (!material) {
        throw NotFoundError('教學資源不存在或無權限修改');
      }

      // Build update query
      const updates = [];
      const params = [];

      if (category !== undefined) {
        updates.push('category = ?');
        params.push(category);
      }

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }

      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }

      if (file_id !== undefined) {
        updates.push('file_id = ?');
        params.push(file_id);
      }

      if (video_url !== undefined) {
        updates.push('video_url = ?');
        params.push(video_url);
      }

      if (muscle_groups !== undefined) {
        updates.push('muscle_groups = ?');
        params.push(muscle_groups ? JSON.stringify(muscle_groups) : null);
      }

      if (equipment !== undefined) {
        updates.push('equipment = ?');
        params.push(equipment ? JSON.stringify(equipment) : null);
      }

      if (difficulty !== undefined) {
        if (difficulty) {
          const validDifficulties = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
          if (!validDifficulties.includes(difficulty)) {
            throw InvalidPayloadError(`難度必須是: ${validDifficulties.join(', ')}`);
          }
        }
        updates.push('difficulty = ?');
        params.push(difficulty);
      }

      if (template_content !== undefined) {
        updates.push('template_content = ?');
        params.push(template_content ? JSON.stringify(template_content) : null);
      }

      if (is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(is_active);
      }

      if (updates.length === 0) {
        throw InvalidPayloadError('請提供要更新的欄位');
      }

      params.push(id);

      const updateResult = await database.raw(`
        UPDATE teaching_materials
        SET ${updates.join(', ')}
        WHERE id = ?
        RETURNING *
      `, params);

      const updatedMaterial = updateResult.rows?.[0] || updateResult[0];

      res.json({
        success: true,
        message: '教學資源已更新',
        data: {
          id: updatedMaterial.id,
          type: updatedMaterial.type,
          category: updatedMaterial.category,
          name: updatedMaterial.name,
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * DELETE /gym/teaching-materials/:id
   * Soft delete a teaching material
   */
  router.delete('/teaching-materials/:id', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;

      // Soft delete (set is_active = false)
      const updateResult = await database.raw(`
        UPDATE teaching_materials
        SET is_active = FALSE
        WHERE id = ? AND created_by = ?
        RETURNING id
      `, [id, coachId]);

      if (!(updateResult.rows?.[0] || updateResult[0])) {
        throw NotFoundError('教學資源不存在或無權限刪除');
      }

      logger.info('Teaching material deleted', { coachId, materialId: id });

      res.json({
        success: true,
        message: '教學資源已刪除',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerTeachingMaterialsRoutes;
