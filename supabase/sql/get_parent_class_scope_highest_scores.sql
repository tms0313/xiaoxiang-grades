-- 小象成績查詢系統：家長端班級最高分統計
-- 僅回傳家長已綁定學生所在班級的彙總最高值，不回傳其他學生的個別資料。

CREATE OR REPLACE FUNCTION public.get_parent_class_scope_highest_scores()
RETURNS TABLE (
  student_id uuid,
  exam_id uuid,
  subject text,
  scope text,
  highest_score numeric,
  value_unit text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT
    own_student.id AS student_id,
    score.exam_id,
    score.subject,
    score.scope,
    MAX(
      CASE
        WHEN own_student.class_name = '國三班' AND score.subject <> '數學'
          THEN score.correct_count::numeric
        ELSE score.score::numeric
      END
    ) AS highest_score,
    CASE
      WHEN own_student.class_name = '國三班' AND score.subject <> '數學' THEN '題'
      ELSE '分'
    END AS value_unit
  FROM public.guardian_students AS guardian_link
  JOIN public.students AS own_student
    ON own_student.id = guardian_link.student_id
  JOIN public.students AS classmate
    ON classmate.class_name = own_student.class_name
  JOIN public.scores AS score
    ON score.student_id = classmate.id
  JOIN public.exams AS exam
    ON exam.id = score.exam_id
  WHERE guardian_link.guardian_id = auth.uid()
    AND auth.uid() IS NOT NULL
    AND exam.id IN (
      SELECT latest_exam.id
      FROM public.exams AS latest_exam
      ORDER BY latest_exam.start_date DESC
      LIMIT 3
    )
    AND (
      (exam.end_date::date
        + ((6 - EXTRACT(DOW FROM exam.end_date::date)::integer + 7) % 7)
      )::timestamp + TIME '20:00'
    ) <= (now() AT TIME ZONE 'Asia/Taipei')
    AND score.grade_level IS DISTINCT FROM '請假'
    AND score.grade_level IS DISTINCT FROM '缺考'
    AND (
      CASE
        WHEN own_student.class_name = '國三班' AND score.subject <> '數學'
          THEN score.correct_count
        ELSE score.score
      END
    ) IS NOT NULL
  GROUP BY
    own_student.id,
    own_student.class_name,
    score.exam_id,
    score.subject,
    score.scope;
$function$;

REVOKE ALL ON FUNCTION public.get_parent_class_scope_highest_scores() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_parent_class_scope_highest_scores() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_parent_class_scope_highest_scores() TO authenticated;
