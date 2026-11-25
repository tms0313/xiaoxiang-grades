-- Optimize per-row auth.uid() evaluation in selected RLS policies.
-- Authorization predicates remain unchanged; only auth.uid() is wrapped in a scalar subquery.
-- This preserves role boundaries while allowing PostgreSQL to evaluate the auth context once.

DROP POLICY IF EXISTS alumni_scores_admin_all ON public.alumni_mock_scores;
CREATE POLICY alumni_scores_admin_all ON public.alumni_mock_scores
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS attendance_records_parent_select ON public.attendance_records;
CREATE POLICY attendance_records_parent_select ON public.attendance_records
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.guardian_students gs
    WHERE gs.student_id = attendance_records.student_id
      AND gs.guardian_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS attendance_sessions_parent_select ON public.attendance_sessions;
CREATE POLICY attendance_sessions_parent_select ON public.attendance_sessions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.attendance_records ar
    JOIN public.guardian_students gs ON gs.student_id = ar.student_id
    WHERE ar.session_id = attendance_sessions.id
      AND gs.guardian_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS admin_delete_missing_exclusions ON public.score_missing_exclusions;
CREATE POLICY admin_delete_missing_exclusions ON public.score_missing_exclusions
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS admin_insert_missing_exclusions ON public.score_missing_exclusions;
CREATE POLICY admin_insert_missing_exclusions ON public.score_missing_exclusions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS admin_select_missing_exclusions ON public.score_missing_exclusions;
CREATE POLICY admin_select_missing_exclusions ON public.score_missing_exclusions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS guardians_insert_own_student_reviews ON public.score_review_records;
CREATE POLICY guardians_insert_own_student_reviews ON public.score_review_records
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    guardian_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.guardian_students gs
      WHERE gs.student_id = score_review_records.student_id
        AND gs.guardian_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS guardians_read_own_student_reviews ON public.score_review_records;
CREATE POLICY guardians_read_own_student_reviews ON public.score_review_records
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.guardian_students gs
    WHERE gs.student_id = score_review_records.student_id
      AND gs.guardian_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Admins manage student subjects" ON public.student_subjects;
CREATE POLICY "Admins manage student subjects" ON public.student_subjects
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "Admins manage teacher assignments" ON public.teacher_assignments;
CREATE POLICY "Admins manage teacher assignments" ON public.teacher_assignments
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ));

DROP POLICY IF EXISTS "Admins can manage term exam scores" ON public.term_exam_scores;
CREATE POLICY "Admins can manage term exam scores" ON public.term_exam_scores
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'admin'
  ));
