const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const authSource = fs.readFileSync(path.join(__dirname, '..', 'app-auth.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const adminDataSource = fs.readFileSync(path.join(__dirname, '..', 'app-admin-data.js'), 'utf8');
const overviewSource = fs.readFileSync(path.join(__dirname, '..', 'app-overview.js'), 'utf8');

function loadLogoutReset() {
  const start = authSource.indexOf('function resetSessionStateAfterLogout()');
  const end = authSource.indexOf('async function handleLogout()', start);
  assert.ok(start >= 0 && end > start, 'logout reset helper must exist');

  const clearedIntervals = [];
  const clearedTimeouts = [];
  const sandbox = {
    clearedIntervals,
    clearedTimeouts,
    clearInterval(value) { clearedIntervals.push(value); },
    clearTimeout(value) { clearedTimeouts.push(value); }
  };
  const declarations = `
    let appSessionGeneration = 7;
    let dashboardRenderRequestId = 1;
    let parentDashboardRequestId = 2;
    let teacherDashboardRequestId = 3;
    let attendanceLoadRequestId = 4;
    let attendanceCalendarRequestId = 5;
    let attendanceWeeklyOverviewRequestId = 6;
    let overviewAutoRefreshTimer = 101;
    let parentExamReleaseRefreshTimer = 202;
    let overviewAutoRefreshBusy = true;
    let currentUser = { id: 'old-user' };
    let currentProfile = { role: 'admin' };
    let profileRolesCache = [{ role: 'teacher' }];
    let teacherRoleIdsCache = new Set(['old-teacher']);
    let studentsCache = [{ id: 'old-student' }];
    let examsCache = [{ id: 'old-exam', start_date: '2026-01-01' }];
    let examsByIdCache = new Map([['old-exam', {}]]);
    let examsByDateDescCache = [{ id: 'old-exam' }];
    let profilesCache = [{ id: 'old-parent' }];
    let studentsByIdCache = new Map([['old-student', {}]]);
    let activeStudentsCache = [{}];
    let explicitlyActiveStudentsCache = [{}];
    let activeStudentsByClassCache = new Map([['國一班', []]]);
    let parentProfilesByIdCache = new Map([['old-parent', {}]]);
    let scoresCache = [{ id: 'old-score' }];
    let scoresByIdCache = new Map([['old-score', {}]]);
    let scoresByStudentExamSubjectScopeCache = new Map([['old-key', {}]]);
    let adminHighestPreviewCache = new Map([['old-preview', {}]]);
    let missingExclusionsCache = [{ id: 'old-exclusion' }];
    let guardianLinksCache = [{ guardian_id: 'old-parent', student_id: 'old-student' }];
    let guardiansWithBindingsCache = new Set(['old-parent']);
    let guardianStudentBindingKeysCache = new Set(['old-binding']);
    let studentSubjectsCache = [{ student_id: 'old-student' }];
    let activeSubjectsByStudentCache = new Map([['old-student', []]]);
    let teacherProfilesCache = [{}];
    let teacherProfilesByIdCache = new Map([['old-teacher', {}]]);
    let teacherAssignmentsCache = [{}];
    let teacherStudentsCache = [{}];
    let teacherExamsCache = [{}];
    let teacherExamsByIdCache = new Map([['old-exam', {}]]);
    let teacherExamOptionsCache = 'old-options';
    let teacherScoresCache = [{}];
    let teacherStudentSubjectsCache = [{}];
    let teacherPermittedSubjectsByClass = new Map([['國一班', new Set()]]);
    let teacherStudentsByClassSubject = new Map([['key', []]]);
    let teacherScoresByStudentExamSubject = new Map([['key', []]]);
    let scoreEntryStudentsByClassSubject = new Map([['key', []]]);
    let bulkEntryExistingScoresByStudent = new Map([['old-student', {}]]);
    let bulkEntryScoreContextKey = 'old-context';
    let teacherSelectedExamId = 'old-exam';
    let teacherSelectedClassName = '國一班';
    let scoreEntrySavedCount = 4;
    let adminHighestPreviewExamId = 'old-exam';
    let adminHighestPreviewClassName = '國一班';
    let adminHighestPreviewSubject = '數學';
    let adminDataLoadMetrics = { totalMs: 1 };
    let activeTab = 'overview';
    let attendanceSelectedDate = '2026-11-27';
    let attendanceSelectedSession = {};
    let attendanceLoadedStudents = [{}];
    let attendanceSavedSessionId = 'old-session';
    let attendanceCalendarMonth = '2026-11';
    let attendanceCalendarMarkedDates = new Set(['2026-11-27']);
    let attendanceWeeklyOverviewWeek = '2026-11-23';
    let attendanceWeeklyOverviewClass = '國一班';

    function rebuildExamIndexes() {
      examsByIdCache = new Map(examsCache.map(item => [String(item.id), item]));
      examsByDateDescCache = examsCache.slice();
    }
    function rebuildAdminEntityIndexes() {
      studentsByIdCache = new Map();
      activeStudentsCache = [];
      explicitlyActiveStudentsCache = [];
      activeStudentsByClassCache = new Map();
      parentProfilesByIdCache = new Map();
    }
    function rebuildScoresByIdCache() {
      scoresByIdCache = new Map();
      scoresByStudentExamSubjectScopeCache = new Map();
    }
    function invalidateAdminHighestPreviewCache() {
      adminHighestPreviewCache.clear();
    }
    function rebuildGuardianBindingIndexes() {
      guardiansWithBindingsCache = new Set();
      guardianStudentBindingKeysCache = new Set();
    }
    function rebuildActiveSubjectsByStudentCache() {
      activeSubjectsByStudentCache = new Map();
    }
  `;
  vm.runInNewContext(
    declarations + authSource.slice(start, end) +
    `
      resetSessionStateAfterLogout();
      globalThis.snapshot = {
        appSessionGeneration, dashboardRenderRequestId, parentDashboardRequestId,
        teacherDashboardRequestId, attendanceLoadRequestId, attendanceCalendarRequestId,
        attendanceWeeklyOverviewRequestId, overviewAutoRefreshTimer, parentExamReleaseRefreshTimer,
        overviewAutoRefreshBusy, currentUser, currentProfile, profileRolesCache, teacherRoleIdsCache,
        studentsCache, examsCache, examsByIdCache, examsByDateDescCache, profilesCache,
        studentsByIdCache, activeStudentsCache, explicitlyActiveStudentsCache,
        activeStudentsByClassCache, parentProfilesByIdCache, scoresCache, scoresByIdCache,
        scoresByStudentExamSubjectScopeCache, adminHighestPreviewCache, missingExclusionsCache,
        guardianLinksCache, guardiansWithBindingsCache, guardianStudentBindingKeysCache,
        studentSubjectsCache, activeSubjectsByStudentCache, teacherProfilesCache,
        teacherProfilesByIdCache, teacherAssignmentsCache, teacherStudentsCache, teacherExamsCache,
        teacherExamsByIdCache, teacherExamOptionsCache, teacherScoresCache, teacherStudentSubjectsCache,
        teacherPermittedSubjectsByClass, teacherStudentsByClassSubject, teacherScoresByStudentExamSubject,
        scoreEntryStudentsByClassSubject, bulkEntryExistingScoresByStudent, bulkEntryScoreContextKey,
        teacherSelectedExamId, teacherSelectedClassName, scoreEntrySavedCount,
        adminHighestPreviewExamId, adminHighestPreviewClassName, adminHighestPreviewSubject,
        adminDataLoadMetrics, activeTab, attendanceSelectedDate, attendanceSelectedSession,
        attendanceLoadedStudents, attendanceSavedSessionId, attendanceCalendarMonth,
        attendanceCalendarMarkedDates, attendanceWeeklyOverviewWeek, attendanceWeeklyOverviewClass
      };
    `,
    sandbox
  );
  return sandbox;
}

test('logout clears role caches, stops timers and invalidates pending requests', () => {
  const sandbox = loadLogoutReset();
  const state = sandbox.snapshot;

  assert.equal(state.appSessionGeneration, 8);
  assert.equal(state.dashboardRenderRequestId, 2);
  assert.equal(state.parentDashboardRequestId, 3);
  assert.equal(state.teacherDashboardRequestId, 4);
  assert.equal(state.attendanceLoadRequestId, 5);
  assert.equal(state.attendanceCalendarRequestId, 6);
  assert.equal(state.attendanceWeeklyOverviewRequestId, 7);

  assert.deepEqual(sandbox.clearedIntervals, [101]);
  assert.deepEqual(sandbox.clearedTimeouts, [202]);
  assert.equal(state.overviewAutoRefreshTimer, null);
  assert.equal(state.parentExamReleaseRefreshTimer, null);
  assert.equal(state.overviewAutoRefreshBusy, false);

  assert.equal(state.currentUser, null);
  assert.equal(state.currentProfile, null);
  assert.equal(state.profileRolesCache.length, 0);
  assert.equal(state.teacherRoleIdsCache.size, 0);
  assert.equal(state.studentsCache.length, 0);
  assert.equal(state.examsCache.length, 0);
  assert.equal(state.profilesCache.length, 0);
  assert.equal(state.scoresCache.length, 0);
  assert.equal(state.missingExclusionsCache.length, 0);
  assert.equal(state.guardianLinksCache.length, 0);
  assert.equal(state.studentSubjectsCache.length, 0);
  assert.equal(state.teacherProfilesCache.length, 0);
  assert.equal(state.teacherAssignmentsCache.length, 0);
  assert.equal(state.teacherStudentsCache.length, 0);
  assert.equal(state.teacherExamsCache.length, 0);
  assert.equal(state.teacherScoresCache.length, 0);
  assert.equal(state.teacherStudentSubjectsCache.length, 0);
  assert.equal(state.scoreEntryStudentsByClassSubject.size, 0);
  assert.equal(state.bulkEntryExistingScoresByStudent.size, 0);
  assert.equal(state.bulkEntryScoreContextKey, '');
  assert.equal(state.teacherSelectedExamId, '');
  assert.equal(state.teacherSelectedClassName, '');
  assert.equal(state.scoreEntrySavedCount, 0);
  assert.equal(state.adminDataLoadMetrics, null);
  assert.equal(state.activeTab, 'overview');
  assert.equal(state.attendanceSelectedDate, '');
  assert.equal(state.attendanceSelectedSession, null);
  assert.equal(state.attendanceLoadedStudents.length, 0);
  assert.equal(state.attendanceSavedSessionId, '');
  assert.equal(state.attendanceCalendarMonth, '');
  assert.equal(state.attendanceCalendarMarkedDates.size, 0);
  assert.equal(state.attendanceWeeklyOverviewWeek, '');
  assert.equal(state.attendanceWeeklyOverviewClass, '');
});

test('admin and overview requests discard results started under an earlier session', () => {
  assert.match(appSource, /let appSessionGeneration = 0;/);
  assert.match(authSource, /appSessionGeneration\+\+/);
  assert.match(authSource, /const sessionGeneration = appSessionGeneration;[\s\S]*?profileUserId = currentUser && currentUser\.id/);
  assert.match(authSource, /String\(currentUser\.id\) !== String\(profileUserId\)/);
  assert.match(adminDataSource, /const sessionGeneration = appSessionGeneration;/);
  assert.match(adminDataSource, /if \(sessionGeneration !== appSessionGeneration\) return;/);
  assert.match(overviewSource, /const sessionGeneration = appSessionGeneration;/);
  assert.match(overviewSource, /if \(sessionGeneration !== appSessionGeneration\) return false;/);
});

test('both manual logout and auth sign-out events use the shared cache reset', () => {
  assert.match(authSource, /async function handleLogout\(\)[\s\S]*?resetSessionStateAfterLogout\(\);/);
  assert.match(authSource, /if \(event === "SIGNED_OUT"\) \{\s*resetSessionStateAfterLogout\(\);/);
});

test('session guard accepts only the same active user and generation', () => {
  const start = appSource.indexOf('function isCurrentAppSession(');
  const end = appSource.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, 'current-session guard helper must exist');
  const helperSource = appSource.slice(start, end + 2);
  const sandbox = {
    appSessionGeneration: 12,
    currentUser: { id: 'user-a' }
  };
  vm.runInNewContext(helperSource + `
    globalThis.checks = {
      current: isCurrentAppSession(12, 'user-a'),
      staleGeneration: isCurrentAppSession(11, 'user-a'),
      switchedUser: isCurrentAppSession(12, 'user-b')
    };
    currentUser = null;
    globalThis.checks.signedOut = isCurrentAppSession(12, 'user-a');
  `, sandbox);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.checks)),
    { current: true, staleGeneration: false, switchedUser: false, signedOut: false }
  );
});
