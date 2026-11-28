const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'attendance.js'), 'utf8');
const start = source.indexOf('function buildAttendanceRecordPayload(');
const end = source.indexOf('async function saveAttendanceSessionRecords()', start);
assert.ok(start >= 0 && end > start, 'attendance payload validation helper must exist');

const sandbox = {};
vm.runInNewContext(
  source.slice(start, end) +
  '\nglobalThis.buildAttendanceRecordPayload = buildAttendanceRecordPayload;',
  sandbox
);
const buildPayload = sandbox.buildAttendanceRecordPayload;

test('normal attendance requires an explicit checked-in or not-checked-in value', () => {
  for (const checkin of ['', 'unknown', null]) {
    const result = buildPayload([{ student_id: 's1', status: 'normal', lateRaw: '0', checkin }]);
    assert.equal(result.error, '請先完成所有出席學生的打卡狀態選擇。');
    assert.deepEqual(Array.from(result.payload), []);
  }
});

test('normal attendance preserves check-in status and non-negative integer late minutes', () => {
  const result = buildPayload([
    { student_id: 's1', status: 'normal', lateRaw: '0', checkin: 'checked_in' },
    { student_id: 's2', status: 'normal', lateRaw: '12', checkin: 'not_checked_in' }
  ]);
  assert.equal(result.error, '');
  assert.deepEqual(JSON.parse(JSON.stringify(result.payload)), [
    { student_id: 's1', attendance_status: 'normal', late_minutes: 0, checkin_status: 'checked_in' },
    { student_id: 's2', attendance_status: 'normal', late_minutes: 12, checkin_status: 'not_checked_in' }
  ]);
});

test('leave records always persist zero late minutes and null check-in status', () => {
  const result = buildPayload([
    { student_id: 's3', status: 'leave', lateRaw: '0', checkin: '' }
  ]);
  assert.equal(result.error, '');
  assert.deepEqual(JSON.parse(JSON.stringify(result.payload)), [
    { student_id: 's3', attendance_status: 'leave', late_minutes: 0, checkin_status: null }
  ]);
});

test('rejects negative, fractional, empty and non-numeric late minutes', () => {
  for (const lateRaw of ['-1', '1.5', '', 'abc']) {
    const result = buildPayload([
      { student_id: 's1', status: 'normal', lateRaw, checkin: 'checked_in' }
    ]);
    assert.equal(result.error, '遲到分鐘必須是大於或等於 0 的整數。', lateRaw);
    assert.deepEqual(Array.from(result.payload), []);
  }
});

test('rejects unsupported attendance status instead of silently treating it as leave', () => {
  const result = buildPayload([
    { student_id: 's1', status: 'absent', lateRaw: '0', checkin: '' }
  ]);
  assert.equal(result.error, '出缺席狀態不正確，請重新確認。');
  assert.deepEqual(Array.from(result.payload), []);
});

test('validates the entire class before returning any partial payload', () => {
  const result = buildPayload([
    { student_id: 's1', status: 'normal', lateRaw: '5', checkin: 'checked_in' },
    { student_id: 's2', status: 'normal', lateRaw: '0', checkin: '' }
  ]);
  assert.equal(result.error, '請先完成所有出席學生的打卡狀態選擇。');
  assert.deepEqual(Array.from(result.payload), []);
});

test('handles empty input without fabricating attendance records', () => {
  const result = buildPayload([]);
  assert.equal(result.error, '');
  assert.deepEqual(Array.from(result.payload), []);
});
