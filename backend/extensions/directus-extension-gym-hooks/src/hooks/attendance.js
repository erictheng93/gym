/**
 * Attendance Hooks
 * 處理 HR 考勤自動計算
 */

import { calculateWorkHours, calculateLateMinutes } from './utils.js';

/**
 * 註冊考勤鉤子
 */
export function registerAttendanceHooks({ action }, { services, database }) {
  const { ItemsService } = services;

  // 打卡簽退時自動計算工時
  action('attendances.items.update', async ({ payload, keys }, { schema }) => {
    if (!payload.check_out) return;

    try {
      const attendancesService = new ItemsService('attendances', {
        schema: schema,
        knex: database,
      });

      for (const attendanceId of keys) {
        const attendance = await attendancesService.readOne(attendanceId, {
          fields: ['id', 'check_in', 'check_out', 'employee_id', 'branch_id', 'late_minutes'],
        });

        if (!attendance || !attendance.check_in) continue;

        const checkOut = payload.check_out || attendance.check_out;
        const workHours = calculateWorkHours(attendance.check_in, checkOut);

        // 計算加班 (超過 8 小時)
        const standardHours = 8;
        const overtimeHours = Math.max(0, workHours - standardHours);

        // 決定出勤狀態
        let attendanceStatus = 'PRESENT';
        if (attendance.late_minutes > 0) {
          attendanceStatus = 'LATE';
        }

        await attendancesService.updateOne(attendanceId, {
          work_hours: workHours,
          overtime_hours: overtimeHours,
          attendance_status: attendanceStatus,
        });

        // Status logged(`[GymHook] Attendance ${attendanceId} calculated: ${workHours}h work, ${overtimeHours}h overtime`);
      }
    } catch (error) {
      // Error logged('[GymHook] Error calculating attendance:', error);
    }
  });

  // 打卡簽到時記錄日期和檢查遲到
  action('attendances.items.create', async ({ payload, key }, { schema }) => {
    if (!payload.check_in) return;

    try {
      const attendancesService = new ItemsService('attendances', {
        schema: schema,
        knex: database,
      });

      // 設定考勤日期
      const checkInDate = new Date(payload.check_in);
      const attendanceDate = checkInDate.toISOString().split('T')[0];

      // 取得班表設定 (如果有)
      let lateMinutes = 0;
      let scheduledStart = null;

      try {
        const shiftsService = new ItemsService('shift_schedules', {
          schema: schema,
          knex: database,
        });

        const shifts = await shiftsService.readByQuery({
          filter: {
            branch_id: { _eq: payload.branch_id },
            is_default: { _eq: true },
          },
          limit: 1,
        });

        if (shifts.length > 0) {
          const shift = shifts[0];
          const [hours, minutes] = shift.start_time.split(':');
          scheduledStart = new Date(checkInDate);
          scheduledStart.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          lateMinutes = calculateLateMinutes(
            payload.check_in,
            scheduledStart,
            shift.grace_period_minutes || 10
          );
        }
      } catch (e) {
        // shift_schedules 可能不存在
      }

      const attendanceStatus = lateMinutes > 0 ? 'LATE' : 'PRESENT';

      await attendancesService.updateOne(key, {
        attendance_date: attendanceDate,
        late_minutes: lateMinutes,
        attendance_status: attendanceStatus,
      });

      // Status logged(`[GymHook] Attendance ${key} created: date=${attendanceDate}, late=${lateMinutes}min`);
    } catch (error) {
      // Error logged('[GymHook] Error processing attendance check-in:', error);
    }
  });
}

export default registerAttendanceHooks;
