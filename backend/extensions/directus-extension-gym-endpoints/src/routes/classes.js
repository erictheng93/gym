/**
 * Classes Routes
 * /gym/classes/*
 */

import { NotFoundError } from '../utils/errors.js';

/**
 * 註冊課程路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerClassesRoutes(router, context) {
  const { services, database, getSchema } = context;
  const { ItemsService } = services;

  /**
   * GET /gym/classes
   * Get available class sessions
   */
  router.get('/classes', async (req, res) => {
    try {
      const { branch_id, date_from, date_to, category } = req.query;

      const schema = await getSchema();
      const sessionsService = new ItemsService('class_sessions', {
        schema,
        knex: database,
      });

      const filter = {
        _and: [
          { session_status: { _eq: 'SCHEDULED' } },
          { status: { _eq: 'active' } },
        ],
      };

      if (branch_id) {
        filter._and.push({ branch_id: { _eq: branch_id } });
      }

      if (date_from) {
        filter._and.push({ session_date: { _gte: date_from } });
      } else {
        filter._and.push({ session_date: { _gte: new Date().toISOString().split('T')[0] } });
      }

      if (date_to) {
        filter._and.push({ session_date: { _lte: date_to } });
      }

      const sessions = await sessionsService.readByQuery({
        filter,
        fields: [
          'id', 'session_date', 'start_time', 'end_time', 'room',
          'max_capacity', 'current_count', 'waitlist_count', 'session_status',
          'class_id.id', 'class_id.name', 'class_id.description', 'class_id.category',
          'class_id.difficulty_level', 'class_id.duration_minutes', 'class_id.image_url',
          'instructor_id.id', 'instructor_id.full_name',
          'branch_id.id', 'branch_id.name',
        ],
        sort: ['session_date', 'start_time'],
        limit: 100,
      });

      let filteredSessions = sessions;
      if (category) {
        filteredSessions = sessions.filter(s => s.class_id?.category === category);
      }

      res.json({
        success: true,
        data: filteredSessions,
      });
    } catch (error) {
      console.error('[GymEndpoint] Get classes error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/classes/schedule
   * Get weekly schedule
   */
  router.get('/classes/schedule', async (req, res) => {
    try {
      const { branch_id } = req.query;

      const schema = await getSchema();
      const schedulesService = new ItemsService('class_schedules', {
        schema,
        knex: database,
      });

      const filter = {
        _and: [
          { status: { _eq: 'active' } },
          { is_recurring: { _eq: true } },
        ],
      };

      if (branch_id) {
        filter._and.push({ branch_id: { _eq: branch_id } });
      }

      const schedules = await schedulesService.readByQuery({
        filter,
        fields: [
          'id', 'day_of_week', 'start_time', 'end_time', 'room', 'max_capacity',
          'class_id.id', 'class_id.name', 'class_id.category', 'class_id.difficulty_level',
          'class_id.duration_minutes', 'class_id.image_url',
          'instructor_id.id', 'instructor_id.full_name',
          'branch_id.id', 'branch_id.name',
        ],
        sort: ['day_of_week', 'start_time'],
      });

      res.json({
        success: true,
        data: schedules,
      });
    } catch (error) {
      console.error('[GymEndpoint] Get schedule error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/classes/sessions
   * Get upcoming class sessions
   */
  router.get('/classes/sessions', async (req, res) => {
    try {
      const { branch_id, start_date, end_date, limit = 50 } = req.query;

      const schema = await getSchema();
      const sessionsService = new ItemsService('class_sessions', {
        schema,
        knex: database,
      });

      const today = new Date().toISOString().split('T')[0];
      const filter = {
        _and: [
          { session_status: { _in: ['SCHEDULED', 'IN_PROGRESS'] } },
          { status: { _eq: 'active' } },
          { session_date: { _gte: start_date || today } },
        ],
      };

      if (end_date) {
        filter._and.push({ session_date: { _lte: end_date } });
      }

      if (branch_id) {
        filter._and.push({ branch_id: { _eq: branch_id } });
      }

      const sessions = await sessionsService.readByQuery({
        filter,
        fields: [
          'id', 'session_date', 'current_count', 'waitlist_count', 'session_status',
          'schedule_id.id', 'schedule_id.start_time', 'schedule_id.end_time', 'schedule_id.room',
          'schedule_id.max_capacity',
          'schedule_id.class_id.id', 'schedule_id.class_id.name', 'schedule_id.class_id.description',
          'schedule_id.class_id.category', 'schedule_id.class_id.difficulty_level',
          'schedule_id.class_id.duration_minutes', 'schedule_id.class_id.max_capacity',
          'schedule_id.instructor_id.id', 'schedule_id.instructor_id.full_name',
          'schedule_id.branch_id.id', 'schedule_id.branch_id.name',
        ],
        sort: ['session_date', 'schedule_id.start_time'],
        limit: Number(limit),
      });

      const transformedSessions = sessions.map(s => ({
        id: s.id,
        session_date: s.session_date,
        current_count: s.current_count,
        waitlist_count: s.waitlist_count,
        session_status: s.session_status,
        schedule: s.schedule_id ? {
          id: s.schedule_id.id,
          start_time: s.schedule_id.start_time,
          end_time: s.schedule_id.end_time,
          room: s.schedule_id.room,
          max_capacity: s.schedule_id.max_capacity,
          class: s.schedule_id.class_id,
          instructor: s.schedule_id.instructor_id,
          branch: s.schedule_id.branch_id,
        } : null,
        class: s.schedule_id?.class_id,
        instructor: s.schedule_id?.instructor_id,
        branch: s.schedule_id?.branch_id,
      }));

      res.json({
        success: true,
        data: transformedSessions,
      });
    } catch (error) {
      console.error('[GymEndpoint] Get sessions error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/classes/sessions/:id
   * Get single class session
   */
  router.get('/classes/sessions/:id', async (req, res) => {
    try {
      const sessionId = req.params.id;

      const schema = await getSchema();
      const sessionsService = new ItemsService('class_sessions', {
        schema,
        knex: database,
      });

      const session = await sessionsService.readOne(sessionId, {
        fields: [
          'id', 'session_date', 'current_count', 'waitlist_count', 'session_status',
          'schedule_id.id', 'schedule_id.start_time', 'schedule_id.end_time', 'schedule_id.room',
          'schedule_id.max_capacity',
          'schedule_id.class_id.id', 'schedule_id.class_id.name', 'schedule_id.class_id.description',
          'schedule_id.class_id.category', 'schedule_id.class_id.difficulty_level',
          'schedule_id.class_id.duration_minutes', 'schedule_id.class_id.max_capacity',
          'schedule_id.instructor_id.id', 'schedule_id.instructor_id.full_name',
          'schedule_id.branch_id.id', 'schedule_id.branch_id.name',
        ],
      });

      if (!session) {
        throw NotFoundError('Session not found');
      }

      const transformed = {
        id: session.id,
        session_date: session.session_date,
        current_count: session.current_count,
        waitlist_count: session.waitlist_count,
        session_status: session.session_status,
        schedule: session.schedule_id ? {
          id: session.schedule_id.id,
          start_time: session.schedule_id.start_time,
          end_time: session.schedule_id.end_time,
          room: session.schedule_id.room,
          max_capacity: session.schedule_id.max_capacity,
          class: session.schedule_id.class_id,
          instructor: session.schedule_id.instructor_id,
          branch: session.schedule_id.branch_id,
        } : null,
        class: session.schedule_id?.class_id,
        instructor: session.schedule_id?.instructor_id,
        branch: session.schedule_id?.branch_id,
      };

      res.json({
        success: true,
        data: transformed,
      });
    } catch (error) {
      console.error('[GymEndpoint] Get session error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerClassesRoutes;
