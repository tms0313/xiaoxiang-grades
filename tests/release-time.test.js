const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-utils.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context, { filename: 'app-utils.js' });

const { getExamReleaseTimestamp, isExamReleasedAt } = context;
const exam = end_date => ({ id: 'test-exam', end_date });
const utc = value => new Date(value).getTime();

test('release is exactly Saturday 18:00 Taiwan time for a Saturday exam end date', () => {
  const release = getExamReleaseTimestamp(exam('2026-11-28'));
  assert.equal(release, utc('2026-11-28T10:00:00.000Z'));
});

test('weekday exam end date releases on the following Saturday at 18:00 Taiwan time', () => {
  const release = getExamReleaseTimestamp(exam('2026-11-25'));
  assert.equal(release, utc('2026-11-28T10:00:00.000Z'));
});

test('Friday exam end date releases the next day, not one week later', () => {
  const release = getExamReleaseTimestamp(exam('2026-11-27'));
  assert.equal(release, utc('2026-11-28T10:00:00.000Z'));
});

test('exam ending on Sunday releases on the following Saturday', () => {
  const release = getExamReleaseTimestamp(exam('2026-11-29'));
  assert.equal(release, utc('2026-12-05T10:00:00.000Z'));
});

test('release is closed one millisecond before 18:00 and open at 18:00', () => {
  const release = utc('2026-11-28T10:00:00.000Z');
  assert.equal(isExamReleasedAt(exam('2026-11-28'), new Date(release - 1)), false);
  assert.equal(isExamReleasedAt(exam('2026-11-28'), new Date(release)), true);
  assert.equal(isExamReleasedAt(exam('2026-11-28'), new Date(release + 1)), true);
});

test('release remains open after Saturday 18:00, including later calendar days', () => {
  const release = utc('2026-11-28T10:00:00.000Z');
  assert.equal(isExamReleasedAt(exam('2026-11-28'), new Date(release + 86400000)), true);
});

test('missing or malformed exam dates never release', () => {
  assert.equal(getExamReleaseTimestamp(null), null);
  assert.equal(getExamReleaseTimestamp(exam(null)), null);
  assert.equal(getExamReleaseTimestamp(exam('not-a-date')), null);
  assert.equal(getExamReleaseTimestamp(exam('2026-02-30')), null);
  assert.equal(isExamReleasedAt(exam('2026-02-30'), new Date('2026-03-07T10:00:00Z')), false);
});

test('date timestamps with a time suffix use the exam calendar date only', () => {
  const release = getExamReleaseTimestamp(exam('2026-11-27T23:30:00+08:00'));
  assert.equal(release, utc('2026-11-28T10:00:00.000Z'));
});
