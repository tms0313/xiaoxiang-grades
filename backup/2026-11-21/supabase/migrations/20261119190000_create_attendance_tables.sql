-- 小象文教機構｜出缺席正式資料庫
-- 建立課堂與學生出缺席紀錄，並依管理員／家長綁定關係限制存取。
-- 家長端目前仍不顯示；本 migration 先建立未來使用的唯讀權限。

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date NOT NULL,
  class_name text NOT NULL
    CHECK (class_name IN ('國一班', '國二班', '國三班')),
  subject text NOT NULL
    CHECK (subject IN ('國文', '英文', '數學', '自然')),
  start_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_sessions_unique_slot
    UNIQUE (session_date, class_name, subject, start_time)
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL
    REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL
    REFERENCES public.students(id) ON DELETE CASCADE,
  attendance_status text NOT NULL
    CHECK (attendance_status IN ('normal', 'leave', 'absent')),
  late_minutes integer NOT NULL DEFAULT 0
    CHECK (late_minutes >= 0),
  checkin_status text
    CHECK (checkin_status IN ('checked_in', 'not_checked_in')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_unique_student
    UNIQUE (session_id, student_id),
  CONSTRAINT attendance_records_checkin_check
    CHECK (
      (
        attendance_status = 'normal'
        AND checkin_status IS NOT NULL
        AND late_minutes >= 0
      )
      OR
      (
        attendance_status IN ('leave', 'absent')
        AND checkin_status IS NULL
        AND late_minutes = 0
      )
    )
);

CREATE INDEX IF NOT EXISTS attendance_sessions_date_idx
  ON public.attendance_sessions (session_date DESC);

CREATE INDEX IF NOT EXISTS attendance_records_student_idx
  ON public.attendance_records (student_id, session_id);

CREATE INDEX IF NOT EXISTS attendance_records_session_idx
  ON public.attendance_records (session_id);

ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.attendance_sessions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.attendance_records FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.attendance_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.attendance_records TO authenticated;

DROP POLICY IF EXISTS attendance_sessions_admin_all
  ON public.attendance_sessions;
CREATE POLICY attendance_sessions_admin_all
  ON public.attendance_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS attendance_sessions_parent_select
  ON public.attendance_sessions;
CREATE POLICY attendance_sessions_parent_select
  ON public.attendance_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.attendance_records ar
      JOIN public.guardian_students gs
        ON gs.student_id = ar.student_id
      WHERE ar.session_id = attendance_sessions.id
        AND gs.guardian_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS attendance_records_admin_all
  ON public.attendance_records;
CREATE POLICY attendance_records_admin_all
  ON public.attendance_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS attendance_records_parent_select
  ON public.attendance_records;
CREATE POLICY attendance_records_parent_select
  ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.guardian_students gs
      WHERE gs.student_id = attendance_records.student_id
        AND gs.guardian_id = auth.uid()
    )
  );

COMMENT ON TABLE public.attendance_sessions IS
  '每一筆代表某日、班級、科目與開始時間的一堂課';
COMMENT ON TABLE public.attendance_records IS
  '每堂課每位學生一筆出缺席紀錄；只有正常出席才需選擇打卡狀態';
