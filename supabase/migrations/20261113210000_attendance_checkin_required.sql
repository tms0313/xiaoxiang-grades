-- 出缺席資料完整性：正常出席必須明確選擇打卡狀態。
-- 原 CHECK 在 checkin_status 為 NULL 時可能回傳 UNKNOWN，而 PostgreSQL CHECK 會接受 UNKNOWN。

ALTER TABLE public.attendance_records
DROP CONSTRAINT IF EXISTS attendance_records_checkin_check;

ALTER TABLE public.attendance_records
ADD CONSTRAINT attendance_records_checkin_check
CHECK (
    (
        attendance_status = 'normal'
        AND checkin_status IS NOT NULL
        AND checkin_status IN ('checked_in', 'not_checked_in')
    )
    OR
    (
        attendance_status IN ('leave', 'absent')
        AND checkin_status IS NULL
        AND late_minutes = 0
    )
);
