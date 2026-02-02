/**
 * Coach App Types
 */

export interface Coach {
  id: string
  employee_code: string
  full_name: string
  phone?: string
  email?: string
  branch_id: string
  branch_name?: string
  job_title: {
    id: string
    name: string
    code: string
  }
  hire_date?: string
  stats?: {
    student_count: number
    today_class_count: number
  }
}

export interface TokenState {
  accessToken: string | null
  refreshToken: string | null
}

export interface Student {
  id: string
  member_code: string
  full_name: string
  phone?: string
  email?: string
  status: string
  avatar?: string
  gender?: string
  birthday?: string
  join_date?: string
  coach_role: 'PRIMARY' | 'SECONDARY'
  assigned_at: string
  branch_name: string
  completed_classes: number
  active_contracts: number
  current_goal?: string
}

export interface StudentNote {
  id: string
  note_type: 'PROGRESS' | 'GOAL' | 'INJURY' | 'FEEDBACK' | 'GENERAL'
  content: string
  is_private: boolean
  created_at: string
  updated_at?: string
}

export interface ClassBooking {
  id: string
  scheduled_at: string
  duration_minutes: number
  status: 'BOOKED' | 'COMPLETED' | 'MEMBER_CANCELLED' | 'COACH_CANCELLED' | 'NO_SHOW'
  notes?: string
  is_charged: boolean
  booked_by: 'MEMBER' | 'COACH' | 'RECEPTION'
  member: {
    id: string
    member_code: string
    full_name: string
    phone?: string
    email?: string
  }
  contract: {
    id: string
    contract_no: string
    remaining_counts?: number
    plan_name: string
    plan_type: 'TIME_BASED' | 'COUNT_BASED'
  }
  branch_name: string
}

export interface LessonPlan {
  id: string
  title: string
  objectives?: string[]
  warmup_exercises?: Exercise[]
  main_exercises?: Exercise[]
  cooldown_exercises?: Exercise[]
  notes?: string
  is_template: boolean
  template_category?: string
  difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  duration_minutes: number
  coach_id: string
  coach_name?: string
  session_id?: string
  session_time?: string
  member_name?: string
  created_at: string
  updated_at?: string
}

export interface Exercise {
  name: string
  sets?: number
  reps?: number | string
  weight?: number | string
  rest_seconds?: number | string
  notes?: string
}

export interface TeachingMaterial {
  id: string
  type: 'VIDEO' | 'DOCUMENT' | 'EXERCISE'
  category: string
  name: string
  description?: string
  file_id?: string
  video_url?: string
  thumbnail_url?: string
  muscle_groups?: string[]
  equipment?: string[]
  difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  instructions?: string[]
  tips?: string[]
  common_mistakes?: string[]
  template_content?: Record<string, unknown>
  related_materials?: Array<{
    id: string
    name: string
    thumbnail_url?: string
  }>
  created_by?: string
  created_by_name?: string
  created_at: string
  updated_at?: string
}
