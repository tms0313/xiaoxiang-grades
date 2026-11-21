-- 出缺席紀錄新增家長簽名狀態
-- 既有紀錄預設為未簽，避免既有資料被誤判為已簽。

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS parent_signature_status text NOT NULL DEFAULT 'unsigned';

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_parent_signature_status_check;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_parent_signature_status_check
  CHECK (parent_signature_status IN ('signed', 'unsigned'));

COMMENT ON COLUMN public.attendance_records.parent_signature_status IS
  '家長簽名狀態：signed=已簽，unsigned=未簽';
