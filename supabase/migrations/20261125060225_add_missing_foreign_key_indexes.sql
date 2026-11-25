-- Add targeted indexes for foreign-key lookups flagged by the Supabase advisor.
-- These indexes do not change row data, constraints, or RLS permissions.
CREATE INDEX IF NOT EXISTS idx_guardian_students_student_id
  ON public.guardian_students USING btree (student_id);

CREATE INDEX IF NOT EXISTS idx_login_events_user_id
  ON public.login_events USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_score_missing_exclusions_student_id
  ON public.score_missing_exclusions USING btree (student_id);

CREATE INDEX IF NOT EXISTS idx_score_review_records_guardian_id
  ON public.score_review_records USING btree (guardian_id);

CREATE INDEX IF NOT EXISTS idx_scores_exam_id
  ON public.scores USING btree (exam_id);

CREATE INDEX IF NOT EXISTS idx_term_exam_scores_student_id
  ON public.term_exam_scores USING btree (student_id);
