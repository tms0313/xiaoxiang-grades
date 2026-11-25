-- Reconcile attendance indexes using observed production usage.
-- Keep the actively used indexes; remove only the unused duplicate copies.
CREATE INDEX IF NOT EXISTS attendance_records_session_idx
  ON public.attendance_records USING btree (session_id);

CREATE INDEX IF NOT EXISTS attendance_records_student_idx
  ON public.attendance_records USING btree (student_id, session_id);

CREATE INDEX IF NOT EXISTS attendance_sessions_date_idx
  ON public.attendance_sessions USING btree (session_date DESC);

DROP INDEX IF EXISTS public.idx_attendance_records_session;
DROP INDEX IF EXISTS public.idx_attendance_records_student;
DROP INDEX IF EXISTS public.idx_attendance_sessions_date;
