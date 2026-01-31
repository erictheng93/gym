/**
 * Payroll Routes
 * /gym/payroll/*
 *
 * 薪資管理 API
 */

import { InvalidPayloadError, NotFoundError } from '../utils/errors.js';

// Salary record statuses
const SALARY_STATUSES = ['PENDING', 'APPROVED', 'PAID'];
const PROMOTION_TYPES = ['PROMOTION', 'TRANSFER', 'DEMOTION'];

/**
 * Register payroll routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerPayrollRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/payroll/salary-records
   * List salary records
   */
  router.get('/payroll/salary-records', async (req, res) => {
    try {
      const {
        employee_id,
        period,
        status,
        branch_id,
        limit = 20,
        offset = 0
      } = req.query;

      let query = database('salary_records')
        .leftJoin('employees', 'salary_records.employee_id', 'employees.id')
        .leftJoin('employees as approver', 'salary_records.approved_by', 'approver.id')
        .leftJoin('job_titles', 'employees.job_title_id', 'job_titles.id')
        .leftJoin('branches', 'employees.branch_id', 'branches.id')
        .select(
          'salary_records.*',
          'employees.full_name as employee_name',
          'employees.employee_code',
          'employees.base_salary as current_base_salary',
          'approver.full_name as approved_by_name',
          'job_titles.name as job_title',
          'branches.name as branch_name'
        );

      if (employee_id) {
        query = query.where('salary_records.employee_id', employee_id);
      }
      if (period) {
        query = query.where('salary_records.period', period);
      }
      if (status) {
        query = query.where('salary_records.status', status.toUpperCase());
      }
      if (branch_id) {
        query = query.where('employees.branch_id', branch_id);
      }

      const countQuery = query.clone().count('salary_records.id as count').first();

      query = query
        .orderBy('salary_records.period', 'desc')
        .orderBy('employees.full_name', 'asc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      const [records, countResult] = await Promise.all([query, countQuery]);

      res.json({
        success: true,
        data: records,
        meta: {
          total: parseInt(countResult?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/payroll/salary-records/:id
   * Get salary record details
   */
  router.get('/payroll/salary-records/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const record = await database('salary_records')
        .leftJoin('employees', 'salary_records.employee_id', 'employees.id')
        .leftJoin('employees as approver', 'salary_records.approved_by', 'approver.id')
        .leftJoin('job_titles', 'employees.job_title_id', 'job_titles.id')
        .leftJoin('branches', 'employees.branch_id', 'branches.id')
        .where('salary_records.id', id)
        .select(
          'salary_records.*',
          'employees.full_name as employee_name',
          'employees.employee_code',
          'employees.email as employee_email',
          'employees.base_salary as current_base_salary',
          'approver.full_name as approved_by_name',
          'job_titles.name as job_title',
          'branches.name as branch_name'
        )
        .first();

      if (!record) {
        throw NotFoundError('Salary record not found');
      }

      // Parse JSON fields
      record.leave_days = record.leave_days ?
        (typeof record.leave_days === 'string' ? JSON.parse(record.leave_days) : record.leave_days)
        : {};
      record.calculation_detail = record.calculation_detail ?
        (typeof record.calculation_detail === 'string' ? JSON.parse(record.calculation_detail) : record.calculation_detail)
        : {};

      res.json({
        success: true,
        data: record
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/payroll/generate
   * Generate monthly salary records
   */
  router.post('/payroll/generate', async (req, res) => {
    try {
      const { period, branch_id, employee_ids } = req.body || {};

      if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        throw InvalidPayloadError('period is required in YYYY-MM format');
      }

      // Parse period to date range
      const [year, month] = period.split('-');
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      const workDaysInMonth = calculateWorkDays(startDate, endDate);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get employees to process
      let employeesQuery = database('employees')
        .leftJoin('job_titles', 'employees.job_title_id', 'job_titles.id')
        .where('employees.status', 'active')
        .select(
          'employees.id',
          'employees.full_name',
          'employees.base_salary',
          'employees.branch_id',
          'job_titles.base_salary as job_title_base_salary'
        );

      if (branch_id) {
        employeesQuery = employeesQuery.where('employees.branch_id', branch_id);
      }
      if (employee_ids && Array.isArray(employee_ids) && employee_ids.length > 0) {
        employeesQuery = employeesQuery.whereIn('employees.id', employee_ids);
      }

      const employees = await employeesQuery;

      if (employees.length === 0) {
        return res.json({
          success: true,
          message: 'No employees to process',
          data: { generated: 0 }
        });
      }

      const generatedRecords = [];

      for (const employee of employees) {
        // Check if record already exists
        const existing = await database('salary_records')
          .where('employee_id', employee.id)
          .where('period', period)
          .first();

        if (existing) {
          continue; // Skip if already generated
        }

        const baseSalary = parseFloat(employee.base_salary || employee.job_title_base_salary || 0);

        // Get attendance data
        const attendanceResult = await database('attendances')
          .where('employee_id', employee.id)
          .whereBetween('attendance_date', [startDateStr, endDateStr])
          .select(
            database.raw('COUNT(*) as work_days'),
            database.raw('COALESCE(SUM(overtime_hours), 0) as overtime_hours')
          )
          .first();

        const actualWorkDays = parseInt(attendanceResult?.work_days || 0);
        const overtimeHours = parseFloat(attendanceResult?.overtime_hours || 0);

        // Get leave data
        const leaveResult = await database('leave_requests')
          .where('employee_id', employee.id)
          .where('leave_status', 'APPROVED')
          .where(function() {
            this.whereBetween('start_date', [startDateStr, endDateStr])
              .orWhereBetween('end_date', [startDateStr, endDateStr]);
          })
          .select('leave_type', 'days_requested')
          .then(rows => {
            const summary = {};
            for (const row of rows) {
              summary[row.leave_type] = (summary[row.leave_type] || 0) + parseFloat(row.days_requested);
            }
            return summary;
          });

        const unpaidLeaveDays = leaveResult['UNPAID'] || 0;

        // Get commission from contracts (for sales staff)
        const commissionsResult = await database('contracts')
          .where('sales_person_id', employee.id)
          .whereBetween('date_created', [startDateStr, endDateStr])
          .where('contract_status', 'ACTIVE')
          .sum('total_amount as total')
          .first();

        // Commission rate (could be configurable per employee/job)
        const commissionRate = 0.05; // 5%
        const commission = parseFloat(commissionsResult?.total || 0) * commissionRate;

        // Calculate salary components
        const hourlyRate = baseSalary / (workDaysInMonth * 8);
        const overtimePay = overtimeHours * hourlyRate * 1.5;
        const unpaidDeduction = (baseSalary / workDaysInMonth) * unpaidLeaveDays;

        const totalSalary = baseSalary + commission + overtimePay - unpaidDeduction;

        const calculationDetail = {
          base_salary: baseSalary,
          work_days_in_month: workDaysInMonth,
          actual_work_days: actualWorkDays,
          hourly_rate: hourlyRate.toFixed(2),
          overtime_hours: overtimeHours,
          overtime_rate: 1.5,
          overtime_pay: overtimePay.toFixed(2),
          commission_rate: commissionRate,
          commission_base: parseFloat(commissionsResult?.total || 0),
          unpaid_leave_days: unpaidLeaveDays,
          unpaid_deduction: unpaidDeduction.toFixed(2)
        };

        const [record] = await database('salary_records')
          .insert({
            employee_id: employee.id,
            period,
            base_salary: baseSalary,
            commission: commission,
            bonus: 0, // To be filled manually
            overtime_pay: overtimePay,
            deductions: unpaidDeduction,
            total_salary: totalSalary,
            work_days: actualWorkDays,
            overtime_hours: overtimeHours,
            leave_days: JSON.stringify(leaveResult),
            calculation_detail: JSON.stringify(calculationDetail),
            status: 'PENDING'
          })
          .returning('*');

        generatedRecords.push(record);
      }

      res.status(201).json({
        success: true,
        message: `Generated ${generatedRecords.length} salary records`,
        data: {
          generated: generatedRecords.length,
          period,
          records: generatedRecords
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PATCH /gym/payroll/salary-records/:id
   * Adjust salary record (manual adjustments)
   */
  router.patch('/payroll/salary-records/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        bonus,
        deductions,
        overtime_pay,
        commission,
        notes
      } = req.body || {};

      const existing = await database('salary_records').where('id', id).first();
      if (!existing) {
        throw NotFoundError('Salary record not found');
      }

      if (existing.status === 'PAID') {
        throw InvalidPayloadError('Cannot modify a paid salary record');
      }

      const updateData = {};
      let needsRecalc = false;

      if (bonus !== undefined) {
        updateData.bonus = parseFloat(bonus) || 0;
        needsRecalc = true;
      }
      if (deductions !== undefined) {
        updateData.deductions = parseFloat(deductions) || 0;
        needsRecalc = true;
      }
      if (overtime_pay !== undefined) {
        updateData.overtime_pay = parseFloat(overtime_pay) || 0;
        needsRecalc = true;
      }
      if (commission !== undefined) {
        updateData.commission = parseFloat(commission) || 0;
        needsRecalc = true;
      }

      // Recalculate total if components changed
      if (needsRecalc) {
        const baseSalary = parseFloat(existing.base_salary);
        const newBonus = updateData.bonus !== undefined ? updateData.bonus : parseFloat(existing.bonus);
        const newDeductions = updateData.deductions !== undefined ? updateData.deductions : parseFloat(existing.deductions);
        const newOvertimePay = updateData.overtime_pay !== undefined ? updateData.overtime_pay : parseFloat(existing.overtime_pay);
        const newCommission = updateData.commission !== undefined ? updateData.commission : parseFloat(existing.commission);

        updateData.total_salary = baseSalary + newCommission + newBonus + newOvertimePay - newDeductions;

        // Update calculation detail
        const calcDetail = existing.calculation_detail ?
          (typeof existing.calculation_detail === 'string' ? JSON.parse(existing.calculation_detail) : existing.calculation_detail)
          : {};

        calcDetail.manual_adjustments = {
          bonus: newBonus,
          deductions: newDeductions,
          overtime_pay: newOvertimePay,
          commission: newCommission,
          notes,
          adjusted_at: new Date().toISOString()
        };

        updateData.calculation_detail = JSON.stringify(calcDetail);
      }

      const [updated] = await database('salary_records')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Salary record updated successfully',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/payroll/salary-records/:id/approve
   * Approve salary record
   */
  router.post('/payroll/salary-records/:id/approve', async (req, res) => {
    try {
      const { id } = req.params;
      const { approved_by } = req.body || {};

      const record = await database('salary_records').where('id', id).first();
      if (!record) {
        throw NotFoundError('Salary record not found');
      }

      if (record.status !== 'PENDING') {
        throw InvalidPayloadError('Only pending records can be approved');
      }

      if (!approved_by) {
        throw InvalidPayloadError('approved_by is required');
      }

      const [updated] = await database('salary_records')
        .where('id', id)
        .update({
          status: 'APPROVED',
          approved_by,
          approved_at: new Date()
        })
        .returning('*');

      res.json({
        success: true,
        message: 'Salary record approved',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/payroll/batch-approve
   * Batch approve salary records
   */
  router.post('/payroll/batch-approve', async (req, res) => {
    try {
      const { record_ids, approved_by } = req.body || {};

      if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
        throw InvalidPayloadError('record_ids array is required');
      }
      if (!approved_by) {
        throw InvalidPayloadError('approved_by is required');
      }

      const updated = await database('salary_records')
        .whereIn('id', record_ids)
        .where('status', 'PENDING')
        .update({
          status: 'APPROVED',
          approved_by,
          approved_at: new Date()
        });

      res.json({
        success: true,
        message: `Approved ${updated} salary records`,
        data: { approved_count: updated }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/payroll/salary-records/:id/pay
   * Mark salary as paid
   */
  router.post('/payroll/salary-records/:id/pay', async (req, res) => {
    try {
      const { id } = req.params;
      const { paid_at, payment_reference } = req.body || {};

      const record = await database('salary_records').where('id', id).first();
      if (!record) {
        throw NotFoundError('Salary record not found');
      }

      if (record.status !== 'APPROVED') {
        throw InvalidPayloadError('Only approved records can be marked as paid');
      }

      // Update calculation detail with payment info
      const calcDetail = record.calculation_detail ?
        (typeof record.calculation_detail === 'string' ? JSON.parse(record.calculation_detail) : record.calculation_detail)
        : {};

      calcDetail.payment_info = {
        paid_at: paid_at || new Date().toISOString(),
        payment_reference: payment_reference || null
      };

      const [updated] = await database('salary_records')
        .where('id', id)
        .update({
          status: 'PAID',
          calculation_detail: JSON.stringify(calcDetail)
        })
        .returning('*');

      res.json({
        success: true,
        message: 'Salary marked as paid',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/payroll/export/:period
   * Export payroll report
   */
  router.get('/payroll/export/:period', async (req, res) => {
    try {
      const { period } = req.params;
      const { branch_id, format = 'csv' } = req.query;

      let query = database('salary_records')
        .leftJoin('employees', 'salary_records.employee_id', 'employees.id')
        .leftJoin('job_titles', 'employees.job_title_id', 'job_titles.id')
        .leftJoin('branches', 'employees.branch_id', 'branches.id')
        .where('salary_records.period', period)
        .select(
          'employees.employee_code',
          'employees.full_name',
          'job_titles.name as job_title',
          'branches.name as branch_name',
          'salary_records.base_salary',
          'salary_records.commission',
          'salary_records.bonus',
          'salary_records.overtime_pay',
          'salary_records.deductions',
          'salary_records.total_salary',
          'salary_records.work_days',
          'salary_records.overtime_hours',
          'salary_records.status'
        )
        .orderBy('employees.full_name');

      if (branch_id) {
        query = query.where('employees.branch_id', branch_id);
      }

      const records = await query;

      // Calculate totals
      const totals = records.reduce((acc, r) => ({
        base_salary: acc.base_salary + parseFloat(r.base_salary || 0),
        commission: acc.commission + parseFloat(r.commission || 0),
        bonus: acc.bonus + parseFloat(r.bonus || 0),
        overtime_pay: acc.overtime_pay + parseFloat(r.overtime_pay || 0),
        deductions: acc.deductions + parseFloat(r.deductions || 0),
        total_salary: acc.total_salary + parseFloat(r.total_salary || 0)
      }), {
        base_salary: 0,
        commission: 0,
        bonus: 0,
        overtime_pay: 0,
        deductions: 0,
        total_salary: 0
      });

      if (format === 'json') {
        return res.json({
          success: true,
          data: {
            period,
            records,
            totals,
            record_count: records.length
          }
        });
      }

      // CSV format
      const headers = [
        '員工編號', '姓名', '職稱', '分店', '底薪', '獎金提成', '獎金',
        '加班費', '扣款', '總薪資', '出勤天數', '加班時數', '狀態'
      ];

      const csvRows = [headers.join(',')];

      for (const r of records) {
        csvRows.push([
          r.employee_code || '',
          r.full_name || '',
          r.job_title || '',
          r.branch_name || '',
          r.base_salary || 0,
          r.commission || 0,
          r.bonus || 0,
          r.overtime_pay || 0,
          r.deductions || 0,
          r.total_salary || 0,
          r.work_days || 0,
          r.overtime_hours || 0,
          r.status || ''
        ].join(','));
      }

      // Add totals row
      csvRows.push([
        '', '合計', '', '',
        totals.base_salary.toFixed(2),
        totals.commission.toFixed(2),
        totals.bonus.toFixed(2),
        totals.overtime_pay.toFixed(2),
        totals.deductions.toFixed(2),
        totals.total_salary.toFixed(2),
        '', '', ''
      ].join(','));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="payroll_${period}.csv"`);
      res.send('\uFEFF' + csvRows.join('\n'));
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/payroll/promotions
   * List promotion/transfer records
   */
  router.get('/payroll/promotions', async (req, res) => {
    try {
      const { employee_id, type, limit = 20, offset = 0 } = req.query;

      let query = database('promotion_records')
        .leftJoin('employees', 'promotion_records.employee_id', 'employees.id')
        .leftJoin('job_titles as from_title', 'promotion_records.from_job_title_id', 'from_title.id')
        .leftJoin('job_titles as to_title', 'promotion_records.to_job_title_id', 'to_title.id')
        .leftJoin('branches as from_branch', 'promotion_records.from_branch_id', 'from_branch.id')
        .leftJoin('branches as to_branch', 'promotion_records.to_branch_id', 'to_branch.id')
        .leftJoin('employees as approver', 'promotion_records.approved_by', 'approver.id')
        .select(
          'promotion_records.*',
          'employees.full_name as employee_name',
          'employees.employee_code',
          'from_title.name as from_job_title_name',
          'to_title.name as to_job_title_name',
          'from_branch.name as from_branch_name',
          'to_branch.name as to_branch_name',
          'approver.full_name as approved_by_name'
        );

      if (employee_id) {
        query = query.where('promotion_records.employee_id', employee_id);
      }
      if (type) {
        query = query.where('promotion_records.type', type.toUpperCase());
      }

      const countQuery = query.clone().count('promotion_records.id as count').first();

      query = query
        .orderBy('promotion_records.effective_date', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      const [records, countResult] = await Promise.all([query, countQuery]);

      res.json({
        success: true,
        data: records,
        meta: {
          total: parseInt(countResult?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/payroll/promotions
   * Create promotion/transfer record
   */
  router.post('/payroll/promotions', async (req, res) => {
    try {
      const {
        employee_id,
        type,
        from_job_title_id,
        to_job_title_id,
        from_branch_id,
        to_branch_id,
        effective_date,
        reason,
        new_base_salary,
        approved_by
      } = req.body || {};

      if (!employee_id) {
        throw InvalidPayloadError('employee_id is required');
      }
      if (!type || !PROMOTION_TYPES.includes(type.toUpperCase())) {
        throw InvalidPayloadError(`type must be one of: ${PROMOTION_TYPES.join(', ')}`);
      }
      if (!effective_date) {
        throw InvalidPayloadError('effective_date is required');
      }

      const employee = await database('employees').where('id', employee_id).first();
      if (!employee) {
        throw NotFoundError('Employee not found');
      }

      // Create promotion record
      const [record] = await database('promotion_records')
        .insert({
          employee_id,
          type: type.toUpperCase(),
          from_job_title_id: from_job_title_id || employee.job_title_id,
          to_job_title_id: to_job_title_id || employee.job_title_id,
          from_branch_id: from_branch_id || employee.branch_id,
          to_branch_id: to_branch_id || employee.branch_id,
          effective_date: new Date(effective_date),
          reason: reason || null,
          approved_by: approved_by || null
        })
        .returning('*');

      // Update employee if effective date is today or past
      const today = new Date().toISOString().split('T')[0];
      if (effective_date <= today) {
        const updateData = {};
        if (to_job_title_id) updateData.job_title_id = to_job_title_id;
        if (to_branch_id) updateData.branch_id = to_branch_id;
        if (new_base_salary) updateData.base_salary = parseFloat(new_base_salary);

        if (Object.keys(updateData).length > 0) {
          await database('employees')
            .where('id', employee_id)
            .update(updateData);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Promotion record created successfully',
        data: record
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/payroll/summary
   * Get payroll summary for a period
   */
  router.get('/payroll/summary', async (req, res) => {
    try {
      const { period, branch_id } = req.query;

      if (!period) {
        throw InvalidPayloadError('period is required');
      }

      let query = database('salary_records')
        .leftJoin('employees', 'salary_records.employee_id', 'employees.id')
        .where('salary_records.period', period);

      if (branch_id) {
        query = query.where('employees.branch_id', branch_id);
      }

      const summary = await query
        .select(
          database.raw('COUNT(*) as total_employees'),
          database.raw('SUM(base_salary) as total_base_salary'),
          database.raw('SUM(commission) as total_commission'),
          database.raw('SUM(bonus) as total_bonus'),
          database.raw('SUM(overtime_pay) as total_overtime_pay'),
          database.raw('SUM(deductions) as total_deductions'),
          database.raw('SUM(total_salary) as grand_total'),
          database.raw("COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count"),
          database.raw("COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_count"),
          database.raw("COUNT(*) FILTER (WHERE status = 'PAID') as paid_count")
        )
        .first();

      // Get by status breakdown
      const byStatus = {
        PENDING: {
          count: parseInt(summary?.pending_count || 0),
          total: 0
        },
        APPROVED: {
          count: parseInt(summary?.approved_count || 0),
          total: 0
        },
        PAID: {
          count: parseInt(summary?.paid_count || 0),
          total: 0
        }
      };

      // Get totals by status
      const statusTotals = await query.clone()
        .select('status')
        .sum('total_salary as total')
        .groupBy('status');

      for (const st of statusTotals) {
        if (byStatus[st.status]) {
          byStatus[st.status].total = parseFloat(st.total || 0);
        }
      }

      res.json({
        success: true,
        data: {
          period,
          total_employees: parseInt(summary?.total_employees || 0),
          totals: {
            base_salary: parseFloat(summary?.total_base_salary || 0),
            commission: parseFloat(summary?.total_commission || 0),
            bonus: parseFloat(summary?.total_bonus || 0),
            overtime_pay: parseFloat(summary?.total_overtime_pay || 0),
            deductions: parseFloat(summary?.total_deductions || 0),
            grand_total: parseFloat(summary?.grand_total || 0)
          },
          by_status: byStatus
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

/**
 * Calculate work days in a month (excluding weekends)
 */
function calculateWorkDays(startDate, endDate) {
  let workDays = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return workDays;
}

export default registerPayrollRoutes;
