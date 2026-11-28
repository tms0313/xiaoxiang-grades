const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-parent.js'), 'utf8');
const start = source.indexOf('function getParentAttendanceMonthlyPeriod(');
const end = source.indexOf('let parentDashboardRequestId', start);
assert.ok(start >= 0 && end > start, 'monthly attendance helpers must exist');

const sandbox = {};
vm.runInNewContext(
  source.slice(start, end) +
  '\nglobalThis.getParentAttendanceMonthlyPeriod = getParentAttendanceMonthlyPeriod;' +
  '\nglobalThis.summarizeParentAttendanceRecords = summarizeParentAttendanceRecords;',
  sandbox
);

test('monthly summary remains hidden until the initial December 5, 2026 18:00 release', () => {
  const beforeRollout = sandbox.getParentAttendanceMonthlyPeriod({
    year: '2026', month: '11', day: '28', hour: '09'
  });
  const beforeRelease = sandbox.getParentAttendanceMonthlyPeriod({
    year: '2026', month: '12', day: '05', hour: '17'
  });
  assert.equal(beforeRollout, null);
  assert.equal(beforeRelease, null);
});

test('first monthly summary release publishes November at December 5, 2026 18:00', () => {
  const result = sandbox.getParentAttendanceMonthlyPeriod({
    year: '2026', month: '12', day: '05', hour: '18'
  });
  assert.equal(result.month, '11月');
  assert.equal(result.start, '2026-11-01');
  assert.equal(result.end, '2026-11-30');
});

test('published monthly summary remains the same until the next monthly release', () => {
  const afterRelease = sandbox.getParentAttendanceMonthlyPeriod({
    year: '2026', month: '12', day: '06', hour: '09'
  });
  const beforeNextRelease = sandbox.getParentAttendanceMonthlyPeriod({
    year: '2027', month: '01', day: '01', hour: '23'
  });
  const nextRelease = sandbox.getParentAttendanceMonthlyPeriod({
    year: '2027', month: '01', day: '02', hour: '18'
  });
  assert.equal(afterRelease.month, '11月');
  assert.equal(beforeNextRelease.month, '11月');
  assert.equal(nextRelease.month, '12月');
  assert.equal(nextRelease.start, '2026-12-01');
  assert.equal(nextRelease.end, '2026-12-31');
});

test('monthly attendance totals include normal records only and count each missed check-in', () => {
  const result = sandbox.summarizeParentAttendanceRecords([
    { attendance_status: 'normal', late_minutes: 12, checkin_status: 'not_checked_in' },
    { attendance_status: 'normal', late_minutes: 5, checkin_status: 'checked_in' },
    { attendance_status: 'leave', late_minutes: 0, checkin_status: null },
    { attendance_status: 'absent', late_minutes: 0, checkin_status: null }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    lateMinutes: 17,
    uncheckedCount: 1
  });
});

test('monthly attendance totals default to zero for no records', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.summarizeParentAttendanceRecords([]))),
    { lateMinutes: 0, uncheckedCount: 0 }
  );
});
