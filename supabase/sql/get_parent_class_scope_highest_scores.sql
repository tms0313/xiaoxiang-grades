-- 小象成績查詢系統：家長端班級最高分統計
-- 僅回傳家長已綁定學生所在班級的彙總最高值與該筆最高成績的等級，
-- 不回傳其他學生的姓名或個別成績。

CREATE OR REPLACE FUNCTION public.get_parent_class_scope_highest_scores()
RETURNS TABLE (
  student_id uuid,
  exam_id uuid,
  subject text,
  scope text,
  highest_score numeric,
  value_unit text,
  highest_grade_level text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH eligible_scores AS (
    SELECT
      own_student.id AS student_id,
      own_student.class_name,
      score.id AS score_id,
      score.exam_id,
      score.subject,
      score.scope,
      CASE
        WHEN own_student.class_name = '國三班' AND score.subject <> '數學'
          THEN score.correct_count::numeric
        ELSE score.score::numeric
      END AS score_value,
      CASE
        WHEN own_student.class_name = '國三班' AND score.subject <> '數學' THEN '題'
        ELSE '分'
      END AS value_unit,
      score.grade_level
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
  ),
  ranked_scores AS (
    SELECT
      eligible_scores.*,
      ROW_NUMBER() OVER (
        PARTITION BY student_id, exam_id, subject, scope
        ORDER BY score_value DESC, grade_level ASC NULLS LAST, score_id
      ) AS score_rank
    FROM eligible_scores
  )
  SELECT
    student_id,
    exam_id,
    subject,
    scope,
    score_value AS highest_score,
    value_unit,
    grade_level AS highest_grade_level
  FROM ranked_scores
  WHERE score_rank = 1;
$function$;

REVOKE ALL ON FUNCTION public.get_parent_class_scope_highest_scores() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_parent_class_scope_highest_scores() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_parent_class_scope_highest_scores() TO authenticated;
