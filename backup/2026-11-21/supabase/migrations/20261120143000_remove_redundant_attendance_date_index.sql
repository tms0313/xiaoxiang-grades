-- 小象資料庫效能優化：移除重複的課堂日期索引
-- attendance_sessions_unique_slot 的複合唯一索引以 session_date 為首欄，
-- 已可支援依日期篩選課堂；單欄 session_date 索引為冗餘。
DROP INDEX IF EXISTS public.attendance_sessions_date_idx;
