import { sql } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';

/**
 * Calendar days for the war room and analytics are Taiwan days (same zone as
 * the cron jobs): "today", the hour of a check-in and the month of a payment
 * are read in Asia/Taipei, not in the server's or database's zone.
 */
export const REPORT_TIME_ZONE = 'Asia/Taipei';

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date (YYYY-MM-DD) in the report time zone. */
export function localToday(now: Date = new Date()): string {
  return DAY_FORMAT.format(now);
}

const toUtc = (day: string) => new Date(`${day}T00:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

/** Moves by whole months, clamping the day (03-31 minus one month is 02-28/29). */
export function addMonths(day: string, months: number): string {
  const date = toUtc(day);
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(dayOfMonth, lastDay));
  return format(date);
}

/** Every day from start to end, both included. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

export const PERIOD_TYPES = ['today', 'week', 'month', 'year'] as const;
export type PeriodType = typeof PERIOD_TYPES[number];

export interface ReportWindow {
  /** First day, included. */
  start: string;
  /** Last day, included (today for to-date periods). */
  end: string;
  /** The same span one period earlier, for the "change" figures. */
  previousStart: string;
  previousEnd: string;
}

/**
 * To-date calendar periods: today, this week (from Monday), this month, this
 * year. The previous window covers the same elapsed span of the period before
 * (yesterday; Monday..same weekday last week; 1st..same day last month; ...).
 */
export function periodWindow(type: PeriodType, today: string): ReportWindow {
  switch (type) {
    case 'today':
      return { start: today, end: today, previousStart: addDays(today, -1), previousEnd: addDays(today, -1) };
    case 'week': {
      const sinceMonday = (toUtc(today).getUTCDay() + 6) % 7;
      const start = addDays(today, -sinceMonday);
      return { start, end: today, previousStart: addDays(start, -7), previousEnd: addDays(today, -7) };
    }
    case 'month': {
      const start = `${today.slice(0, 7)}-01`;
      return { start, end: today, previousStart: addMonths(start, -1), previousEnd: addMonths(today, -1) };
    }
    case 'year': {
      const year = Number(today.slice(0, 4));
      return { start: `${year}-01-01`, end: today, previousStart: `${year - 1}-01-01`, previousEnd: addMonths(today, -12) };
    }
  }
}

/** The last `days` days ending today, and the `days` before them. */
export function rollingWindow(days: number, today: string): ReportWindow {
  const start = addDays(today, -(days - 1));
  return { start, end: today, previousStart: addDays(start, -days), previousEnd: addDays(start, -1) };
}

/** The local calendar day (YYYY-MM-DD text) of a timestamptz column. */
export function localDay(column: AnyColumn | SQL): SQL<string> {
  return sql<string>`to_char(${column} at time zone 'Asia/Taipei', 'YYYY-MM-DD')`;
}

/**
 * Half-open [start 00:00, end + 1 day 00:00) on a timestamptz column, in local
 * time, so the whole end day is included and the bounds stay index-friendly.
 */
export function timestampInDays(column: AnyColumn | SQL, start: string, end: string): SQL {
  return sql`(${column} >= ${start}::date::timestamp at time zone 'Asia/Taipei' and ${column} < (${end}::date + 1)::timestamp at time zone 'Asia/Taipei')`;
}

/** Inclusive day range on a date column. */
export function dateInDays(column: AnyColumn | SQL, start: string, end: string): SQL {
  return sql`(${column} >= ${start}::date and ${column} <= ${end}::date)`;
}

/** Percentage with one decimal; 0 when the base is 0. */
export function percentage(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

/** Change from previous to current in percent, one decimal (100 when growing from 0). */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
