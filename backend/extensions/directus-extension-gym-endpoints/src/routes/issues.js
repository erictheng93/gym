/**
 * Issue Reports Routes
 * /gym/issues/*
 */

import { InvalidPayloadError, NotFoundError } from '../utils/errors.js';

/**
 * Register issues routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - Member authentication middleware
 */
export function registerIssuesRoutes(router, context, memberAuthMiddleware) {
  const { database } = context;

  /**
   * GET /gym/issues
   * List member's issue reports
   */
  router.get('/issues', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { status, type, limit = 20, offset = 0 } = req.query;

      let query = database('issue_reports')
        .where('member_id', memberId)
        .orderBy('created_at', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      if (status) {
        query = query.where('status', status.toUpperCase());
      }

      if (type) {
        query = query.where('type', type.toUpperCase());
      }

      const issues = await query.select(
        'id',
        'type',
        'title',
        'status',
        'created_at',
        'updated_at',
        'resolved_at'
      );

      res.json({
        success: true,
        data: issues,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/issues/:id
   * Get issue details including resolution
   */
  router.get('/issues/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;

      const issue = await database('issue_reports as ir')
        .leftJoin('employees as e', 'ir.assigned_to', 'e.id')
        .leftJoin('branches as b', 'ir.branch_id', 'b.id')
        .where('ir.id', id)
        .where('ir.member_id', memberId)
        .select(
          'ir.*',
          'e.full_name as assigned_to_name',
          'b.name as branch_name'
        )
        .first();

      if (!issue) {
        throw NotFoundError('Issue not found');
      }

      res.json({
        success: true,
        data: issue,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/issues
   * Submit a new issue report
   */
  router.post('/issues', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { type, title, content, attachments } = req.body || {};

      // Validation
      const validTypes = ['EQUIPMENT', 'SERVICE', 'SUGGESTION', 'COMPLAINT'];
      if (!type || !validTypes.includes(type.toUpperCase())) {
        throw InvalidPayloadError(`type must be one of: ${validTypes.join(', ')}`);
      }

      if (!title || title.trim().length === 0) {
        throw InvalidPayloadError('title is required');
      }

      if (title.length > 100) {
        throw InvalidPayloadError('title must not exceed 100 characters');
      }

      if (!content || content.trim().length === 0) {
        throw InvalidPayloadError('content is required');
      }

      // Get member's branch
      const member = await database('members')
        .where('id', memberId)
        .select('branch_id')
        .first();

      if (!member?.branch_id) {
        throw InvalidPayloadError('Member branch not found');
      }

      const [issue] = await database('issue_reports')
        .insert({
          member_id: memberId,
          branch_id: member.branch_id,
          type: type.toUpperCase(),
          title: title.trim(),
          content: content.trim(),
          attachments: attachments ? (typeof attachments === 'string' ? JSON.parse(attachments) : attachments) : null,
          status: 'SUBMITTED',
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'Issue submitted successfully',
        data: issue,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PUT /gym/issues/:id
   * Update an issue (only when status is SUBMITTED)
   */
  router.put('/issues/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;
      const { title, content, attachments } = req.body || {};

      // Check ownership and status
      const existing = await database('issue_reports')
        .where('id', id)
        .where('member_id', memberId)
        .first();

      if (!existing) {
        throw NotFoundError('Issue not found');
      }

      if (existing.status !== 'SUBMITTED') {
        throw InvalidPayloadError('Cannot update issue that is already being processed');
      }

      const updateData = {
        updated_at: new Date(),
      };

      if (title !== undefined) {
        if (title.trim().length === 0) {
          throw InvalidPayloadError('title cannot be empty');
        }
        if (title.length > 100) {
          throw InvalidPayloadError('title must not exceed 100 characters');
        }
        updateData.title = title.trim();
      }

      if (content !== undefined) {
        if (content.trim().length === 0) {
          throw InvalidPayloadError('content cannot be empty');
        }
        updateData.content = content.trim();
      }

      if (attachments !== undefined) {
        updateData.attachments = typeof attachments === 'string' ? JSON.parse(attachments) : attachments;
      }

      const [updated] = await database('issue_reports')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Issue updated successfully',
        data: updated,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerIssuesRoutes;
