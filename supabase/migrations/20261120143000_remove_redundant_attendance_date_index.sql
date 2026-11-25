-- 小象資料庫效能整理：移除未使用的重複日期索引。
-- 線上統計確認 attendance_sessions_date_idx 正在被使用，
-- 因此保留該索引，改刪除未使用的重複索引 idx_attendance_sessions_date。
DROP INDEX IF EXISTS public.idx_attendance_sessions_date;
