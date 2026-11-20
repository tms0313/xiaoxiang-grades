-- 小象資料庫效能優化：移除重複索引
-- attendance_records_unique_student 的唯一索引以 session_id 為首欄，
-- 已可支援依 session_id 查詢，故單欄 session_id 索引為冗餘。
DROP INDEX IF EXISTS public.attendance_records_session_idx;
