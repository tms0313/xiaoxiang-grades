/* ==================================================
   小象文教機構｜成績管理系統
   完整 App.js

   管理員：admin
   家長：parent

   使用既有 Supabase 資料表：
   profiles
   login_events
   students
   exams
   scores
   guardian_students

   本版本：
   1. 成績總覽可修改既有成績
   2. 家長綁定可修改家長姓名及 Email
   3. 修改家長 Email 時同步更新 Auth 與 profiles
   4. 修改家長資料不影響密碼及學生綁定
   5. 管理頁修改／刪除按鈕縮小並排
   6. 考試管理只顯示開始日期及結束日期
   7. 考試名稱由系統依日期自動產生
   8. 家長綁定清單只保留班級篩選
   9. 國三成績新增「缺考」等級
   10. 缺考不需輸入分數或答對題數
   11. 國三數學低於 60 分以紅色粗體顯示
   12. 成績匯出改為考試週期勾選清單
   13. 家長登入後可自行修改密碼
   14. 家長新密碼至少 8 個字元
   15. 家長手機版成績改為直式卡片
   16. 電腦版家長成績維持原本表格
   ================================================== */

"use strict";

// ==================================================
// 0. Supabase 初始化
// ==================================================

if (typeof supabaseClient === "undefined") {
  document.body.innerHTML =
    "<h2 style='padding:30px'>系統錯誤：找不到 Supabase 設定，請檢查 config.js。</h2>";
  throw new Error("supabaseClient 未載入");
}

const db = supabaseClient;

const SUBJECTS = ["國文", "英文", "數學", "自然"];
const classOrder = ["國一班", "國二班", "國三班"];

const GRADE_OPTIONS = ["A++", "A+", "A", "B++", "B+", "B", "C", "缺考", "請假"];

let currentUser = null;
let currentProfile = null;
let profileRolesCache = [];
let teacherRoleIdsCache = new Set();
let studentsCache = [];
let examsCache = [];
let examsByIdCache = new Map();
let examsByDateDescCache = [];

function rebuildExamIndexes() {
  examsByIdCache = new Map(examsCache.map(exam => [String(exam.id), exam]));
  examsByDateDescCache = sortByDateDesc(examsCache, "start_date");
}
let profilesCache = [];
let studentsByIdCache = new Map();
let activeStudentsCache = [];
let explicitlyActiveStudentsCache = [];
let activeStudentsByClassCache = new Map();
let parentProfilesByIdCache = new Map();

function rebuildAdminEntityIndexes() {
  studentsByIdCache = new Map();
  activeStudentsCache = [];
  explicitlyActiveStudentsCache = [];
  activeStudentsByClassCache = new Map();
  studentsCache.forEach(function (student) {
    studentsByIdCache.set(String(student.id), student);
    if (student.is_active === true) explicitlyActiveStudentsCache.push(student);
    if (student.is_active === false) return;
    activeStudentsCache.push(student);
    const className = String(student.class_name || "");
    if (!activeStudentsByClassCache.has(className)) {
      activeStudentsByClassCache.set(className, []);
    }
    activeStudentsByClassCache.get(className).push(student);
  });
  parentProfilesByIdCache = new Map(profilesCache.map(profile => [String(profile.id), profile]));
}
let scoresCache = [];
let scoresByIdCache = new Map();
let scoresByStudentExamSubjectScopeCache = new Map();

function getScoreCompositeKey(studentId, examId, subject, scope) {
  return JSON.stringify([
    String(studentId),
    String(examId),
    String(subject || ""),
    String(scope || "").trim()
  ]);
}

function rebuildScoresByIdCache() {
  const nextIdIndex = new Map();
  const nextCompositeIndex = new Map();
  for (let index = 0; index < scoresCache.length; index += 1) {
    const score = scoresCache[index];
    nextIdIndex.set(String(score.id), score);
    nextCompositeIndex.set(
      getScoreCompositeKey(score.student_id, score.exam_id, score.subject, score.scope),
      score
    );
  }
  scoresByIdCache = nextIdIndex;
  scoresByStudentExamSubjectScopeCache = nextCompositeIndex;
}

function updateScoreCompositeIndex(score, previousKey) {
  if (previousKey && scoresByStudentExamSubjectScopeCache.get(previousKey) === score) {
    scoresByStudentExamSubjectScopeCache.delete(previousKey);
  }
  scoresByStudentExamSubjectScopeCache.set(
    getScoreCompositeKey(score.student_id, score.exam_id, score.subject, score.scope),
    score
  );
}

// 成績新增／刪除成功時，直接同步前端快取，避免為單筆異動重新下載全體成績與提醒排除資料。
function upsertScoreToLocalCache(score) {
  if (!score || score.id == null) return;
  const id = String(score.id);
  const previous = scoresByIdCache.get(id);
  if (previous) {
    const previousKey = getScoreCompositeKey(
      previous.student_id, previous.exam_id, previous.subject, previous.scope
    );
    if (scoresByStudentExamSubjectScopeCache.get(previousKey) === previous) {
      scoresByStudentExamSubjectScopeCache.delete(previousKey);
    }
    const index = scoresCache.indexOf(previous);
    if (index >= 0) scoresCache[index] = score;
    else scoresCache.push(score);
  } else {
    scoresCache.push(score);
  }
  scoresByIdCache.set(id, score);
  updateScoreCompositeIndex(score);
  invalidateAdminHighestPreviewCache();
}

function removeScoreFromLocalCache(scoreId) {
  const id = String(scoreId);
  const cachedScore = scoresByIdCache.get(id);
  if (!cachedScore) {
    scoresCache = scoresCache.filter(score => String(score.id) !== id);
    rebuildScoresByIdCache();
    invalidateAdminHighestPreviewCache();
    return;
  }

  const compositeKey = getScoreCompositeKey(
    cachedScore.student_id, cachedScore.exam_id, cachedScore.subject, cachedScore.scope
  );
  if (scoresByStudentExamSubjectScopeCache.get(compositeKey) === cachedScore) {
    scoresByStudentExamSubjectScopeCache.delete(compositeKey);
  }
  scoresByIdCache.delete(id);
  const cacheIndex = scoresCache.indexOf(cachedScore);
  if (cacheIndex >= 0) scoresCache.splice(cacheIndex, 1);
  invalidateAdminHighestPreviewCache();
}
let adminHighestPreviewCache = new Map();

function invalidateAdminHighestPreviewCache() {
  adminHighestPreviewCache.clear();
}
let missingExclusionsCache = [];
let guardianLinksCache = [];
let guardiansWithBindingsCache = new Set();
let guardianStudentBindingKeysCache = new Set();

function rebuildGuardianBindingIndexes() {
  guardiansWithBindingsCache = new Set();
  guardianStudentBindingKeysCache = new Set();
  guardianLinksCache.forEach(function (link) {
    guardiansWithBindingsCache.add(String(link.guardian_id));
    guardianStudentBindingKeysCache.add(
      JSON.stringify([String(link.guardian_id), String(link.student_id)])
    );
  });
}
let studentSubjectsCache = [];
let activeSubjectsByStudentCache = new Map();

function rebuildActiveSubjectsByStudentCache() {
  activeSubjectsByStudentCache = new Map();
  studentSubjectsCache.forEach(function (item) {
    if (item.is_active !== true) return;
    const studentId = String(item.student_id);
    if (!activeSubjectsByStudentCache.has(studentId)) activeSubjectsByStudentCache.set(studentId, []);
    activeSubjectsByStudentCache.get(studentId).push(item);
  });
}
let teacherProfilesCache = [];
let teacherProfilesByIdCache = new Map();
let teacherDashboardRequestId = 0;
let teacherAssignmentsCache = [];
let teacherStudentsCache = [];
let teacherExamsCache = [];
let teacherExamsByIdCache = new Map();
let teacherExamOptionsCache = "";
let teacherScoresCache = [];
let teacherStudentSubjectsCache = [];
let teacherPermittedSubjectsByClass = new Map();
let teacherStudentsByClassSubject = new Map();
let teacherScoresByStudentExamSubject = new Map();
const teacherStudentCodeCollator = new Intl.Collator("zh-Hant", { numeric: true });
const teacherStudentNameCollator = new Intl.Collator("zh-Hant");
let scoreEntryStudentsByClassSubject = new Map();
let bulkEntryExistingScoresByStudent = new Map();
let bulkEntryScoreContextKey = "";
let teacherSelectedExamId = "";
let teacherSelectedClassName = "";
let scoreEntrySavedCount = 0;
let activeTab = "overview";
let adminHighestPreviewExamId = "";
let adminHighestPreviewClassName = "";
let adminHighestPreviewSubject = "";
let overviewAutoRefreshTimer = null;
let overviewAutoRefreshBusy = false;
let adminDataLoadMetrics = null;

// ==================================================
// 1. 基本工具
// 共用工具函式已移至 app-utils.js，並由 index.html 預先載入。
// ==================================================

// ==================================================
// 2. 畫面樣式
// 樣式已移至 app-styles.js，並由 index.html 在 app.js 前載入。
// ==================================================

// ==================================================
// 3. 建立系統根畫面
// ==================================================

function createRoot() {
  const root = document.createElement("div");
  root.id = "appRoot";
  document.body.innerHTML = "";
  document.body.appendChild(root);
  return root;
}

const appRoot = createRoot();

function loginPage() {
  document.body.classList.remove("parent-page");
  appRoot.innerHTML =
    "<div class='login-wrap'>" +
      "<div class='login-card'>" +
        "<h1>小象文教機構</h1>" +
        " <p>成績查詢系統</p>" +
        "<div id='systemMessage' class='system-message'></div>" +
        "<form id='loginForm'>" +
          "<div class='field'><label for='email'>登入帳號</label>" +
            "<input id='email' type='text' placeholder='請輸入電子郵件／註冊手機號碼' autocomplete='username' required>" +
          "</div>" +
          "<div class='field'><label for='password'>登入密碼</label>" +
            "<input id='password' type='password' placeholder='請輸入密碼' autocomplete='current-password' required>" +
          "</div>" +
          "<button class='btn' type='submit' id='loginButton'>登入系統</button>" +
        "</form>" +
        "<div class='forgot-password'>" +
          "<strong>忘記密碼了嗎？</strong><br>" +
          "請聯絡小象文教機構管理員索取臨時密碼。<br>" +
          "管理員確認身分後，會透過 LINE 提供臨時密碼。<br>" +
          "登入後，請記得修改自己的密碼。" +
        "</div>" +
      "</div>" +
    "</div>" +
    "<div class='footer'>© 小象文教機構</div>";

  $("loginForm").addEventListener("submit", handleLogin);
}

// ==================================================
// 4. 登入、登出
// ==================================================

async function handleLogin(event) {
  event.preventDefault();

  const loginAccount = $("email").value.trim();
  const password = $("password").value;
  const button = $("loginButton");

  button.disabled = true;
  button.textContent = "登入中……";

  try {
    let loginCredentials;

    if (loginAccount.includes("@")) {
      // 原有 Email 帳號維持不變
      loginCredentials = {
        email: loginAccount.toLowerCase(),
        password
      };
    } else {
      // 將家長輸入的手機號碼轉成固定的內部登入 Email
      loginCredentials = {
        email: phoneLoginEmail(loginAccount),
        password
      };
    }

    const result = await db.auth.signInWithPassword(loginCredentials);
    if (result.error) throw result.error;

    currentUser = result.data.user;
    await loadCurrentProfile();

  } catch (error) {
    showMessage("登入失敗：" + error.message, "error");
    button.disabled = false;
    button.textContent = "登入系統";
  }
}

async function handleLogout() {
  try {
    await db.auth.signOut();
  } catch (error) {
    console.error("登出錯誤", error);
  }

  currentUser = null;
  currentProfile = null;
  profileRolesCache = [];
  teacherRoleIdsCache = new Set();
  studentsCache = [];
  examsCache = [];
  rebuildExamIndexes();
  profilesCache = [];
  rebuildAdminEntityIndexes();
  scoresCache = [];
  rebuildScoresByIdCache();
  invalidateAdminHighestPreviewCache();
  guardianLinksCache = [];
  rebuildGuardianBindingIndexes();

  loginPage();
}

async function loadCurrentProfile() {
  if (!currentUser) {
    loginPage();
    return;
  }

  const result = await db
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (result.error) {
    showMessage("讀取使用者資料失敗：" + result.error.message, "error");
    return;
  }

  if (!result.data) {
    await db.auth.signOut();
    loginPage();
    showMessage("找不到使用者資料，請聯絡管理員。", "error");
    return;
  }

  currentProfile = result.data;


  if (["teacher", "parent"].includes(currentProfile.role) && currentUser.app_metadata && currentUser.app_metadata.must_change_password === true) {
    renderFirstLoginPasswordChange();
    return;
  }

  if (!["admin", "parent", "teacher"].includes(currentProfile.role)) {
    await db.auth.signOut();
    loginPage();
    showMessage("此帳號沒有系統使用權限。", "error");
    return;
  }

  await recordSuccessfulLogin();
  await renderDashboard();
}

async function recordSuccessfulLogin() {
  try {
    const result = await db.from("login_events").insert({ user_id: currentUser.id });
    if (result.error) {
      console.warn("登入紀錄寫入失敗", result.error);
    }
  } catch (error) {
    console.warn("登入紀錄寫入失敗", error);
  }
}


// ==================================================
// 5. 重新讀取資料
// ==================================================

function hasLatestExamReachedReleaseTime(exam) {
  if (!exam || !exam.end_date) return false;

  const endDate = new Date(String(exam.end_date).slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(endDate.getTime())) return false;

  const daysUntilSaturday = (6 - endDate.getUTCDay() + 7) % 7;
  endDate.setUTCDate(endDate.getUTCDate() + daysUntilSaturday);

  const releaseDate = endDate.getUTCFullYear() + "-" +
    String(endDate.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(endDate.getUTCDate()).padStart(2, "0");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const now = {};
  parts.forEach(part => { now[part.type] = part.value; });
  const today = now.year + "-" + now.month + "-" + now.day;

  return today > releaseDate ||
    (today === releaseDate &&
      (Number(now.hour) > 18 ||
        (Number(now.hour) === 18 && Number(now.minute) >= 0)));
}

async function cleanupPreviousWeekExclusions() {
  // 管理資料載入時已建立日期排序索引；週期性檢查直接重用，避免重複排序。
  const datedExams = examsByDateDescCache.filter(exam => exam.start_date || exam.end_date);

  // 必須有本週與上一週兩筆考試，且本週成績已到週六 18:00 開放時間。
  if (datedExams.length < 2 || !hasLatestExamReachedReleaseTime(datedExams[0])) {
    return;
  }

  const previousExamId = datedExams[1].id;
  const previousExamKey = String(previousExamId);

  // 快取中沒有上一週的排除紀錄時，不必再送出空的 DELETE 請求。
  const hasPreviousWeekExclusions = missingExclusionsCache.some(
    item => String(item.exam_id) === previousExamKey
  );
  if (!hasPreviousWeekExclusions) return;

  const result = await db.from("score_missing_exclusions")
    .delete()
    .eq("exam_id", previousExamId);

  if (result.error) throw result.error;

  // 同步更新前端快取，避免本次畫面仍顯示已清除的名單。
  missingExclusionsCache = missingExclusionsCache.filter(
    item => String(item.exam_id) !== previousExamKey
  );
}

async function loadAdminData() {
  const adminLoadStartedAt = performance.now();
  const adminQueriesStartedAt = performance.now();
  const measureAdminQuery = async (name, queryFactory) => {
    const startedAt = performance.now();
    const result = await fetchAllRows(queryFactory);
    return { ...result, elapsedMs: performance.now() - startedAt, metricName: name };
  };
  // profiles 原本分別查詢家長、教師及全部帳號；合併為一次讀取，降低後台啟動時的重複請求。
  const results = await Promise.all([
    measureAdminQuery("學生資料", () => db.from("students").select("id, student_code, full_name, class_name, is_active").order("id", { ascending: true })),
    measureAdminQuery("考試資料", () => db.from("exams").select("id, title, start_date, end_date").order("id", { ascending: true })),
    measureAdminQuery("全部帳號", () => db.from("profiles").select("id, role, display_name, email, phone").order("id", { ascending: true })),
    measureAdminQuery("成績資料", () => db.from("scores").select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").order("id", { ascending: true })),
    measureAdminQuery("家長綁定資料", () => db.from("guardian_students").select("guardian_id, student_id").order("guardian_id", { ascending: true }).order("student_id", { ascending: true })),
    measureAdminQuery("學生修課資料", () => db.from("student_subjects").select("student_id, subject, is_active").order("student_id", { ascending: true }).order("subject", { ascending: true })),
    measureAdminQuery("教師授課權限", () => db.from("teacher_assignments").select("id, teacher_id, class_name, subject").order("id", { ascending: true })),
    measureAdminQuery("額外身分資料", () => db.from("profile_roles").select("user_id, role").eq("role", "teacher").order("user_id", { ascending: true })),
    measureAdminQuery("未登錄排除資料", () => db.from("score_missing_exclusions").select("id, exam_id, student_id, subject, scope").order("id", { ascending: true }))
  ]);
  const adminQueriesMs = performance.now() - adminQueriesStartedAt;

  const names = ["學生資料", "考試資料", "全部帳號", "成績資料", "家長綁定資料", "學生修課資料", "教師授課權限", "額外身分資料", "未登錄排除資料"];

  for (let i = 0; i < results.length; i++) {
    if (results[i].error) {
      throw new Error(names[i] + "讀取失敗：" + results[i].error.message);
    }
  }

  const allProfiles = results[2].data || [];
  studentsCache = results[0].data || [];
  examsCache = results[1].data || [];
  rebuildExamIndexes();
  scoresCache = results[3].data || [];
  rebuildScoresByIdCache();
  invalidateAdminHighestPreviewCache();
  guardianLinksCache = results[4].data || [];
  rebuildGuardianBindingIndexes();
  studentSubjectsCache = results[5].data || [];
  rebuildActiveSubjectsByStudentCache();
  teacherAssignmentsCache = results[6].data || [];
  profileRolesCache = results[7].data || [];
  teacherRoleIdsCache = new Set(profileRolesCache.filter(item => item.role === "teacher").map(item => String(item.user_id)));
  missingExclusionsCache = results[8].data || [];

  // 一次走訪帳號資料，同時建立家長清單與教師索引，避免重複 filter 全表。
  const additionalTeacherIds = new Set(profileRolesCache.map(item => String(item.user_id)));
  const parentProfiles = [];
  const teacherMap = new Map();
  allProfiles.forEach(profile => {
    const profileId = String(profile.id);
    if (profile.role === "parent") parentProfiles.push(profile);
    if (profile.role === "teacher") {
      teacherMap.set(profileId, {
        ...profile,
        isAdditionalTeacherRole: false
      });
    }
    if (additionalTeacherIds.has(profileId)) {
      teacherMap.set(profileId, {
        ...profile,
        isAdditionalTeacherRole: true
      });
    }
  });
  profilesCache = parentProfiles;
  rebuildAdminEntityIndexes();
  teacherProfilesCache = Array.from(teacherMap.values());
  teacherProfilesByIdCache = new Map(teacherProfilesCache.map(profile => [String(profile.id), profile]));

  // 新一週成績於週六 18:00 開放時，自動清除上一週的已排除提醒名單。
  try {
    await cleanupPreviousWeekExclusions();
  } catch (error) {
    console.error("清除上一週已排除提醒失敗：", error);
  }

  adminDataLoadMetrics = {
    queryMs: adminQueriesMs,
    totalMs: performance.now() - adminLoadStartedAt,
    students: studentsCache.length,
    exams: examsCache.length,
    scores: scoresCache.length,
    queryBreakdown: results.map(result => ({
      name: result.metricName,
      elapsedMs: result.elapsedMs,
      rows: (result.data || []).length
    }))
  };
}


/**
 * 成績總覽背景更新：只同步總覽會即時變動的資料，
 * 避免每 60 秒重新讀取整套管理員資料。
 */
function areRowsEqualByFields(previousRows, nextRows, fields) {
  if (previousRows === nextRows) return true;
  if (!Array.isArray(previousRows) || !Array.isArray(nextRows)) return false;
  if (previousRows.length !== nextRows.length) return false;

  for (let i = 0; i < previousRows.length; i++) {
    const previousRow = previousRows[i];
    const nextRow = nextRows[i];
    if (!previousRow || !nextRow) {
      if (previousRow !== nextRow) return false;
      continue;
    }
    for (let j = 0; j < fields.length; j++) {
      const field = fields[j];
      if (previousRow[field] !== nextRow[field]) return false;
    }
  }
  return true;
}

async function refreshOverviewData() {
  const results = await Promise.all([
    fetchAllRows(() => db.from("scores").select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").order("id", { ascending: true })),
    fetchAllRows(() => db.from("score_missing_exclusions").select("id, exam_id, student_id, subject, scope").order("id", { ascending: true }))
  ]);

  if (results[0].error) {
    throw new Error("成績資料讀取失敗：" + results[0].error.message);
  }
  if (results[1].error) {
    throw new Error("未登錄排除資料讀取失敗：" + results[1].error.message);
  }

  const nextScores = results[0].data || [];
  const nextExclusions = results[1].data || [];
  const previousExclusions = missingExclusionsCache;
  const scoresChanged = !areRowsEqualByFields(
    scoresCache,
    nextScores,
    ["id", "student_id", "exam_id", "subject", "scope", "score", "correct_count", "grade_level"]
  );
  const exclusionsChanged = !areRowsEqualByFields(
    previousExclusions,
    nextExclusions,
    ["id", "exam_id", "student_id", "subject", "scope"]
  );

  // 逐欄比較取代整份 JSON 序列化，減少每 60 秒輪詢時的字串配置與記憶體負擔。
  if (scoresChanged) {
    scoresCache = nextScores;
    rebuildScoresByIdCache();
    invalidateAdminHighestPreviewCache();
  }
  if (exclusionsChanged) {
    missingExclusionsCache = nextExclusions;
  }

  // 保留原有每週提醒名單清理規則；若清理了舊資料，也會觸發畫面更新。
  try {
    await cleanupPreviousWeekExclusions();
  } catch (error) {
    console.error("清除上一週已排除提醒失敗：", error);
  }

  return scoresChanged || exclusionsChanged ||
    !areRowsEqualByFields(
      previousExclusions,
      missingExclusionsCache,
      ["id", "exam_id", "student_id", "subject", "scope"]
    );
}

let dashboardRenderRequestId = 0;

async function renderDashboard() {
  // 每次重新進入任一角色頁面，都讓前一個角色頁面的載入請求失效。
  parentDashboardRequestId++;
  teacherDashboardRequestId++;
  const requestId = ++dashboardRenderRequestId;
  showLoading("正在載入系統資料……");

  try {
    if (currentProfile.role === "admin") {
      await loadAdminData();
      if (requestId !== dashboardRenderRequestId) return;
      renderAdminDashboard();
    } else if (currentProfile.role === "teacher") {
      await renderTeacherDashboard();
      if (requestId !== dashboardRenderRequestId) return;
    } else {
      await renderParentDashboard();
      if (requestId !== dashboardRenderRequestId) return;
    }
  } catch (error) {
    if (requestId !== dashboardRenderRequestId) return;
    appRoot.innerHTML =
      "<div class='dashboard'><h2>系統資料載入失敗</h2>" +
      "<p>" + escapeHtml(error.message) + "</p>" +
      "<button class='btn' id='reloadButton'>重新載入</button></div>";

    $("reloadButton").addEventListener("click", renderDashboard);
  } finally {
    if (requestId === dashboardRenderRequestId) hideLoading();
  }
}

// ==================================================
// 6. 管理員主畫面
// ==================================================

const ADMIN_TAB_KEYS = new Set([
  "overview", "reviews", "scores", "termScores",
  "students", "attendance", "guardians", "teachers",
  "alumni", "export", "logs"
]);

function getAdminTabFromHash() {
  const match = String(window.location.hash || "").match(/^#admin\/([^/]+)$/);
  if (match && match[1] === "passwords") return "guardians";
  return match && ADMIN_TAB_KEYS.has(match[1]) ? match[1] : "";
}

function handleAdminTabHashChange() {
  const nextTab = getAdminTabFromHash();
  if (!nextTab || nextTab === activeTab || !document.getElementById("adminTabs")) return;
  activeTab = nextTab;
  renderAdminTab();
}

function renderAdminDashboard() {
  appRoot.innerHTML =
    "<div class='topbar'>" +
      "<div><h1>小象文教機構｜成績管理系統</h1><small>管理員後台</small></div>" +
      "<div><button class='tab-btn logout-action' id='logoutButton'>登出</button></div>" +
    "</div>" +
    "<main class='dashboard'>" +
      "<div id='systemMessage' class='system-message'></div>" +
      "<div class='tabs' id='adminTabs'>" +
        "<a class='tab-btn' href='#admin/overview' data-tab='overview'>週成績總覽</a>" +
        "<a class='tab-btn' href='#admin/reviews' data-tab='reviews'>週考檢閱紀錄</a>" +
        "<a class='tab-btn' href='#admin/scores' data-tab='scores'>週成績登錄</a><a class='tab-btn' href='#admin/termScores' data-tab='termScores'>段考成績登錄</a>" +
        "<a class='tab-btn' href='#admin/students' data-tab='students'>學生管理</a>" +
        "<a class='tab-btn' href='#admin/attendance' data-tab='attendance'>出缺席管理</a>" +
        
        "<a class='tab-btn' href='#admin/guardians' data-tab='guardians'>家長帳號管理</a>" +
        "<a class='tab-btn' href='#admin/teachers' data-tab='teachers'>教師管理</a>" +
        "<a class='tab-btn' href='#admin/alumni' data-tab='alumni'>模考成績</a>" +
        "<a class='tab-btn' href='#admin/export' data-tab='export'>成績匯出</a>" +
        "<a class='tab-btn' href='#admin/logs' data-tab='logs'>登入紀錄</a>" +
      "</div>" +
      "<section id='adminContent'></section>" +
    "</main>" +
    "<div class='footer'>© 小象文教機構</div>";

  $("logoutButton").addEventListener("click", handleLogout);

  activeTab = getAdminTabFromHash() || "overview";
  window.removeEventListener("hashchange", handleAdminTabHashChange);
  window.addEventListener("hashchange", handleAdminTabHashChange);

  renderAdminTab();
}

function renderAdminTab() {
  if (activeTab !== "overview" && overviewAutoRefreshTimer) {
    clearInterval(overviewAutoRefreshTimer);
    overviewAutoRefreshTimer = null;
  }
  const systemMessage = $("systemMessage");
  const dashboard = document.querySelector(".dashboard");
  const adminTabs = $("adminTabs");
  if (systemMessage && dashboard && adminTabs) dashboard.insertBefore(systemMessage, adminTabs);
  if (systemMessage && activeTab === "overview") {
    systemMessage.style.display = "none";
  }

  // 僅更新管理員導覽列，避免掃描其他頁面的按鈕；每次切換只執行一個頁面渲染器。
  if (adminTabs) {
    adminTabs.querySelectorAll(".tab-btn").forEach(function (button) {
      button.classList.toggle("active", button.dataset.tab === activeTab);
    });
  }

  switch (activeTab) {
    case "overview":
      renderOverview();
      break;
    case "scores":
      renderScoreEntry();
      break;
    case "termScores":
      renderTermExamEntry();
      break;
    case "students":
      renderStudents();
      break;
    case "attendance":
      renderAttendanceManagement();
      break;
    case "guardians":
      renderGuardians();
      break;
    case "teachers":
      renderTeacherManagement();
      break;
    case "logs":
      renderLoginLogs();
      break;
    case "reviews":
      renderStudentReviewRecords();
      break;
    case "export":
      renderExport();
      break;
    case "alumni":
      renderAlumniMockScores();
      break;
  }
}

// ==================================================
// 管理員專用：班級最高分預覽
// 不受家長端週六 18:00 開放時間限制；不顯示其他學生個別成績。
// ==================================================

function renderAdminClassHighestPreview() {
  const content = $("adminContent");
  if (!content) return;

  // 考試索引已依日期排序；直接篩選並取前三筆，避免每次切換頁面重複排序。
  const latestThreeExams = examsByDateDescCache
    .filter(exam => exam.start_date || exam.end_date)
    .slice(0, 3);

  if (!latestThreeExams.length) {
    content.innerHTML =
      "<h2 class='section-title'>班級最高分預覽</h2>" +
      "<div class='empty'>目前沒有可預覽的考試週期。</div>";
    return;
  }

  const availableExamIds = latestThreeExams.map(exam => String(exam.id));
  if (!availableExamIds.includes(String(adminHighestPreviewExamId))) {
    adminHighestPreviewExamId = String(latestThreeExams[0].id);
  }

  const selectedExam = latestThreeExams.find(
    exam => String(exam.id) === String(adminHighestPreviewExamId)
  );

  const examOptions = latestThreeExams.map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");

  // 同一考試週期的最高分統計只計算一次；班級／科目篩選直接重用結果。
  const previewExamKey = String(selectedExam.id);
  let cachedPreview = adminHighestPreviewCache.get(previewExamKey);
  if (!cachedPreview) {
  // 重用管理員資料載入時建立的學生 ID 索引，避免每次切換考試重新建 Map。
  const studentMap = studentsByIdCache;
  const groups = new Map();

  scoresCache.forEach(function (score) {
    if (String(score.exam_id) !== String(selectedExam.id)) return;
    if (score.grade_level === "請假" || score.grade_level === "缺考") return;

    const student = studentMap.get(String(score.student_id));
    if (!student || !student.class_name) return;

    const grade3NonMath =
      isGrade3Class(student.class_name) && score.subject !== "數學";
    const rawValue = grade3NonMath ? score.correct_count : score.score;
    if (rawValue === null || rawValue === undefined || rawValue === "") return;

    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;

    const scope = String(score.scope || "");
    // 補考成績保留在學生個人成績中，但不參與班級最高分比序。
    if (scope.includes("補考")) return;
    const key = JSON.stringify([
      student.class_name,
      score.subject,
      scope
    ]);

    if (!groups.has(key)) {
      groups.set(key, {
        className: student.class_name,
        subject: score.subject,
        scope: scope,
        valueUnit: grade3NonMath ? "題" : "分",
        highestValue: value,
        highestGradeLevel: score.grade_level || null,
        highestStudentName: student.full_name || "未命名學生",
        validCount: 1
      });
      return;
    }

    const group = groups.get(key);
    group.validCount += 1;

    if (
      value > group.highestValue ||
      (
        value === group.highestValue &&
        String(score.grade_level || "").localeCompare(
          String(group.highestGradeLevel || "")
        ) < 0
      )
    ) {
      group.highestValue = value;
      group.highestGradeLevel = score.grade_level || null;
      group.highestStudentName = student.full_name || "未命名學生";
    }
  });

  const classOrder = ["國一班", "國二班", "國三班"];
  const rows = Array.from(groups.values()).sort(function (a, b) {
    const classDiff =
      classOrder.indexOf(a.className) - classOrder.indexOf(b.className);
    if (classDiff !== 0) {
      if (classOrder.includes(a.className) && classOrder.includes(b.className)) {
        return classDiff;
      }
      if (classOrder.includes(a.className)) return -1;
      if (classOrder.includes(b.className)) return 1;
      return a.className.localeCompare(b.className, "zh-Hant");
    }

    const subjectDiff =
      SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject);
    if (subjectDiff !== 0) return subjectDiff;
    return a.scope.localeCompare(b.scope, "zh-Hant");
  });
    cachedPreview = { rows: rows };
    adminHighestPreviewCache.set(previewExamKey, cachedPreview);
  }
  const rows = cachedPreview.rows;

  const availableClassNames = new Set(
    studentsCache.map(student => student.class_name).filter(Boolean)
  );
  const knownClassNames = new Set(classOrder);
  const classOptions = classOrder.filter(className => availableClassNames.has(className));
  const otherClassOptions = Array.from(availableClassNames)
    .filter(className => !knownClassNames.has(className))
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
  classOptions.push(...otherClassOptions);

  const filteredRows = rows.filter(function (item) {
    return (!adminHighestPreviewClassName || item.className === adminHighestPreviewClassName) &&
      (!adminHighestPreviewSubject || item.subject === adminHighestPreviewSubject);
  });

  const tableRows = filteredRows.map(function (item) {
    const isGrade3NonMath =
      item.valueUnit === "題";
    const highestText =
      escapeHtml(item.highestValue) + " " + item.valueUnit +
      (
        isGrade3NonMath && item.highestGradeLevel
          ? " " + gradeTag(item.highestGradeLevel)
          : ""
      );

    return "<tr>" +
      "<td>" + escapeHtml(item.className) + " " + escapeHtml(item.highestStudentName) + "</td>" +
      "<td>" + escapeHtml(item.subject) + "</td>" +
      "<td>" + escapeHtml(item.scope || "—") + "</td>" +
      "<td><strong>" + highestText + "</strong></td>" +
      "<td>" + escapeHtml(item.validCount) + " 筆</td>" +
    "</tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>班級最高分預覽</h2>" +
    "<p class='muted'>管理員測試功能：可提前查看計算結果，不受家長端週六 18:00 開放時間限制。此頁只顯示各班各科各範圍的最高成績，不列出其他學生的個別成績。</p>" +
    "<div class='toolbar'>" +
      "<label for='classHighestPreviewExam'><strong>考試週期</strong></label>" +
      "<select id='classHighestPreviewExam'>" + examOptions + "</select>" +
      "<label for='classHighestPreviewClass'><strong>班級</strong></label>" +
      "<select id='classHighestPreviewClass'><option value=''>全部班級</option>" +
        classOptions.map(className => "<option value='" + escapeHtml(className) + "'>" + escapeHtml(className) + "</option>").join("") +
      "</select>" +
      "<label for='classHighestPreviewSubject'><strong>科目</strong></label>" +
      "<select id='classHighestPreviewSubject'><option value=''>全部科目</option>" +
        SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") +
      "</select>" +
    "</div>" +
    "<div class='table-wrap'>" +
      "<table class='class-highest-preview-table'>" +
        "<thead><tr>" +
          "<th>班級／學生姓名</th><th>科目</th><th>範圍</th>" +
          "<th>班級最高</th><th>有效成績</th>" +
        "</tr></thead>" +
        "<tbody>" +
          (
            tableRows ||
            "<tr><td colspan='5' class='empty'>此考試週期目前沒有可計算的有效成績。</td></tr>"
          ) +
        "</tbody>" +
      "</table>" +
    "</div>";

  $("classHighestPreviewExam").value = adminHighestPreviewExamId;
  $("classHighestPreviewClass").value = adminHighestPreviewClassName;
  $("classHighestPreviewSubject").value = adminHighestPreviewSubject;

  $("classHighestPreviewExam").addEventListener("change", function () {
    adminHighestPreviewExamId = this.value;
    renderAdminClassHighestPreview();
  });
  $("classHighestPreviewClass").addEventListener("change", function () {
    adminHighestPreviewClassName = this.value;
    renderAdminClassHighestPreview();
  });
  $("classHighestPreviewSubject").addEventListener("change", function () {
    adminHighestPreviewSubject = this.value;
    renderAdminClassHighestPreview();
  });
}

// ==================================================
// 7. 成績總覽
// ==================================================

function renderOverview(preservedFilters, keepExcludedPanelOpen) {
  const content = $("adminContent");

  // 本次畫面渲染共用索引，避免每一筆成績列都重新掃描學生與考試快取。
  const studentById = studentsByIdCache;
  const examById = examsByIdCache;

  function getStudent(id) {
    return studentById.get(String(id));
  }

  function getExam(id) {
    return examById.get(String(id));
  }

  function buildOverviewRow(score, showExamRange) {
    const student = getStudent(score.student_id);
    const exam = getExam(score.exam_id);
    if (!student || !exam) return "";

    const grade3 = isGrade3Class(student.class_name);
    const grade3Math = isGrade3Math(student.class_name, score.subject);

    const resultText = score.grade_level === "請假"
      ? "<span class='grade-tag grade-leave overview-status-button overview-status-leave'>請假</span>"
      : grade3Math
      ? (
          score.grade_level === "缺考"
            ? gradeTag("缺考")
            : "<span class='" +
              scoreClass(score.score, student.class_name, score.subject) +
              "'>" +
              escapeHtml(score.score == null ? "—" : score.score) +
              " 分</span>　" +
              gradeTag(score.grade_level)
        )
      : grade3
        ? (
            score.grade_level === "缺考"
              ? gradeTag("缺考")
              : escapeHtml(score.correct_count == null ? "—" : score.correct_count) +
                " 題　" + gradeTag(score.grade_level)
          )
        : "<span class='" + scoreClass(score.score, student.class_name, score.subject) + "'>" +
          escapeHtml(score.score == null ? "—" : score.score) + "</span>";

    return (
      "<tr>" +
        "<td>" + (showExamRange ? escapeHtml(formatDateRange(exam)) : "") + "</td>" +
        "<td>" + escapeHtml(student.class_name) + "</td>" +
        "<td>" + escapeHtml(student.student_code) + "</td>" +
        "<td>" + escapeHtml(student.full_name) + "</td>" +
        "<td>" + escapeHtml(score.subject) + "</td>" +
        "<td>" + escapeHtml(score.scope || "—") + "</td>" +
        "<td>" + resultText + "</td>" +
        "<td class='action-cell'>" +
          "<div class='action-buttons'>" +
            "<button class='btn btn-small' data-edit-score='" + escapeHtml(score.id) + "'>修改</button>" +
            "<button class='btn btn-danger btn-small' data-delete-score='" + escapeHtml(score.id) + "'>刪除</button>" +
          "</div>" +
        "</td>" +
      "</tr>"
    );
  }

  const selectedMissingItems = new Map();
  const overviewPageSize = 100;
  const overviewClassCollator = new Intl.Collator("zh-Hant");
  const overviewCodeCollator = new Intl.Collator(undefined, { numeric: true });
  let overviewCurrentPage = 0;
  let overviewFilteredRows = [];
  let overviewSearchTimer = null;
  let lastOverviewFilterSignature = null;

  function missingSelectionKey(examId, studentId, subject, scope) {
    return JSON.stringify([String(examId), String(studentId), String(subject), String(scope || "")]);
  }

  function buildMissingOverviewRow(student, exam, subject, scope, showExamRange) {
    const selectionKey = missingSelectionKey(exam.id, student.id, subject, scope);
    const selectedAttribute = selectedMissingItems.has(selectionKey) ? " checked" : "";
    return (
      "<tr class='overview-missing-row'>" +
        "<td>" + (showExamRange ? escapeHtml(formatDateRange(exam)) : "") + "</td>" +
        "<td>" + escapeHtml(student.class_name) + "</td>" +
        "<td>" + escapeHtml(student.student_code) + "</td>" +
        "<td>" + escapeHtml(student.full_name) + "</td>" +
        "<td>" + escapeHtml(subject) + "</td>" +
        "<td>" + escapeHtml(scope || "—") + "</td>" +
        "<td><span class='grade-tag overview-status-button overview-status-missing'>未登錄</span></td>" +
        "<td class='action-cell'><div class='action-buttons'>" +
          "<label class='overview-missing-select'><input type='checkbox' data-select-missing='1' data-exam-id='" + escapeHtml(exam.id) +
          "' data-student-id='" + escapeHtml(student.id) + "' data-subject='" + escapeHtml(subject) +
          "' data-scope='" + escapeHtml(scope || "") + "' data-selection-key='" + escapeHtml(selectionKey) + "'" +
          selectedAttribute + ">選取此筆</label>" +
          "<button class='btn btn-small overview-edit-missing-btn' data-edit-missing='1' data-exam-id='" + escapeHtml(exam.id) +
          "' data-student-id='" + escapeHtml(student.id) + "' data-subject='" + escapeHtml(subject) +
          "' data-scope='" + escapeHtml(scope || "") + "'>修改</button>" +
          "<button class='btn btn-danger btn-small overview-exclude-reminder-btn' data-exclude-missing='1' data-exam-id='" + escapeHtml(exam.id) +
          "' data-student-id='" + escapeHtml(student.id) + "' data-subject='" + escapeHtml(subject) +
          "' data-scope='" + escapeHtml(scope || "") + "'>排除提醒</button>" +
        "</div></td>" +
      "</tr>"
    );
  }

  function buildExcludedReminderRows() {
    return missingExclusionsCache.map(function (item) {
      const student = getStudent(item.student_id);
      const exam = getExam(item.exam_id);
      if (!student || !exam) return "";
      return "<tr>" +
        "<td>" + escapeHtml(formatDateRange(exam)) + "</td>" +
        "<td>" + escapeHtml(student.class_name) + "</td>" +
        "<td>" + escapeHtml(student.student_code) + "</td>" +
        "<td>" + escapeHtml(student.full_name) + "</td>" +
        "<td>" + escapeHtml(item.subject) + "</td>" +
        "<td>" + escapeHtml(item.scope || "—") + "</td>" +
        "<td><button class='btn btn-success btn-small' data-restore-missing='" + escapeHtml(item.id) + "'>恢復提醒</button></td>" +
      "</tr>";
    }).filter(Boolean).join("");
  }

  const examOptions = examsByDateDescCache.map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>週成績總覽</h2>" +
    "<div class='toolbar'>" +
      "<input id='overviewSearch' placeholder='搜尋學生姓名或編號'>" +
      "<select id='overviewExam'><option value=''>全部考試週期</option>" + examOptions + "</select>" +
      "<select id='overviewClass'><option value=''>全部班級</option>" +
        "<option>國一班</option><option>國二班</option><option>國三班</option>" +
      "</select>" +
      "<select id='overviewSubject'><option value=''>全部科目</option>" +
        SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") +
      "</select>" +
      "<div style='display:flex;align-items:center;gap:10px;flex-wrap:nowrap'>" +
        "<select id='overviewStatus' aria-label='成績狀態篩選' style='height:40px;min-height:40px;box-sizing:border-box;align-self:center'>" +
          "<option value='all'>全部狀態</option><option value='low'>低於 60 分</option><option value='leave'>請假</option><option value='absent'>缺考</option><option value='missing'>未登錄</option>" +
        "</select>" +
        "<select id='toggleExcludedReminders' aria-label='已排除提醒' style='height:40px;min-height:40px;box-sizing:border-box;align-self:center;min-width:150px'>" +
          "<option value='closed'>已排除提醒（" + missingExclusionsCache.length + "）</option>" +
          "<option value='open'>查看已排除提醒</option>" +
        "</select>" +
      "</div>" +
      "<span class='muted' style='font-size: 14px;white-space:nowrap'>每 60 秒自動更新</span>" +
    "</div>" +
    "<p id='overviewFilterHint' class='muted' style='margin:0 0 10px'>選擇考試週期及科目後，系統會依已登錄的科目範圍比對同班修課學生。</p>" +
    "<div class='toolbar' id='overviewMissingBatchBar' style='margin:0 0 12px;gap:8px'>" +
      "<button class='btn btn-secondary btn-small' type='button' id='selectAllMissingButton'>選取目前顯示的未登錄項目</button>" +
      "<button class='btn btn-secondary btn-small' type='button' id='clearMissingSelectionButton'>取消所有勾選</button>" +
      "<button class='btn btn-danger btn-small' type='button' id='batchExcludeMissingButton' disabled>排除已選取提醒（0）</button>" +
      "<span class='muted' style='font-size: 14px'>排除後只會從未登錄清單隱藏；不會刪除成績，且可隨時恢復提醒。</span>" +
    "</div>" +
    "<div id='excludedRemindersPanel' class='panel' style='display:none;margin-top:18px'>" +
      "<h3>已排除的未登錄提醒</h3>" +
      "<p class='muted'>這裡只管理已排除的提醒；按下「恢復提醒」後，該筆資料會重新列入未登錄清單。</p>" +
      "<div class='table-wrap'><table class='excluded-reminders-table'><thead><tr><th>考試區間</th><th>班級</th><th>編號</th><th>姓名</th><th>科目</th><th>考試範圍</th><th>操作</th></tr></thead>" +
      "<tbody id='excludedReminderRows'>" + (buildExcludedReminderRows() || "<tr><td colspan='7' class='empty'>目前沒有已排除的提醒</td></tr>") + "</tbody></table></div>" +
    "</div>" +
    "<div class='table-wrap'><table class='overview-table'>" +
      "<thead><tr><th>考試區間</th><th>班級</th><th>編號</th><th>姓名</th><th>科目</th><th>考試範圍</th><th>成績／狀態</th><th>操作</th></tr></thead>" +
      "<tbody id='overviewRows'><tr><td colspan='8' class='empty'>資料載入中……</td></tr></tbody>" +
    "</table></div>" +
    "<div id='overviewPagination' class='toolbar' style='justify-content:center;align-items:center;gap:12px;margin-top:12px'>" +
      "<button class='btn btn-secondary btn-small' type='button' id='overviewPrevPage'>上一頁</button>" +
      "<span id='overviewPageInfo' class='muted' style='font-size: 14px'>第 1 頁</span>" +
      "<button class='btn btn-secondary btn-small' type='button' id='overviewNextPage'>下一頁</button>" +
    "</div>";

  // 每次畫面重繪時建立一次索引；搜尋、篩選操作直接重用。
  const overviewIndexBuildStartedAt = performance.now();
  const keyOf = (...parts) => parts.map(value => String(value == null ? "" : value).trim()).join("\u001f");
  const scoreKeys = new Set();
  const registeredGroupsByExam = new Map();
  const scoresByExam = new Map();
  const scoresByClass = new Map();
  const scoresBySubject = new Map();
  const studentSearchIndex = new Map();

  studentsCache.forEach(function (student) {
    studentSearchIndex.set(String(student.id), (
      String(student.full_name || "") + "\u001f" +
      String(student.student_code || "")
    ).toLowerCase());
  });

  function addToIndex(index, key, value) {
    const normalizedKey = String(key == null ? "" : key);
    if (!index.has(normalizedKey)) index.set(normalizedKey, []);
    index.get(normalizedKey).push(value);
  }

  scoresCache.forEach(function (score) {
    const student = studentById.get(String(score.student_id));
    if (!student) return;
    addToIndex(scoresByExam, score.exam_id, score);
    addToIndex(scoresByClass, student.class_name, score);
    addToIndex(scoresBySubject, score.subject, score);
    const normalizedScope = String(score.scope || "").trim();
    scoreKeys.add(keyOf(score.exam_id, score.student_id, score.subject, normalizedScope));
    if (score.grade_level === "請假" || !normalizedScope) return;
    const groupKey = keyOf(score.exam_id, student.class_name, score.subject);
    const examKey = String(score.exam_id);
    if (!registeredGroupsByExam.has(examKey)) registeredGroupsByExam.set(examKey, new Map());
    const examGroups = registeredGroupsByExam.get(examKey);
    let registeredGroup = examGroups.get(groupKey);
    if (!registeredGroup) {
      registeredGroup = {
        className: student.class_name,
        subject: score.subject,
        scopes: new Set()
      };
      examGroups.set(groupKey, registeredGroup);
    }
    registeredGroup.scopes.add(normalizedScope);
  });

  const exclusionKeys = new Set(missingExclusionsCache.map(item =>
    keyOf(item.exam_id, item.student_id, item.subject, item.scope || "")
  ));
  const enrolledStudentsByClassSubject = new Map();
  studentSubjectsCache.forEach(function (item) {
    if (item.is_active !== true) return;
    const student = studentById.get(String(item.student_id));
    if (!student || student.is_active === false) return;
    const groupKey = keyOf(student.class_name, item.subject);
    if (!enrolledStudentsByClassSubject.has(groupKey)) {
      enrolledStudentsByClassSubject.set(groupKey, {
        ids: new Set(),
        students: [],
        className: student.class_name,
        subject: item.subject
      });
    }
    const group = enrolledStudentsByClassSubject.get(groupKey);
    const studentId = String(student.id);
    if (group.ids.has(studentId)) return;
    group.ids.add(studentId);
    group.students.push(student);
  });
  // 考試日期排序不隨搜尋條件改變，在本次畫面生命週期只計算一次。
  const overviewExamsByDateDesc = examsByDateDescCache;
  const overviewIndexBuildMs = performance.now() - overviewIndexBuildStartedAt;
  const overviewPerf = {
    indexBuildMs: overviewIndexBuildMs,
    latestFilter: null,
    latestRenderMs: 0,
    pageSize: overviewPageSize,
    students: studentsCache.length,
    exams: examsCache.length,
    scores: scoresCache.length,
    enrolledGroups: enrolledStudentsByClassSubject.size
  };

  function buildOverviewPerfReport() {
    const f = overviewPerf.latestFilter || {};
    return [
      "小象成績總覽效能紀錄",
      "管理員資料載入：" + (adminDataLoadMetrics ? adminDataLoadMetrics.totalMs.toFixed(2) + " ms（Supabase 查詢 " + adminDataLoadMetrics.queryMs.toFixed(2) + " ms）" : "尚無資料"),
      ...(adminDataLoadMetrics && adminDataLoadMetrics.queryBreakdown
        ? adminDataLoadMetrics.queryBreakdown
            .slice()
            .sort((a, b) => b.elapsedMs - a.elapsedMs)
            .map(item => "資料表 " + item.name + "：" + item.elapsedMs.toFixed(2) + " ms／" + item.rows + " 筆")
        : []),
      "索引建立：" + overviewPerf.indexBuildMs.toFixed(2) + " ms",
      "資料量：學生 " + overviewPerf.students + "、考試 " + overviewPerf.exams + "、成績 " + overviewPerf.scores,
      "修課群組：" + overviewPerf.enrolledGroups,
      "最近一次篩選：候選成績 " + (f.scoreCandidates || 0) + " 筆；成績比對 " + (f.scoreScanMs || 0).toFixed(2) + " ms",
      "未登錄比對：" + (f.missingCompareMs || 0).toFixed(2) + " ms；檢查考試 " + (f.examsChecked || 0) + " 場；實際登錄群組 " + (f.registeredGroupsChecked || 0) + " 組；符合修課群組 " + (f.matchedEnrolledGroups || 0) + " 組",
      "狀態篩選：" + (f.statusFilterMs || 0).toFixed(2) + " ms；排序：" + (f.sortMs || 0).toFixed(2) + " ms",
      "篩選總耗時：" + (f.totalMs || 0).toFixed(2) + " ms；未登錄 " + (f.missingCount || 0) + " 筆；篩選結果 " + (f.finalRows || 0) + " 筆",
      "最近一次頁面渲染：" + overviewPerf.latestRenderMs.toFixed(2) + " ms；實際渲染 " + (f.renderedRows || 0) + " 筆；每頁 " + overviewPerf.pageSize + " 筆"
    ].join("\n");
  }

  function updateOverviewPerfPanel() {
    const summary = $("overviewPerfSummary");
    if (summary) summary.textContent = buildOverviewPerfReport();
  }

  function renderOverviewPage() {
    const renderStartedAt = performance.now();
    const totalRows = overviewFilteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / overviewPageSize));
    overviewCurrentPage = Math.min(Math.max(overviewCurrentPage, 0), totalPages - 1);
    const startIndex = overviewCurrentPage * overviewPageSize;
    const pageRows = overviewFilteredRows.slice(startIndex, startIndex + overviewPageSize);
    const renderedExamIds = new Set();

    $("overviewRows").innerHTML =
      pageRows.map(function (item) {
        const currentExamId = String(item.exam && item.exam.id || "");
        const showExamRange = !renderedExamIds.has(currentExamId);
        renderedExamIds.add(currentExamId);
        return item.missing
          ? buildMissingOverviewRow(item.student, item.exam, item.subject, item.scope, showExamRange)
          : buildOverviewRow(item.score, showExamRange);
      }).join("") ||
      ($("overviewStatus").value === "missing"
        ? "<tr><td colspan='8' class='empty'>目前篩選條件下沒有待登錄提醒</td></tr>"
        : "<tr><td colspan='8' class='empty'>沒有符合的成績資料</td></tr>");

    const pageInfo = $("overviewPageInfo");
    const prevButton = $("overviewPrevPage");
    const nextButton = $("overviewNextPage");
    if (pageInfo) {
      pageInfo.textContent = totalRows
        ? "第 " + (overviewCurrentPage + 1) + " / " + totalPages + " 頁，共 " + totalRows + " 筆（每頁 " + overviewPageSize + " 筆）"
        : "共 0 筆資料";
    }
    if (prevButton) prevButton.disabled = overviewCurrentPage === 0 || totalRows === 0;
    if (nextButton) nextButton.disabled = overviewCurrentPage >= totalPages - 1 || totalRows === 0;
    updateMissingSelectionCount();
    overviewPerf.latestRenderMs = performance.now() - renderStartedAt;
    if (overviewPerf.latestFilter) overviewPerf.latestFilter.renderedRows = pageRows.length;
    updateOverviewPerfPanel();
  }

  // 搜尋學生集合只依搜尋文字與班級變化；切換考試、科目或狀態時沿用快取。
  let matchedStudentCacheSignature = null;
  let matchedStudentIdsCache = new Set();

  function filterRows() {
    const filterStartedAt = performance.now();
    const search = $("overviewSearch").value.trim().toLowerCase();
    const examId = $("overviewExam").value;
    const className = $("overviewClass").value;
    const subject = $("overviewSubject").value;
    const status = $("overviewStatus").value;
    const filterSignature = JSON.stringify([search, examId, className, subject, status]);
    if (filterSignature === lastOverviewFilterSignature) return;
    lastOverviewFilterSignature = filterSignature;
    overviewCurrentPage = 0;
    // 只有篩選條件真的改變才清除舊條件的勾選。
    selectedMissingItems.clear();

    // 只有搜尋文字或班級改變時才重建符合學生集合；考試、科目、狀態篩選共用此集合。
    const matchedStudentCacheKey = JSON.stringify([search, className]);
    if (matchedStudentCacheKey !== matchedStudentCacheSignature) {
      matchedStudentIdsCache = new Set();
      studentsCache.forEach(function (student) {
        if (!student || (className && student.class_name !== className)) return;
        if (search && !(studentSearchIndex.get(String(student.id)) || "").includes(search)) return;
        matchedStudentIdsCache.add(String(student.id));
      });
      matchedStudentCacheSignature = matchedStudentCacheKey;
    }
    const matchedStudentIds = matchedStudentIdsCache;

    // 依目前篩選條件選擇資料量最小的索引作為候選集，避免每次輸入都掃描全部成績。
    let scoreCandidates = scoresCache;
    if (examId) scoreCandidates = scoresByExam.get(String(examId)) || [];
    if (className) {
      const classCandidates = scoresByClass.get(className) || [];
      if (classCandidates.length < scoreCandidates.length) scoreCandidates = classCandidates;
    }
    if (subject) {
      const subjectCandidates = scoresBySubject.get(subject) || [];
      if (subjectCandidates.length < scoreCandidates.length) scoreCandidates = subjectCandidates;
    }

    const scoreScanStartedAt = performance.now();
    let rows = [];
    scoreCandidates.forEach(function (score) {
      if (examId && String(score.exam_id) !== String(examId)) return;
      if (subject && score.subject !== subject) return;
      const studentId = String(score.student_id);
      if (!matchedStudentIds.has(studentId)) return;
      const student = studentById.get(studentId);
      if (!student) return;
      const exam = getExam(score.exam_id);
      if (exam) rows.push({ score: score, student: student, exam: exam });
    });

    const scoreScanMs = performance.now() - scoreScanStartedAt;
    // 只走該考試實際有登錄過的班級／科目組合，不再掃描所有班級與科目的笛卡兒組合。
    const missingCompareStartedAt = performance.now();
    const examsToCheck = examId
      ? [getExam(examId)].filter(Boolean)
      : overviewExamsByDateDesc;
    // 只在實際遇到已登錄的班級／科目組合時，才篩選該組修課學生；
    // 同一組合跨多場考試時共用結果，避免每次搜尋掃描全部修課群組。
    const matchingEnrolledStudentsByClassSubject = new Map();
    let matchedEnrolledGroupCount = 0;

    let registeredGroupsCheckedCount = 0;
    examsToCheck.forEach(function (selectedExam) {
      const currentExamId = String(selectedExam.id);
      const examGroups = registeredGroupsByExam.get(currentExamId);
      if (!examGroups) return;
      registeredGroupsCheckedCount += examGroups.size;

      examGroups.forEach(function (registeredGroup) {
        const targetClass = registeredGroup.className;
        const targetSubject = registeredGroup.subject;
        if (className && targetClass !== className) return;
        if (subject && targetSubject !== subject) return;

        const enrollmentKey = keyOf(targetClass, targetSubject);
        if (!matchingEnrolledStudentsByClassSubject.has(enrollmentKey)) {
          const enrollmentGroup = enrolledStudentsByClassSubject.get(enrollmentKey);
          const matchedStudents = enrollmentGroup
            ? enrollmentGroup.students.filter(student => matchedStudentIds.has(String(student.id)))
            : [];
          matchingEnrolledStudentsByClassSubject.set(enrollmentKey, matchedStudents);
          if (matchedStudents.length) matchedEnrolledGroupCount += 1;
        }
        const enrolledStudents = matchingEnrolledStudentsByClassSubject.get(enrollmentKey);
        if (!enrolledStudents || !enrolledStudents.length) return;

        registeredGroup.scopes.forEach(function (scope) {
          enrolledStudents.forEach(function (student) {
            const recordKey = keyOf(currentExamId, student.id, targetSubject, scope);
            if (!scoreKeys.has(recordKey) && !exclusionKeys.has(recordKey)) {
              rows.push({
                missing: true,
                student: student,
                exam: selectedExam,
                subject: targetSubject,
                scope: scope
              });
            }
          });
        });
      });
    });

        const missingCompareMs = performance.now() - missingCompareStartedAt;
    const rowsBeforeStatus = rows.length;
    const statusFilterStartedAt = performance.now();
    let missingCount = 0;
    const sortableRows = [];

    // 同一輪遍歷同時計算未登錄數量、狀態篩選及排序欄位，避免建立中間 filteredRows 陣列。
    rows.forEach(function (item) {
      if (item.missing) missingCount += 1;
      let include = true;
      if (status === "missing") include = !!item.missing;
      else if (status !== "all") {
        if (item.missing || !item.score) include = false;
        else if (status === "leave") include = item.score.grade_level === "請假";
        else if (status === "absent") include = item.score.grade_level === "缺考";
        else if (status === "low") {
          include = item.score.grade_level !== "請假" && item.score.grade_level !== "缺考" &&
            scoreClass(item.score.score, item.student.class_name, item.score.subject) === "low-score";
        }
      }
      if (!include) return;
      sortableRows.push({
        item: item,
        date: String((item.exam && (item.exam.end_date || item.exam.start_date)) || ""),
        examId: String(item.exam && item.exam.id || ""),
        className: String(item.student.class_name || ""),
        missing: !!item.missing,
        studentCode: String(item.student.student_code || ""),
        scope: String(item.scope || (item.score && item.score.scope) || "")
      });
    });

    const statusFilterMs = performance.now() - statusFilterStartedAt;

    // 排序欄位已在前一輪遍歷建立，排序比較器不再反覆讀取物件或轉換字串。
    const sortStartedAt = performance.now();

    sortableRows.sort(function (a, b) {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const examCompare = a.examId.localeCompare(b.examId);
      if (examCompare !== 0) return examCompare;
      const classCompare = overviewClassCollator.compare(a.className, b.className);
      if (classCompare !== 0) return classCompare;
      if (a.missing !== b.missing) return a.missing ? 1 : -1;
      const codeCompare = overviewCodeCollator.compare(a.studentCode, b.studentCode);
      if (codeCompare !== 0) return codeCompare;
      return overviewClassCollator.compare(a.scope, b.scope);
    });
    const sortedRows = sortableRows.map(entry => entry.item);
    const sortMs = performance.now() - sortStartedAt;

    const hint = $("overviewFilterHint");
    if (hint) {
      const filterDescription = (examId ? formatDateRange(getExam(examId)) : "全部考試週期") +
        "／" + (className || "全部班級") + "／" + (subject || "全部科目");
      hint.textContent =
        "目前條件：" + filterDescription +
        "；符合條件的未登錄提醒共 " + missingCount + " 筆。" +
        "只比對同一考試、班級及科目已有學生登錄的考試範圍；已標記請假的學生不列入。";
    }

    overviewFilteredRows = sortedRows;
    overviewPerf.latestFilter = {
      scoreCandidates: scoreCandidates.length,
      scoreScanMs: scoreScanMs,
      missingCompareMs: missingCompareMs,
      examsChecked: examsToCheck.length,
      registeredGroupsChecked: registeredGroupsCheckedCount,
      matchedEnrolledGroups: matchedEnrolledGroupCount,
      statusFilterMs: statusFilterMs,
      sortMs: sortMs,
      totalMs: performance.now() - filterStartedAt,
      missingCount: missingCount,
      rowsBeforeStatus: rowsBeforeStatus,
      finalRows: sortedRows.length,
      renderedRows: 0
    };
    renderOverviewPage();
    overviewPerf.latestFilter.totalMs = performance.now() - filterStartedAt;
    updateOverviewPerfPanel();
  }

  if (preservedFilters) {
    $("overviewSearch").value = preservedFilters.search || "";
    $("overviewExam").value = preservedFilters.examId || "";
    $("overviewClass").value = preservedFilters.className || "";
    $("overviewSubject").value = preservedFilters.subject || "";
    $("overviewStatus").value = preservedFilters.status || "all";
  }

  $("overviewSearch").addEventListener("input", function () {
    if (overviewSearchTimer) clearTimeout(overviewSearchTimer);
    overviewSearchTimer = setTimeout(function () {
      overviewSearchTimer = null;
      filterRows();
    }, 180);
  });
  $("overviewExam").addEventListener("change", filterRows);
  $("overviewClass").addEventListener("change", filterRows);
  $("overviewSubject").addEventListener("change", filterRows);
  $("overviewStatus").addEventListener("change", filterRows);

  function updateMissingSelectionCount() {
    const button = $("batchExcludeMissingButton");
    if (button) {
      button.textContent = "排除已選取提醒（" + selectedMissingItems.size + "）";
      button.disabled = selectedMissingItems.size === 0;
    }
  }

  $("overviewPrevPage").addEventListener("click", function () {
    if (overviewCurrentPage <= 0) return;
    overviewCurrentPage--;
    renderOverviewPage();
  });
  $("overviewNextPage").addEventListener("click", function () {
    const totalPages = Math.ceil(overviewFilteredRows.length / overviewPageSize);
    if (overviewCurrentPage >= totalPages - 1) return;
    overviewCurrentPage++;
    renderOverviewPage();
  });
  $("selectAllMissingButton").addEventListener("click", function () {
    const startIndex = overviewCurrentPage * overviewPageSize;
    overviewFilteredRows.slice(startIndex, startIndex + overviewPageSize).forEach(function (item) {
      if (!item.missing) return;
      const selectionKey = missingSelectionKey(item.exam.id, item.student.id, item.subject, item.scope);
      selectedMissingItems.set(selectionKey, {
        examId: item.exam.id,
        studentId: item.student.id,
        subject: item.subject,
        scope: item.scope || ""
      });
    });
    renderOverviewPage();
  });
  $("clearMissingSelectionButton").addEventListener("click", function () {
    selectedMissingItems.clear();
    renderOverviewPage();
  });
  content.onchange = function (event) {
    if (!event.target.matches("[data-select-missing]")) return;
    const box = event.target;
    const selectionKey = box.dataset.selectionKey;
    if (box.checked) {
      selectedMissingItems.set(selectionKey, {
        examId: box.dataset.examId,
        studentId: box.dataset.studentId,
        subject: box.dataset.subject,
        scope: box.dataset.scope || ""
      });
    } else {
      selectedMissingItems.delete(selectionKey);
    }
    updateMissingSelectionCount();
  };
  $("batchExcludeMissingButton").addEventListener("click", async function () {
    const items = Array.from(selectedMissingItems.values());
    if (!items.length) return;
    await excludeMissingRemindersBatch(items);
  });

  $("toggleExcludedReminders").addEventListener("change", function () {
    const panel = $("excludedRemindersPanel");
    if (!panel) return;
    const opening = this.value === "open";
    panel.style.display = opening ? "block" : "none";
    this.value = opening ? "open" : "closed";
  });

  if (keepExcludedPanelOpen) {
    const excludedPanel = $("excludedRemindersPanel");
    const toggleButton = $("toggleExcludedReminders");
    if (excludedPanel) excludedPanel.style.display = "block";
    if (toggleButton) toggleButton.value = "open";
  }

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-score]");
    const editMissingButton = event.target.closest("[data-edit-missing]");
    const deleteButton = event.target.closest("[data-delete-score]");
    const excludeButton = event.target.closest("[data-exclude-missing]");
    const restoreButton = event.target.closest("[data-restore-missing]");

    if (editButton) await editScore(editButton.dataset.editScore);
    if (editMissingButton) {
      await editScore(null, {
        examId: editMissingButton.dataset.examId,
        studentId: editMissingButton.dataset.studentId,
        subject: editMissingButton.dataset.subject,
        scope: editMissingButton.dataset.scope
      });
      return;
    }
    if (deleteButton) await deleteScore(deleteButton.dataset.deleteScore);
    if (restoreButton) {
      await restoreMissingReminder(restoreButton.dataset.restoreMissing);
      return;
    }
    if (excludeButton) {
      await excludeMissingReminder({
        examId: excludeButton.dataset.examId,
        studentId: excludeButton.dataset.studentId,
        subject: excludeButton.dataset.subject,
        scope: excludeButton.dataset.scope
      });
    }
  };

  filterRows();

  if (overviewAutoRefreshTimer) clearInterval(overviewAutoRefreshTimer);
  overviewAutoRefreshTimer = setInterval(async function () {
    if (document.visibilityState === "hidden" || activeTab !== "overview" || overviewAutoRefreshBusy || !$("overviewRows")) return;

    overviewAutoRefreshBusy = true;
    const currentFilters = {
      search: $("overviewSearch") ? $("overviewSearch").value : "",
      examId: $("overviewExam") ? $("overviewExam").value : "",
      className: $("overviewClass") ? $("overviewClass").value : "",
      subject: $("overviewSubject") ? $("overviewSubject").value : "",
      status: $("overviewStatus") ? $("overviewStatus").value : "all"
    };
    const currentScrollY = window.scrollY;
    const excludedPanel = $("excludedRemindersPanel");
    const keepPanelOpen = !!(excludedPanel && excludedPanel.style.display !== "none");

    try {
      const dataChanged = await refreshOverviewData();
      const filtersStillMatch =
        currentFilters.search === ($("overviewSearch") ? $("overviewSearch").value : "") &&
        currentFilters.examId === ($("overviewExam") ? $("overviewExam").value : "") &&
        currentFilters.className === ($("overviewClass") ? $("overviewClass").value : "") &&
        currentFilters.subject === ($("overviewSubject") ? $("overviewSubject").value : "") &&
        currentFilters.status === ($("overviewStatus") ? $("overviewStatus").value : "all");
      if (dataChanged && activeTab === "overview" && $("overviewRows") && filtersStillMatch) {
        renderOverview(currentFilters, keepPanelOpen);
        window.scrollTo({ top: currentScrollY, behavior: "auto" });
      }
    } catch (error) {
      console.error("成績總覽自動更新失敗：", error);
    } finally {
      overviewAutoRefreshBusy = false;
    }
  }, 60000);
}

// ==================================================
// 7-0. 批次排除未登錄提醒
// ==================================================

async function excludeMissingRemindersBatch(items) {
  const uniqueItems = Array.from(new Map(items.map(item => [
    [item.examId, item.studentId, item.subject, item.scope || ""].join("|"), item
  ])).values());
  const details = uniqueItems.map(item => {
    const student = studentsByIdCache.get(String(item.studentId));
    const exam = examsByIdCache.get(String(item.examId));
    return student && exam
      ? student.full_name + "（" + student.class_name + "／" + formatDateRange(exam) + "／" + item.subject + "）"
      : null;
  }).filter(Boolean);
  if (details.length !== uniqueItems.length) {
    showMessage("部分選取資料已不存在，請重新整理後再操作。", "error", true);
    return;
  }
  if (!confirm(
    "確定要批次排除這 " + uniqueItems.length + " 筆未登錄提醒嗎？\n\n" +
    details.slice(0, 8).join("\n") +
    (details.length > 8 ? "\n另有 " + (details.length - 8) + " 筆……" : "") +
    "\n\n只會排除提醒，不會刪除任何成績或學生資料。"
  )) return;

  const overviewScrollY = window.scrollY;
  const overviewFilters = {
    search: $("overviewSearch") ? $("overviewSearch").value : "",
    examId: $("overviewExam") ? $("overviewExam").value : "",
    className: $("overviewClass") ? $("overviewClass").value : "",
    subject: $("overviewSubject") ? $("overviewSubject").value : "",
    status: $("overviewStatus") ? $("overviewStatus").value : "all"
  };
  const excludedPanel = $("excludedRemindersPanel");
  const keepPanelOpen = !!(excludedPanel && excludedPanel.style.display !== "none");
  let successCount = 0;
  const failures = [];
  const knownExclusionIds = new Set(
    missingExclusionsCache.map(row => String(row.id))
  );

  for (const item of uniqueItems) {
    try {
      const result = await db.from("score_missing_exclusions")
        .insert({
          exam_id: item.examId,
          student_id: item.studentId,
          subject: item.subject,
          scope: item.scope || ""
        })
        .select("id, exam_id, student_id, subject, scope")
        .single();

      let exclusionRow = result.data;
      if (result.error) {
        if (result.error.code === "23505") {
          const existing = await db.from("score_missing_exclusions")
            .select("id, exam_id, student_id, subject, scope")
            .eq("exam_id", item.examId)
            .eq("student_id", item.studentId)
            .eq("subject", item.subject)
            .eq("scope", item.scope || "")
            .maybeSingle();
          if (existing.error) throw existing.error;
          exclusionRow = existing.data;
        } else {
          throw result.error;
        }
      }
      if (!exclusionRow) throw new Error("無法確認排除紀錄");
      const exclusionId = String(exclusionRow.id);
      if (!knownExclusionIds.has(exclusionId)) {
        missingExclusionsCache.push(exclusionRow);
        knownExclusionIds.add(exclusionId);
      }
      successCount++;
    } catch (error) {
      const student = studentsByIdCache.get(String(item.studentId));
      failures.push((student ? student.full_name : item.studentId) + "：" + error.message);
    }
  }

  renderOverview(overviewFilters, keepPanelOpen);
  window.scrollTo({ top: overviewScrollY, behavior: "auto" });
  if (failures.length) {
    showMessage("批次排除完成：成功 " + successCount + " 筆，失敗 " + failures.length + " 筆。\n" +
      failures.slice(0, 5).join("\n"), "error", true);
  } else {
    showMessage("已成功排除 " + successCount + " 筆未登錄提醒。", "success", true);
  }
}

// ==================================================
// 7-0-1. 排除單筆未登錄提醒
// ==================================================

async function excludeMissingReminder(item) {
  const overviewScrollY = window.scrollY;
  const overviewFilters = {
    search: $("overviewSearch") ? $("overviewSearch").value : "",
    examId: $("overviewExam") ? $("overviewExam").value : "",
    className: $("overviewClass") ? $("overviewClass").value : "",
    subject: $("overviewSubject") ? $("overviewSubject").value : "",
    status: $("overviewStatus") ? $("overviewStatus").value : "all"
  };
  const student = studentsByIdCache.get(String(item.studentId));
  const exam = examsByIdCache.get(String(item.examId));
  if (!student || !exam) {
    showMessage("找不到學生或考試資料，請重新整理。", "error");
    return;
  }

  const confirmed = confirm(
    "確定要排除此筆未登錄提醒嗎？\n\n" +
    "學生：" + student.full_name + "\n" +
    "班級：" + student.class_name + "\n" +
    "考試：" + formatDateRange(exam) + "\n" +
    "科目：" + item.subject + "\n" +
    "考試範圍：" + (item.scope || "—") + "\n\n" +
    "只會排除此學生本次考試、此科目及範圍的提醒，不會刪除學生或成績資料。"
  );
  if (!confirmed) return;

  try {
    const result = await db.from("score_missing_exclusions")
      .insert({
        exam_id: item.examId,
        student_id: item.studentId,
        subject: item.subject,
        scope: item.scope || ""
      })
      .select("id, exam_id, student_id, subject, scope")
      .single();

    let exclusionRow = result.data;

    if (result.error) {
      // 若同一提醒已被其他管理員排除，將既有資料讀回即可，不執行 UPDATE。
      if (result.error.code === "23505") {
        const existing = await db.from("score_missing_exclusions")
          .select("id, exam_id, student_id, subject, scope")
          .eq("exam_id", item.examId)
          .eq("student_id", item.studentId)
          .eq("subject", item.subject)
          .eq("scope", item.scope || "")
          .maybeSingle();

        if (existing.error) throw existing.error;
        exclusionRow = existing.data;
      } else {
        throw result.error;
      }
    }

    if (!exclusionRow) {
      throw new Error("無法確認未登錄提醒的排除紀錄，請重新整理後再試。");
    }

    missingExclusionsCache = missingExclusionsCache.filter(function (row) {
      return !(
        String(row.exam_id) === String(item.examId) &&
        String(row.student_id) === String(item.studentId) &&
        row.subject === item.subject &&
        String(row.scope || "") === String(item.scope || "")
      );
    });
    missingExclusionsCache.push(exclusionRow);
    renderOverview(overviewFilters, true);
    const systemMessage = $("systemMessage");
    if (systemMessage) systemMessage.style.display = "none";
    // 排除提醒後維持原本的捲動位置，讓使用者留在剛才操作的學生附近。
    window.scrollTo({ top: overviewScrollY, behavior: "auto" });
  } catch (error) {
    showMessage("刪除未登錄提醒失敗：" + error.message, "error", true);
  }
}


// ==================================================
// 7-0-1. 恢復已排除的未登錄提醒
// ==================================================

async function restoreMissingReminder(exclusionId) {
  const overviewScrollY = window.scrollY;
  const overviewFilters = {
    search: $("overviewSearch") ? $("overviewSearch").value : "",
    examId: $("overviewExam") ? $("overviewExam").value : "",
    className: $("overviewClass") ? $("overviewClass").value : "",
    subject: $("overviewSubject") ? $("overviewSubject").value : "",
    status: $("overviewStatus") ? $("overviewStatus").value : "all"
  };
  const exclusion = missingExclusionsCache.find(item => String(item.id) === String(exclusionId));
  if (!exclusion) {
    showMessage("找不到這筆已排除提醒，請重新整理。", "error", true);
    return;
  }

  const student = studentsByIdCache.get(String(exclusion.student_id));
  const exam = examsByIdCache.get(String(exclusion.exam_id));
  if (!student || !exam) {
    showMessage("找不到對應的學生或考試資料，請重新整理。", "error", true);
    return;
  }

  if (!confirm(
    "確定要恢復這筆未登錄提醒嗎？\n\n" +
    "學生：" + student.full_name + "\n" +
    "班級：" + student.class_name + "\n" +
    "考試：" + formatDateRange(exam) + "\n" +
    "科目：" + exclusion.subject + "\n" +
    "考試範圍：" + (exclusion.scope || "—") + "\n\n" +
    "恢復後，系統會重新檢查並顯示這筆未登錄提醒。"
  )) return;

  try {
    const result = await db.from("score_missing_exclusions")
      .delete()
      .eq("id", exclusionId);
    if (result.error) throw result.error;

    missingExclusionsCache = missingExclusionsCache.filter(
      item => String(item.id) !== String(exclusionId)
    );
    renderOverview(overviewFilters);
    const systemMessage = $("systemMessage");
    if (systemMessage) systemMessage.style.display = "none";
    window.scrollTo({ top: overviewScrollY, behavior: "auto" });
  } catch (error) {
    showMessage("恢復未登錄提醒失敗：" + error.message, "error", true);
  }
}

// ==================================================
// 7-1. 修改既有成績
// ==================================================

function closeScoreEditModal() {
  const modal = $("scoreEditModal");
  if (modal) modal.remove();
  document.removeEventListener("keydown", handleScoreEditEscape);
}

function handleScoreEditEscape(event) {
  if (event.key === "Escape") closeScoreEditModal();
}

async function editScore(scoreId, missingEntry) {
  const isNewScore = !!missingEntry;
  const overviewScrollY = window.scrollY;
  const overviewFilters = {
    search: $("overviewSearch") ? $("overviewSearch").value : "",
    examId: $("overviewExam") ? $("overviewExam").value : "",
    className: $("overviewClass") ? $("overviewClass").value : "",
    subject: $("overviewSubject") ? $("overviewSubject").value : "",
    status: $("overviewStatus") ? $("overviewStatus").value : "all"
  };
  const score = isNewScore
    ? {
        student_id: missingEntry.studentId,
        exam_id: missingEntry.examId,
        subject: missingEntry.subject,
        scope: missingEntry.scope || "",
        score: null,
        correct_count: null,
        grade_level: null
      }
    : scoresByIdCache.get(String(scoreId));
  if (!score) {
    showMessage("找不到這筆成績資料，請重新整理。", "error");
    return;
  }
  const student = studentsByIdCache.get(String(score.student_id));
  const exam = examsByIdCache.get(String(score.exam_id));
  if (!student || !exam) {
    showMessage("找不到學生或考試資料，無法修改成績。", "error");
    return;
  }

  const grade3 = isGrade3Class(student.class_name);
  const gradeOptions = GRADE_OPTIONS.map(function (grade) {
    return "<option value='" + escapeHtml(grade) + "'>" + escapeHtml(grade) + "</option>";
  }).join("");
  const subjectOptions = SUBJECTS.map(function (subject) {
    return "<option value='" + escapeHtml(subject) + "'" + (subject === score.subject ? " selected" : "") + ">" + escapeHtml(subject) + "</option>";
  }).join("");

  const modal = document.createElement("div");
  modal.id = "scoreEditModal";
  modal.className = "score-edit-overlay";
  modal.innerHTML =
    "<div class='score-edit-dialog' role='dialog' aria-modal='true' aria-labelledby='scoreEditTitle'>" +
      "<div class='score-edit-header'><div><h3 id='scoreEditTitle'>" + (isNewScore ? "新增未登錄成績" : "修改成績") + "</h3><p>" +
        escapeHtml(student.full_name) + "｜" + escapeHtml(student.class_name) + "｜" + escapeHtml(formatDateRange(exam)) +
      "</p></div><button type='button' class='score-edit-close' id='scoreEditClose' aria-label='關閉'>×</button></div>" +
      "<form id='scoreEditForm'>" +
        "<p id='scoreEditError' class='system-message error' style='display:none'></p>" +
        "<div class='field'><label for='scoreEditSubject'>科目</label><select id='scoreEditSubject' required>" + subjectOptions + "</select></div>" +
        "<div class='field'><label for='scoreEditScope'>考試範圍</label><input id='scoreEditScope' type='text' maxlength='120' required value='" + escapeHtml(score.scope || "") + "'></div>" +
        "<div id='scoreEditValueFields'></div>" +
        "<p class='score-edit-note'>" + (isNewScore ? "儲存後會新增這位學生的成績紀錄。" : "修改後會更新原有紀錄，不會新增另一筆成績。") + "</p>" +
        "<div class='score-edit-actions'><button type='button' class='btn btn-secondary' id='scoreEditCancel'>取消</button><button type='submit' class='btn btn-success' id='scoreEditSave'>儲存修改</button></div>" +
      "</form>" +
    "</div>";

  document.body.appendChild(modal);

  function renderValueFields() {
    const subject = $("scoreEditSubject").value;
    const sameSubject = subject === score.subject;
    const grade3Math = isGrade3Math(student.class_name, subject);
    const valueBox = $("scoreEditValueFields");
    if (grade3Math) {
      valueBox.innerHTML =
        "<div class='field'><label for='scoreEditGrade'>模擬考等級／出席狀態</label><select id='scoreEditGrade' required>" + gradeOptions + "</select></div>" +
        "<div class='field' id='scoreEditNumericField'><label for='scoreEditNumeric'>數學分數（0～100）</label><input id='scoreEditNumeric' type='number' min='0' max='100' step='any' inputmode='decimal'></div>";
      $("scoreEditGrade").value = sameSubject ? (score.grade_level || "") : "";
      $("scoreEditNumeric").value = sameSubject && score.score != null ? score.score : "";
    } else if (grade3) {
      valueBox.innerHTML =
        "<div class='field'><label for='scoreEditGrade'>模擬考等級／出席狀態</label><select id='scoreEditGrade' required>" + gradeOptions + "</select></div>" +
        "<div class='field' id='scoreEditNumericField'><label for='scoreEditNumeric'>答對題數</label><input id='scoreEditNumeric' type='number' min='0' step='1' inputmode='numeric'></div>";
      $("scoreEditGrade").value = sameSubject ? (score.grade_level || "") : "";
      $("scoreEditNumeric").value = sameSubject && score.correct_count != null ? score.correct_count : "";
    } else {
      valueBox.innerHTML =
        "<div class='field'><label for='scoreEditAttendance'>出席狀態</label><select id='scoreEditAttendance'><option value='normal'>正常出席</option><option value='請假'>請假</option></select></div>" +
        "<div class='field' id='scoreEditNumericField'><label for='scoreEditNumeric'>成績（0～100）</label><input id='scoreEditNumeric' type='number' min='0' max='100' step='any' inputmode='decimal'></div>";
      $("scoreEditAttendance").value = sameSubject && score.grade_level === "請假" ? "請假" : "normal";
      $("scoreEditNumeric").value = sameSubject && score.score != null ? score.score : "";
    }
    const gradeControl = $("scoreEditGrade") || $("scoreEditAttendance");
    if (gradeControl) gradeControl.addEventListener("change", updateNumericVisibility);
    updateNumericVisibility();
  }

  function showScoreEditError(message) {
    const errorBox = $("scoreEditError");
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.style.display = "block";
  }

  function updateNumericVisibility() {
    const gradeControl = $("scoreEditGrade") || $("scoreEditAttendance");
    const numericField = $("scoreEditNumericField");
    if (!gradeControl || !numericField) return;
    const status = gradeControl.value;
    numericField.style.display = status === "請假" || status === "缺考" ? "none" : "block";
  }

  $("scoreEditSubject").addEventListener("change", renderValueFields);
  $("scoreEditClose").addEventListener("click", closeScoreEditModal);
  $("scoreEditCancel").addEventListener("click", closeScoreEditModal);
  modal.addEventListener("click", function (event) {
    if (event.target === modal) closeScoreEditModal();
  });
  document.addEventListener("keydown", handleScoreEditEscape);
  renderValueFields();
  $("scoreEditScope").focus();

  $("scoreEditForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const saveButton = $("scoreEditSave");
    if (saveButton.disabled) return;
    const subject = $("scoreEditSubject").value;
    const scope = $("scoreEditScope").value.trim();
    if (!SUBJECTS.includes(subject) || !scope) {
      showScoreEditError("請確認科目及考試範圍均已填寫。");
      return;
    }

    // 使用學生＋考試＋科目＋範圍複合索引檢查重複，避免每次修改都掃描整份成績快取。
    const duplicateScore = scoresByStudentExamSubjectScopeCache.get(
      getScoreCompositeKey(score.student_id, score.exam_id, subject, scope)
    );
    const hasOtherDuplicate = duplicateScore && (isNewScore || String(duplicateScore.id) !== String(scoreId));
    if (hasOtherDuplicate) {
      showScoreEditError("這位學生已有相同考試、科目及範圍的成績紀錄。請調整科目或考試範圍，避免重複資料。");
      return;
    }

    const grade3Math = isGrade3Math(student.class_name, subject);
    let scoreValue = null;
    let correctCount = null;
    let gradeLevel = null;
    if (grade3 || grade3Math) {
      gradeLevel = $("scoreEditGrade").value;
      if (!GRADE_OPTIONS.includes(gradeLevel)) {
        showScoreEditError("請選擇正確的模擬考等級或出席狀態。");
        return;
      }
      if (gradeLevel !== "缺考" && gradeLevel !== "請假") {
        const value = $("scoreEditNumeric").value;
        if (value.trim() === "") {
          showScoreEditError("請輸入成績數值。");
          return;
        }
        if (grade3Math) {
          scoreValue = Number(value);
          if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
            showScoreEditError("國三數學分數必須是 0～100。");
            return;
          }
        } else {
          correctCount = Number(value);
          if (!Number.isInteger(correctCount) || correctCount < 0) {
            showScoreEditError("答對題數必須是 0 或正整數。");
            return;
          }
        }
      }
    } else if ($("scoreEditAttendance").value === "請假") {
      gradeLevel = "請假";
    } else {
      scoreValue = Number($("scoreEditNumeric").value);
      if ($("scoreEditNumeric").value.trim() === "" || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
        showScoreEditError("一般成績必須是 0～100。");
        return;
      }
    }

    const resultLabel = gradeLevel === "請假" || gradeLevel === "缺考"
      ? gradeLevel
      : grade3Math ? scoreValue + " 分／" + gradeLevel
      : grade3 ? correctCount + " 題／" + gradeLevel
      : scoreValue + " 分";
    if (!confirm((isNewScore ? "確認新增這筆成績嗎？" : "確認修改這筆成績嗎？") + "\n\n學生：" + student.full_name +
      "\n科目：" + subject + "\n考試範圍：" + scope + "\n成績：" + resultLabel +
      "\n\n" + (isNewScore ? "此操作會新增一筆成績紀錄。" : "此操作會更新原有資料，不會新增另一筆成績。"))) return;

    const payload = {
      subject: subject,
      scope: scope,
      score: scoreValue,
      correct_count: correctCount,
      grade_level: gradeLevel
    };
    saveButton.disabled = true;
    saveButton.textContent = "儲存中……";
    try {
      const result = isNewScore
        ? await db.from("scores")
            .insert({
              student_id: score.student_id,
              exam_id: score.exam_id,
              ...payload
            })
            .select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level")
            .single()
        : await db.from("scores")
            .update(payload)
            .eq("id", scoreId)
            .select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level")
            .single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("資料已送出，但未取得成績內容，請重新整理確認。");

      if (isNewScore) {
        // 新增成功後直接更新成績快取與索引，避免為單筆新增重新查詢整張成績表。
        addScoreToLocalCache(result.data);
      } else {
        // 更新複合索引時先移除舊鍵，再寫入新鍵，維持科目／範圍修改後的查找正確性。
        const previousCompositeKey = getScoreCompositeKey(
          score.student_id, score.exam_id, score.subject, score.scope
        );
        Object.assign(score, result.data);
        scoresByIdCache.set(String(scoreId), score);
        updateScoreCompositeIndex(score, previousCompositeKey);
        invalidateAdminHighestPreviewCache();
      }

      closeScoreEditModal();
      renderOverview(overviewFilters);
      showMessage(isNewScore
        ? "「" + student.full_name + "」的成績已新增成功。"
        : "「" + student.full_name + "」的成績已修改成功。", "success", true);
      window.scrollTo({ top: overviewScrollY, behavior: "auto" });
    } catch (error) {
      saveButton.disabled = false;
      saveButton.textContent = isNewScore ? "新增成績" : "儲存修改";
      showScoreEditError("修改成績失敗，原資料未變更。原因：" + error.message);
    }
  });
}

// ==================================================
// 7-2. 刪除單筆成績
// ==================================================

async function deleteScore(scoreId) {
  const overviewScrollY = window.scrollY;
  const overviewFilters = {
    search: $("overviewSearch") ? $("overviewSearch").value : "",
    examId: $("overviewExam") ? $("overviewExam").value : "",
    className: $("overviewClass") ? $("overviewClass").value : "",
    subject: $("overviewSubject") ? $("overviewSubject").value : "",
    status: $("overviewStatus") ? $("overviewStatus").value : "all"
  };
  const score = scoresByIdCache.get(String(scoreId));

  if (!score) {
    showMessage("找不到這筆成績資料，請重新整理。", "error");
    return;
  }

  const student = studentsByIdCache.get(String(score.student_id));
  const exam = examsByIdCache.get(String(score.exam_id));

  if (!student || !exam) {
    showMessage("無法確認學生或考試資料，請重新整理。", "error");
    return;
  }

  const resultText = score.grade_level === "請假"
    ? "請假"
    : score.grade_level === "缺考"
      ? "缺考"
      : isGrade3Math(student.class_name, score.subject)
      ? "分數：" + (score.score == null ? "—" : score.score) + " 分，等級：" + (score.grade_level || "—")
      : isGrade3Class(student.class_name)
        ? (score.correct_count == null ? "—" : score.correct_count) + " 題，等級：" + (score.grade_level || "—")
        : "分數：" + (score.score == null ? "—" : score.score);

  const confirmed = confirm(
    "確定要刪除以下這筆成績嗎？\n\n" +
    "學生：" + student.full_name + "\n" +
    "班級：" + student.class_name + "\n" +
    "考試：" + formatDateRange(exam) + "\n" +
    "科目：" + score.subject + "\n" +
    "考試範圍：" + (score.scope || "—") + "\n" +
    "成績：" + resultText + "\n\n" +
    "只會刪除這一筆成績，此操作無法復原。"
  );

  if (!confirmed) return;

  try {
    const result = await db.from("scores").delete().eq("id", scoreId);
    if (result.error) throw result.error;

    // 刪除成功後直接從本機成績快取移除，避免為單筆刪除重新下載全體成績。
    removeScoreFromLocalCache(scoreId);
    renderOverview(overviewFilters);

    // 成績總覽刪除後保留篩選條件與捲動位置，不顯示系統通知。
    const systemMessage = $("systemMessage");
    if (systemMessage) systemMessage.style.display = "none";
    window.scrollTo({ top: overviewScrollY, behavior: "auto" });

  } catch (error) {
    showMessage("刪除成績失敗：" + error.message, "error");
  }
}

// ==================================================
// 8. 成績登錄
// ==================================================

const SCORE_ENTRY_PROGRESS_KEY = "xiaoxiang_score_entry_progress_v1";

function saveScoreEntryProgress() {
  if (!$("scoreExam")) return;
  const progress = {
    exam: $("scoreExam").value,
    className: $("scoreClass").value,
    student: $("scoreStudent").value,
    subject: $("scoreSubject").value,
    scope: $("scoreScope").value,
    score: $("scoreValue").value,
    mathScore: $("grade3MathScore").value,
    mathGrade: $("grade3MathGrade").value,
    correctCount: $("correctCount").value,
    gradeLevel: $("gradeLevel").value,
    generalAttendance: $("generalAttendance") ? $("generalAttendance").value : "normal",
    savedAt: new Date().toISOString()
  };
  try { localStorage.setItem(SCORE_ENTRY_PROGRESS_KEY, JSON.stringify(progress)); } catch (error) {}
}

function restoreScoreEntryProgress() {
  let progress = null;
  try { progress = JSON.parse(localStorage.getItem(SCORE_ENTRY_PROGRESS_KEY) || "null"); } catch (error) {}
  if (!progress) return;
  if ($("scoreExam")) $("scoreExam").value = progress.exam || "";
  if ($("scoreClass")) $("scoreClass").value = progress.className || "";
  updateScoreStudentOptions(false);
  if ($("scoreStudent")) $("scoreStudent").value = progress.student || "";
  if ($("scoreSubject")) $("scoreSubject").value = progress.subject || "";
  if ($("scoreScope")) $("scoreScope").value = progress.scope || "";
  updateScoreMode();
  if ($("scoreValue")) $("scoreValue").value = progress.score || "";
  if ($("grade3MathScore")) $("grade3MathScore").value = progress.mathScore || "";
  if ($("grade3MathGrade")) $("grade3MathGrade").value = progress.mathGrade || "";
  if ($("correctCount")) $("correctCount").value = progress.correctCount || "";
  if ($("gradeLevel")) $("gradeLevel").value = progress.gradeLevel || "";
  if ($("generalAttendance")) $("generalAttendance").value = progress.generalAttendance || "normal";
  updateGrade3AbsenceMode();
}

function clearScoreEntryDraft() {
  ["scoreValue", "grade3MathScore", "grade3MathGrade", "correctCount", "gradeLevel"].forEach(function (id) {
    if ($(id)) $(id).value = "";
  });
  if ($("generalAttendance")) $("generalAttendance").value = "normal";
  saveScoreEntryProgress();
}

function getCurrentWeekExamDates() {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  const saturday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
  saturday.setDate(saturday.getDate() + 5);
  function toLocalDateString(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  return { start: toLocalDateString(monday), end: toLocalDateString(saturday) };
}

let examCalendarMonth = new Date();
let examCalendarOpen = false;
let examCalendarSelectingEnd = false;

// 點擊日期日曆以外的任何位置時，關閉懸浮日曆（桌面與手機共用）。
document.addEventListener("click", function (event) {
  if (!examCalendarOpen) return;
  if (event.target.closest("#examDateCalendar, #examDateRangeDisplay, #examCalendarTrigger")) return;
  examCalendarOpen = false;
  renderExamDateCalendar();
});

function formatExamDateDisplay(value) {
  return value ? value.replace(/-/g, "/") : "";
}
function updateExamDateRangeDisplay() {
  const display = $("examDateRangeDisplay");
  if (!display) return;
  const start = $("examStart").value;
  const end = $("examEnd").value;
  display.value = start && end ? formatExamDateDisplay(start) + " ～ " + formatExamDateDisplay(end)
    : start ? formatExamDateDisplay(start) + " ～ 請選擇結束日期" : "請選擇開始日期與結束日期";
}
function renderExamDateCalendar() {
  const panel = $("examDateCalendar");
  if (!panel) return;
  const year = examCalendarMonth.getFullYear(), month = examCalendarMonth.getMonth();
  const offset = new Date(year, month, 1).getDay(), count = new Date(year, month + 1, 0).getDate();
  const start = $("examStart").value, end = $("examEnd").value, cells = [];
  for (let i = 0; i < offset; i++) cells.push("<span class='attendance-calendar-empty'></span>");
  for (let day = 1; day <= count; day++) {
    const date = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const selected = date === start || date === end, inRange = start && end && date > start && date < end;
    cells.push("<button type='button' class='attendance-calendar-day" + (selected ? " selected" : "") + (inRange ? " in-range" : "") + "' data-exam-calendar-date='" + date + "'>" + day + "</button>");
  }
  panel.innerHTML = "<div class='attendance-calendar-heading'><button type='button' data-exam-calendar-nav='-1' aria-label='上個月'>‹</button><strong>" +
    year + " 年 " + (month + 1) + " 月</strong><button type='button' data-exam-calendar-nav='1' aria-label='下個月'>›</button></div>" +
    "<div class='attendance-calendar-weekdays'><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>" +
    "<div class='attendance-calendar-days'>" + cells.join("") + "</div><p class='exam-calendar-hint'>" +
    (examCalendarSelectingEnd ? "請選擇結束日期" : "請選擇開始日期") + "</p>";
  panel.hidden = !examCalendarOpen;
}
function openExamDateCalendar() {
  if (!$("examDateCalendar")) return;
  examCalendarOpen = true;
  const parts = ($("examStart").value || getCurrentWeekExamDates().start).split("-").map(Number);
  examCalendarMonth = new Date(parts[0], parts[1] - 1, 1);
  examCalendarSelectingEnd = Boolean($("examStart").value && !$("examEnd").value);
  renderExamDateCalendar();
}
function setDefaultExamDates() {
  const dates = getCurrentWeekExamDates();
  if ($("examStart")) $("examStart").value = dates.start;
  if ($("examEnd")) $("examEnd").value = dates.end;
  updateExamDateRangeDisplay();
  examCalendarOpen = false;
  renderExamDateCalendar();
}

const BULK_SCORE_DRAFT_KEY = "xiaoxiang_bulk_score_entry_draft_v1";

function getBulkScoreCondition() {
  return {
    examId: $("scoreExam") ? $("scoreExam").value : "",
    className: $("scoreClass") ? $("scoreClass").value : "",
    subject: $("scoreSubject") ? $("scoreSubject").value : "",
    scope: $("scoreScope") ? $("scoreScope").value.trim() : ""
  };
}

function readBulkScoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(BULK_SCORE_DRAFT_KEY) || "null");
    const condition = getBulkScoreCondition();
    if (!draft || !draft.condition || !draft.rows) return {};
    return Object.keys(condition).every(key => String(draft.condition[key] || "") === String(condition[key] || ""))
      ? draft.rows : {};
  } catch (error) { return {}; }
}

let bulkScoreDraftSaveTimer = null;

function saveBulkScoreDraft(immediate) {
  if (bulkScoreDraftSaveTimer) {
    clearTimeout(bulkScoreDraftSaveTimer);
    bulkScoreDraftSaveTimer = null;
  }
  const persist = function () {
    bulkScoreDraftSaveTimer = null;
    const root = $("bulkScoreEntryContent");
    if (!root) return;
    const condition = getBulkScoreCondition();
    if (!condition.examId || !condition.className || !condition.subject || !condition.scope) return;
    const rows = {};
    root.querySelectorAll("tr[data-bulk-student]").forEach(function (row) {
      const input = row.querySelector("[data-bulk-score]");
      const grade = row.querySelector("[data-bulk-grade]");
      const status = row.querySelector("[data-bulk-status]");
      rows[row.dataset.bulkStudent] = {
        score: input ? input.value : "",
        grade: grade ? grade.value : "",
        status: status ? status.value : "normal"
      };
    });
    try {
      localStorage.setItem(BULK_SCORE_DRAFT_KEY, JSON.stringify({
        condition: condition, rows: rows, savedAt: new Date().toISOString()
      }));
    } catch (error) {}
  };
  if (immediate === true) {
    persist();
  } else {
    // 輸入時先合併短時間內的連續事件，避免每打一個字就掃描整張表並同步寫入 localStorage。
    bulkScoreDraftSaveTimer = setTimeout(persist, 250);
  }
}

function renderBulkScoreEntryRows() {
  const root = $("bulkScoreEntryContent");
  if (!root) return;
  const examId = $("scoreExam").value;
  const className = $("scoreClass").value;
  const subject = $("scoreSubject").value;
  if (!examId || !className || !subject || !String($("scoreScope").value || "").trim()) {
    bulkEntryExistingScoresByStudent = new Map();
    bulkEntryScoreContextKey = "";
    root.innerHTML = "<div class='empty'>請先選擇考試週期、班級、科目，並填寫考試範圍。</div>";
    return;
  }
  // 班級／科目學生名單已在頁面初始化時分組，切換條件不再重掃全部修課與學生資料。
  const students = scoreEntryStudentsByClassSubject.get(JSON.stringify([className, subject])) || [];
  if (!students.length) {
    root.innerHTML = "<div class='empty'>此班目前沒有設定修讀「" + escapeHtml(subject) + "」的在學學生，請先至學生管理確認修課設定。</div>";
    return;
  }
  const grade3 = isGrade3Class(className);
  const grade3Math = isGrade3Math(className, subject);
  const gradeOptions = GRADE_OPTIONS.map(function (grade) {
    return "<option value='" + escapeHtml(grade) + "'>" + escapeHtml(grade) + "</option>";
  }).join("");
  const draftRows = readBulkScoreDraft();
  const scope = String($("scoreScope").value || "").trim();
  // 本次名單的考試、科目與範圍固定，先建立學生成績索引，避免逐列掃描整份成績快取。
  const existingScoreByStudent = new Map();
  scoresCache.forEach(function (score) {
    if (String(score.exam_id) === String(examId) &&
        score.subject === subject &&
        String(score.scope || "").trim() === scope) {
      existingScoreByStudent.set(String(score.student_id), score);
    }
  });
  // 將本次登錄條件的既有成績索引保留給單筆儲存共用，避免每按一次都掃描整份快取。
  bulkEntryExistingScoresByStudent = existingScoreByStudent;
  bulkEntryScoreContextKey = JSON.stringify([String(examId), subject, scope]);
  const rows = students.map(function (student) {
    const existing = existingScoreByStudent.get(String(student.id));
    const draft = draftRows[String(student.id)] || {};
    const rawValue = Object.prototype.hasOwnProperty.call(draft, "score")
      ? draft.score
      : existing ? (grade3Math ? existing.score : grade3 ? existing.correct_count : existing.score) ?? "" : "";
    const gradeValue = Object.prototype.hasOwnProperty.call(draft, "grade")
      ? draft.grade : (grade3 ? existing && existing.grade_level || "" : "");
    const statusValue = Object.prototype.hasOwnProperty.call(draft, "status")
      ? draft.status : (existing && existing.grade_level === "請假" ? "請假" : "normal");
    let fields = "";
    if (grade3Math) {
      fields = "<td><input class='bulk-score-input' data-bulk-score type='number' min='0' max='100' step='0.1' placeholder='分數' value='" + escapeHtml(rawValue) + "'></td>" +
        "<td><select data-bulk-grade><option value=''>選擇等級</option>" + gradeOptions + "</select></td>";
    } else if (grade3) {
      fields = "<td><input class='bulk-score-input' data-bulk-score type='number' min='0' step='1' placeholder='答對題數' value='" + escapeHtml(rawValue) + "'></td>" +
        "<td><select data-bulk-grade><option value=''>選擇等級</option>" + gradeOptions + "</select></td>";
    } else {
      fields = "<td><input class='bulk-score-input' data-bulk-score type='number' min='0' max='100' step='0.1' placeholder='分數' value='" + escapeHtml(rawValue) + "'></td>" +
        "<td><select data-bulk-status><option value='normal'>正常</option><option value='請假'>請假</option></select></td>";
    }
    return "<tr data-bulk-student='" + escapeHtml(student.id) + "'>" +
      "<td>" + escapeHtml(student.student_code || "") + "</td>" +
      "<td>" + escapeHtml(student.full_name) + (existing ? " <span class='muted'>（已有成績）</span>" : "") + "</td>" +
      fields + "<td><button class='btn btn-small' type='button' data-save-bulk-row>單筆儲存</button></td></tr>";
  }).join("");
  root.innerHTML = "<div class='muted' style='margin-bottom:10px'>共 " + students.length + " 位學生；只會儲存有填寫資料的學生。</div>" +
    "<div class='table-wrap'><table class='bulk-score-entry-table' style='min-width:620px'><thead><tr><th>編號</th><th>學生</th>" +
    (grade3Math ? "<th>數學分數</th><th>模擬考等級</th>" : grade3 ? "<th>答對題數</th><th>模擬考等級</th>" : "<th>成績</th><th>出席狀態</th>") +
    "<th>操作</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  const scoreEntryTable = root.querySelector(".bulk-score-entry-table");
  if (scoreEntryTable) {
    // 直接在表格元素鎖定尺寸，避免全站 table-wrap 的 100% 寬度規則把欄距再次撐開。
    scoreEntryTable.style.setProperty("width", "820px", "important");
    scoreEntryTable.style.setProperty("min-width", "820px", "important");
    scoreEntryTable.style.setProperty("max-width", "none", "important");
    scoreEntryTable.style.setProperty("table-layout", "fixed", "important");
    const columnWidths = [140, 160, 160, 160, 200];
    scoreEntryTable.querySelectorAll("thead th, tbody td").forEach(function (cell) {
      const index = cell.cellIndex;
      if (columnWidths[index]) cell.style.setProperty("width", columnWidths[index] + "px", "important");
    });
  }
  // 等級與出席狀態在同一次 DOM 遍歷中初始化，避免重複查詢相同表格。
  root.querySelectorAll("[data-bulk-score]").forEach(function (input) {
    updateScoreInputWarning(input, !grade3 || grade3Math);
  });
  root.querySelectorAll("[data-bulk-grade], [data-bulk-status]").forEach(function (control) {
    const row = control.closest("tr");
    const studentKey = String(row.dataset.bulkStudent);
    const draft = draftRows[studentKey] || {};
    const existing = existingScoreByStudent.get(studentKey);
    if (control.matches("[data-bulk-grade]")) {
      control.value = Object.prototype.hasOwnProperty.call(draft, "grade")
        ? draft.grade
        : existing && existing.grade_level || "";
      const input = row.querySelector("[data-bulk-score]");
      const grade3Absent = grade3 && (control.value === "缺考" || control.value === "請假");
      if (input) {
        input.disabled = grade3Absent;
        if (grade3Absent) input.value = "";
      }
      return;
    }
    control.value = draft.status ||
      (existing && existing.grade_level === "請假" ? "請假" : "normal");
    const input = row.querySelector("[data-bulk-score]");
    if (input) {
      input.disabled = control.value === "請假";
      if (input.disabled) input.value = "";
    }
  });
  root.oninput = function (event) {
    if (event.target.matches("[data-bulk-score]")) {
      updateScoreInputWarning(event.target, !grade3 || grade3Math);
    }
    saveBulkScoreDraft();
  };
  root.onchange = function (event) {
    if (event.target.matches("[data-bulk-status]")) {
      const input = event.target.closest("tr").querySelector("[data-bulk-score]");
      input.disabled = event.target.value === "請假";
      if (input.disabled) input.value = "";
    }
    if (event.target.matches("[data-bulk-grade]") && grade3) {
      const input = event.target.closest("tr").querySelector("[data-bulk-score]");
      const absentOrLeave = event.target.value === "缺考" || event.target.value === "請假";
      if (input) {
        input.disabled = absentOrLeave;
        if (absentOrLeave) input.value = "";
      }
    }
    saveBulkScoreDraft(true);
  };
  root.onfocusout = function () { saveBulkScoreDraft(true); };
  saveBulkScoreDraft(true);
}

async function refreshScoreCacheForScope(examId, subject, scope) {
  const result = await db
    .from("scores")
    .select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level")
    .eq("exam_id", examId)
    .eq("subject", subject)
    .eq("scope", scope);

  if (result.error) {
    throw new Error("成績已儲存，但同步本機成績快取失敗：" + result.error.message);
  }

  const refreshedRows = result.data || [];
  const normalizedExamId = String(examId);
  const normalizedScope = String(scope || "").trim();
  let retainedCount = 0;
  for (let index = 0; index < scoresCache.length; index += 1) {
    const item = scoresCache[index];
    const isRefreshedScope =
      String(item.exam_id) === normalizedExamId &&
      item.subject === subject &&
      String(item.scope || "").trim() === normalizedScope;
    if (!isRefreshedScope) {
      scoresCache[retainedCount] = item;
      retainedCount += 1;
    }
  }
  scoresCache.length = retainedCount;
  refreshedRows.forEach(function (item) {
    scoresCache.push(item);
  });
  // 同步目前成績登錄條件索引，避免刷新快取後仍指向舊物件。
  bulkEntryExistingScoresByStudent = new Map(
    refreshedRows.map(item => [String(item.student_id), item])
  );
  bulkEntryScoreContextKey = JSON.stringify([
    normalizedExamId,
    subject,
    normalizedScope
  ]);
  rebuildScoresByIdCache();
  invalidateAdminHighestPreviewCache();

  return refreshedRows;
}

async function saveSingleBulkScoreRow(row) {
  if (!row || $("saveBulkScoresButton")?.disabled) return;
  const button = row.querySelector("[data-save-bulk-row]");
  const message = $("bulkScoreEntryMessage");
  const studentId = row.dataset.bulkStudent;
  const student = studentsByIdCache.get(String(studentId));
  const examId = $("scoreExam").value;
  const className = $("scoreClass").value;
  const subject = $("scoreSubject").value;
  const scope = $("scoreScope").value.trim();
  if (!student || !examId || !className || !subject || !scope) {
    message.textContent = "請先完整選擇考試週期、班級、科目及考試範圍。";
    message.className = "system-message error";
    message.style.display = "block";
    return;
  }
  const grade3 = isGrade3Class(className);
  const grade3Math = isGrade3Math(className, subject);
  const input = row.querySelector("[data-bulk-score]");
  const gradeSelect = row.querySelector("[data-bulk-grade]");
  const statusSelect = row.querySelector("[data-bulk-status]");
  const raw = input ? input.value.trim() : "";
  const grade = gradeSelect ? gradeSelect.value : "";
  const status = statusSelect ? statusSelect.value : "normal";
  let score = null, correctCount = null, gradeLevel = null;
  if (grade3) {
    if (!grade || !GRADE_OPTIONS.includes(grade)) {
      message.textContent = student.full_name + "：請選擇模擬考等級。";
      message.className = "system-message error"; message.style.display = "block"; return;
    }
    if (grade !== "缺考" && grade !== "請假") {
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0 || (grade3Math ? value > 100 : !Number.isInteger(value))) {
        message.textContent = student.full_name + "：成績格式錯誤。";
        message.className = "system-message error"; message.style.display = "block"; return;
      }
      if (grade3Math) score = value; else correctCount = value;
    }
    gradeLevel = grade;
  } else if (status === "請假") {
    gradeLevel = "請假";
  } else {
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < 0 || value > 100) {
      message.textContent = student.full_name + "：請輸入 0～100 分。";
      message.className = "system-message error"; message.style.display = "block"; return;
    }
    score = value;
  }
  // 重用名冊渲染時建立的條件索引，單筆儲存不再掃描整份成績快取。
  const scoreContextKey = JSON.stringify([String(examId), subject, scope]);
  const duplicate = bulkEntryScoreContextKey === scoreContextKey
    ? bulkEntryExistingScoresByStudent.get(String(studentId)) || null
    : null;
  if (duplicate && !confirm(student.full_name + " 已有相同考試、科目及範圍的成績，是否覆蓋？")) return;
  button.disabled = true; button.textContent = "儲存中";
  try {
    const payload = { student_id: studentId, exam_id: examId, subject, scope, score, correct_count: correctCount, grade_level: gradeLevel };
    const result = duplicate
      ? await db.from("scores").update(payload).eq("id", duplicate.id).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single()
      : await db.from("scores").insert(payload).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("成績已送出，但未取得儲存後的資料，請重新整理確認。");

    // 更新既有物件或附加新資料，維持共用條件索引與 ID 索引的一致性。
    if (duplicate) {
      Object.assign(duplicate, result.data);
      bulkEntryExistingScoresByStudent.set(String(studentId), duplicate);
      scoresByIdCache.set(String(result.data.id), duplicate);
      updateScoreCompositeIndex(duplicate);
    } else {
      scoresCache.push(result.data);
      bulkEntryExistingScoresByStudent.set(String(studentId), result.data);
      scoresByIdCache.set(String(result.data.id), result.data);
      updateScoreCompositeIndex(result.data);
    }
    invalidateAdminHighestPreviewCache();
    const nameCell = row.children[1];
    if (nameCell && !nameCell.textContent.includes("已有成績")) {
      nameCell.innerHTML = escapeHtml(student.full_name) + " <span class='muted'>（已有成績）</span>";
    }
    message.textContent = student.full_name + " 的成績已" + (duplicate ? "覆蓋" : "儲存") + "成功。";
    message.className = "system-message success"; message.style.display = "block";
  } catch (error) {
    message.textContent = student.full_name + " 儲存失敗：" + error.message;
    message.className = "system-message error"; message.style.display = "block";
  } finally {
    button.disabled = false; button.textContent = "單筆儲存";
  }
}

async function saveBulkScores() {
  const button = $("saveBulkScoresButton");
  const message = $("bulkScoreEntryMessage");
  if (button.disabled) return;
  const examId = $("scoreExam").value;
  const className = $("scoreClass").value;
  const subject = $("scoreSubject").value;
  const scope = $("scoreScope").value.trim();
  if (!examId || !className || !subject || !scope) {
    message.textContent = "請先完整選擇考試週期、班級、科目及考試範圍。";
    message.className = "system-message error";
    message.style.display = "block";
    return;
  }
  const grade3 = isGrade3Class(className);
  const grade3Math = isGrade3Math(className, subject);
  const rows = Array.from($("bulkScoreEntryContent").querySelectorAll("tr[data-bulk-student]"));
  const entries = [];
  const errors = [];
  rows.forEach(function (row) {
    const studentId = row.dataset.bulkStudent;
    const input = row.querySelector("[data-bulk-score]");
    const gradeSelect = row.querySelector("[data-bulk-grade]");
    const statusSelect = row.querySelector("[data-bulk-status]");
    const raw = input ? input.value.trim() : "";
    const grade = gradeSelect ? gradeSelect.value : "";
    const status = statusSelect ? statusSelect.value : "normal";
    if (!raw && !grade && status !== "請假") return;
    if (grade3Math || grade3) {
      if (!grade || !GRADE_OPTIONS.includes(grade)) {
        errors.push(row.children[1].textContent.trim() + "：請選擇等級");
        return;
      }
      if (grade !== "缺考" && grade !== "請假") {
        const value = Number(raw);
        if (!raw || !Number.isFinite(value) || value < 0 || (grade3Math ? value > 100 : !Number.isInteger(value))) {
          errors.push(row.children[1].textContent.trim() + "：分數或答對題數格式錯誤");
          return;
        }
      }
    } else if (status !== "請假") {
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0 || value > 100) {
        errors.push(row.children[1].textContent.trim() + "：請輸入 0～100 分");
        return;
      }
    }
    const gradeLevel = grade3 ? grade : status === "請假" ? "請假" : null;
    const score = grade3Math
      ? (grade === "缺考" || grade === "請假" ? null : Number(raw))
      : grade3 ? null : status === "請假" ? null : Number(raw);
    const correctCount = grade3 && !grade3Math && grade !== "缺考" && grade !== "請假" ? Number(raw) : null;
    entries.push({ studentId, payload: {
      student_id: studentId, exam_id: examId, subject: subject, scope: scope,
      score: score, correct_count: correctCount, grade_level: gradeLevel
    }});
  });
  if (errors.length) {
    message.textContent = "以下資料尚未完成，請修正後再儲存：\n" + errors.join("；");
    message.className = "system-message error";
    message.style.display = "block";
    return;
  }
  if (!entries.length) {
    message.textContent = "目前沒有填寫任何成績，尚未儲存。";
    message.className = "system-message";
    message.style.display = "block";
    return;
  }
  // 優先重用表格渲染時建立的相同條件索引；只有條件不符時才重新掃描成績快取。
  const currentScoreContextKey = JSON.stringify([String(examId), subject, scope]);
  // 上次若遇到網路中斷且快取同步失敗，重試前先向資料庫重新確認，
  // 避免已成功寫入的資料因本機索引過舊而被誤判為新資料。
  if (bulkEntryScoreContextKey === "__stale__") {
    try {
      await refreshScoreCacheForScope(examId, subject, scope);
    } catch (refreshError) {
      message.textContent = "目前無法確認資料庫最新成績，為避免重複寫入，請確認網路後重新整理管理頁再試。";
      message.className = "system-message error";
      message.style.display = "block";
      return;
    }
  }
  let existingScoreByStudent = bulkEntryScoreContextKey === currentScoreContextKey
    ? bulkEntryExistingScoresByStudent
    : null;
  if (!existingScoreByStudent) {
    existingScoreByStudent = new Map();
    scoresCache.forEach(function (score) {
      if (
        String(score.exam_id) !== String(examId) ||
        score.subject !== subject ||
        String(score.scope || "").trim() !== scope
      ) return;
      const key = String(score.student_id);
      if (!existingScoreByStudent.has(key)) existingScoreByStudent.set(key, score);
    });
    bulkEntryExistingScoresByStudent = existingScoreByStudent;
    bulkEntryScoreContextKey = currentScoreContextKey;
  }
  const studentById = studentsByIdCache;
  const duplicates = entries.filter(entry =>
    existingScoreByStudent.has(String(entry.studentId))
  );
  if (duplicates.length && !confirm("本次有 " + duplicates.length + " 位學生已有相同考試、科目及範圍的成績。確認後會逐筆覆蓋原成績；其他新資料則新增。是否繼續？")) return;

  button.disabled = true;
  button.textContent = "儲存中……";
  const contextControls = ["scoreExam", "scoreClass", "scoreSubject", "scoreScope"]
    .map(id => $(id)).filter(Boolean);
  const rowSaveButtons = Array.from($("bulkScoreEntryContent").querySelectorAll("[data-save-bulk-row]"));
  contextControls.forEach(control => { control.disabled = true; });
  rowSaveButtons.forEach(control => { control.disabled = true; });
  message.textContent = "正在儲存 " + entries.length + " 筆成績……";
  message.className = "system-message";
  message.style.display = "block";
  let saved = 0;
  const failures = [];
  try {
    // 每批最多同時送出 8 筆，降低逐筆等待時間，也避免一次大量請求造成負載尖峰。
    const batchSize = 8;
    for (let start = 0; start < entries.length; start += batchSize) {
      const batch = entries.slice(start, start + batchSize);
      const results = await Promise.all(batch.map(async function (entry) {
        try {
          const duplicate = existingScoreByStudent.get(String(entry.studentId));
          const result = duplicate
            ? await db.from("scores").update(entry.payload).eq("id", duplicate.id)
            : await db.from("scores").insert(entry.payload);
          return { entry: entry, error: result.error || null };
        } catch (error) {
          // 單筆請求若因網路問題直接 reject，也要保留同批其他學生的處理結果。
          return { entry: entry, error: error };
        }
      }));

      results.forEach(function (item) {
        if (item.error) {
          const student = studentById.get(String(item.entry.studentId));
          failures.push((student ? student.full_name : item.entry.studentId) + "：" + item.error.message);
        } else {
          saved += 1;
        }
      });

      message.textContent = "已處理 " + Math.min(start + batch.length, entries.length) +
        " / " + entries.length + " 筆成績……";
    }

    let cacheWarning = "";
    if (saved) {
      try {
        await refreshScoreCacheForScope(examId, subject, scope);
      } catch (refreshError) {
        console.warn(refreshError);
        // 無法確認遠端最終狀態時，鎖定成績索引；下次儲存必須先重新向資料庫讀取。
        bulkEntryScoreContextKey = "__stale__";
        cacheWarning = "；提醒：部分成績可能已寫入，但最新資料確認失敗。請確認網路後重新整理管理頁，再檢查未完成項目";
      }
    }
    message.textContent = "完成 " + saved + " 筆" + (failures.length ? "；失敗 " + failures.length + " 筆：" + failures.join("；") : "；全部成功。") +
      (failures.length ? " 失敗項目可修正後重新儲存。" : "") + cacheWarning;
    message.className = failures.length ? "system-message error" : "system-message success";
    if (!failures.length) renderBulkScoreEntryRows();
  } catch (error) {
    message.textContent = "批次儲存中斷：已完成 " + saved + " 筆；" + error.message;
    message.className = "system-message error";
  } finally {
    contextControls.forEach(control => { control.disabled = false; });
    rowSaveButtons.forEach(control => { control.disabled = false; });
    button.disabled = false;
    button.textContent = "儲存本班成績";
  }
}

function renderScoreEntry() {
  const content = $("adminContent");
  // 本次成績登錄頁面建立班級／科目學生索引，切換考試範圍時直接重用。
  scoreEntryStudentsByClassSubject = new Map();
  const activeSubjectStudentIds = new Set();
  studentSubjectsCache.forEach(function (item) {
    if (item.is_active === true) {
      activeSubjectStudentIds.add(JSON.stringify([String(item.student_id), item.subject]));
    }
  });
  studentsCache.forEach(function (student) {
    if (student.is_active === false) return;
    SUBJECTS.forEach(function (subject) {
      if (!activeSubjectStudentIds.has(JSON.stringify([String(student.id), subject]))) return;
      const key = JSON.stringify([student.class_name, subject]);
      if (!scoreEntryStudentsByClassSubject.has(key)) scoreEntryStudentsByClassSubject.set(key, []);
      scoreEntryStudentsByClassSubject.get(key).push(student);
    });
  });
  // 同一頁面的考試選項與考試列表共用排序結果，避免重複排序。
  const sortedExams = examsByDateDescCache;
  const examOptions = sortedExams.map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" + escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");
  const examRows = sortedExams.map(function (exam) {
    return "<tr><td>" + escapeHtml(formatDate(exam.start_date)) + "</td><td>" + escapeHtml(formatDate(exam.end_date)) +
      "</td><td class='action-cell'><div class='action-buttons'><button class='btn btn-small' data-edit-exam='" + escapeHtml(exam.id) +
      "'>修改</button><button class='btn btn-danger btn-small' data-delete-exam='" + escapeHtml(exam.id) + "'>刪除</button></div></td></tr>";
  }).join("");
  content.innerHTML =
    "<h2 class='section-title'>週成績登錄</h2>" +
    "<div class='panel'><h3 id='examFormTitle'>新增考試</h3><form id='examForm'><input type='hidden' id='examEditId'>" +
    "<div id='examFormRow'>" +
    "<div class='field exam-date-range-field'><label for='examDateRangeDisplay'>考試日期區間</label><div class='exam-date-range-control'>" +
    "<input id='examDateRangeDisplay' type='text' readonly aria-label='選擇考試開始與結束日期' placeholder='請選擇日期區間'>" +
    "<button type='button' class='exam-calendar-trigger' id='examCalendarTrigger' aria-label='開啟日期日曆'>▦</button>" +
    "<div id='examDateCalendar' class='attendance-calendar exam-date-calendar' hidden></div></div>" +
    "<input id='examStart' type='hidden'><input id='examEnd' type='hidden'></div>" +
    "<button class='btn btn-success' type='submit'>儲存考試</button>" +
    "<button class='btn btn-secondary' type='button' id='examCancel'>清除</button>" +
    "</div></form></div>" +
    "<div class='table-wrap'><table class='exam-management-table'><thead><tr><th>開始日期</th><th>結束日期</th><th>操作</th></tr></thead><tbody>" +
    (examRows || "<tr><td colspan='3' class='empty'>尚無考試資料</td></tr>") + "</tbody></table></div>" +
    "<div class='panel'><h3>成績登錄</h3><div class='form-grid'>" +
    "<div class='field'><label>考試週期</label><select id='scoreExam' required><option value=''>請選擇考試週期</option>" + examOptions + "</select></div>" +
    "<div class='field'><label>班級篩選</label><select id='scoreClass'><option value=''>請選擇班級</option><option value='國一班'>國一班</option><option value='國二班'>國二班</option><option value='國三班'>國三班</option></select></div>" +
    "<div class='field'><label>科目</label><select id='scoreSubject' required><option value=''>請選擇科目</option>" +
    SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") + "</select></div>" +
    "<div class='field'><label>考試範圍</label><input id='scoreScope' placeholder='例如：第 1～2 課、XX(補考)' required></div></div>" +
    "<p class='muted'>選擇四項條件後，系統會列出該班實際修讀此科目的在學學生。可逐位儲存，也可填寫多位學生後一次儲存。</p>" +
    "<div id='bulkScoreEntryContent'><div class='empty'>請先選擇考試週期、班級、科目及考試範圍。</div></div>" +
    "<div class='toolbar'><button class='btn btn-success' type='button' id='saveBulkScoresButton'>儲存已填寫的成績</button></div>" +
    "<div id='bulkScoreEntryMessage' class='system-message' role='status'></div></div>";
  setDefaultExamDates();
  ["scoreExam", "scoreClass", "scoreSubject", "scoreScope"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      renderBulkScoreEntryRows();
    });
  });
  $("saveBulkScoresButton").addEventListener("click", saveBulkScores);
  $("bulkScoreEntryContent").addEventListener("click", async function (event) {
    const button = event.target.closest("[data-save-bulk-row]");
    if (button) await saveSingleBulkScoreRow(button.closest("tr"));
  });
  $("bulkScoreEntryContent").addEventListener("keydown", function (event) {
    const field = event.target.closest("[data-bulk-score], [data-bulk-grade], [data-bulk-status]");
    if (!field || event.key !== "Enter") return;
    event.preventDefault();
    const row = field.closest("tr[data-bulk-student]");
    const rows = Array.from($("bulkScoreEntryContent").querySelectorAll("tr[data-bulk-student]"));
    const currentIndex = rows.indexOf(row);
    const nextRow = rows[currentIndex + (event.shiftKey ? -1 : 1)];
    if (!nextRow) return;
    const selector = ["[data-bulk-score]", "[data-bulk-grade]", "[data-bulk-status]"].find(item => field.matches(item));
    const nextField = selector ? nextRow.querySelector(selector) : null;
    if (nextField && !nextField.disabled) {
      nextField.focus();
      if (nextField.tagName === "INPUT") nextField.select();
    }
  });
  $("examForm").addEventListener("submit", saveExam);
  $("examCancel").addEventListener("click", clearExamForm);
  // 日期選擇器改由頁面容器統一代理事件，避免動態重繪後點擊事件失效。
  content.addEventListener("click", function (event) {
    const trigger = event.target.closest("#examDateRangeDisplay, #examCalendarTrigger");
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      openExamDateCalendar();
      return;
    }
    const calendar = event.target.closest("#examDateCalendar");
    if (!calendar) return;
    const nav = event.target.closest("[data-exam-calendar-nav]");
    const day = event.target.closest("[data-exam-calendar-date]");
    if (nav) {
      event.preventDefault();
      examCalendarMonth.setMonth(examCalendarMonth.getMonth() + Number(nav.dataset.examCalendarNav));
      renderExamDateCalendar();
      return;
    }
    if (!day) return;
    event.preventDefault();
    const selectedDate = day.dataset.examCalendarDate;
    if (!examCalendarSelectingEnd) {
      $("examStart").value = selectedDate;
      $("examEnd").value = "";
      examCalendarSelectingEnd = true;
      const parts = selectedDate.split("-").map(Number);
      examCalendarMonth = new Date(parts[0], parts[1] - 1, 1);
    } else if (selectedDate < $("examStart").value) {
      $("examStart").value = selectedDate;
      $("examEnd").value = "";
    } else {
      $("examEnd").value = selectedDate;
      examCalendarSelectingEnd = false;
      examCalendarOpen = false;
    }
    updateExamDateRangeDisplay();
    renderExamDateCalendar();
  });
  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-exam]");
    const deleteButton = event.target.closest("[data-delete-exam]");
    if (editButton) editExam(editButton.dataset.editExam);
    if (deleteButton) await deleteExam(deleteButton.dataset.deleteExam);
  };
  renderBulkScoreEntryRows();
}

function getScoreEntryStudents() {
  const className = $("scoreClass") ? $("scoreClass").value : "";
  if (className) return activeStudentsByClassCache.get(className) || [];
  return activeStudentsCache;
}

function updateScoreStudentOptions(keepSelection) {
  const select = $("scoreStudent");
  if (!select) return;
  const previousId = keepSelection ? select.value : "";
  const students = getScoreEntryStudents();
  select.innerHTML = "<option value=''>請選擇學生</option>" + students.map(function (student) {
    return "<option value='" + escapeHtml(student.id) + "'>" +
      escapeHtml(student.student_code + "｜" + student.full_name) + "</option>";
  }).join("");
  let selectedIndex = -1;
  if (previousId) {
    for (let i = 0; i < students.length; i++) {
      if (String(students[i].id) === String(previousId)) {
        selectedIndex = i;
        break;
      }
    }
  }
  if (selectedIndex >= 0) select.value = previousId;
  const count = $("scoreStudentCount");
  if (count) count.textContent = "目前 " + students.length + " 位學生";
  const index = selectedIndex;
  if ($("scorePrevStudent")) $("scorePrevStudent").disabled = index <= 0;
  if ($("scoreNextStudent")) $("scoreNextStudent").disabled = index < 0 || index >= students.length - 1;
}

function moveScoreStudent(offset) {
  const students = getScoreEntryStudents();
  const index = students.findIndex(item => String(item.id) === String($("scoreStudent").value));
  const next = index < 0 ? 0 : index + offset;
  if (next < 0 || next >= students.length) return;
  $("scoreStudent").value = students[next].id;
  // 學生名單沒有改變，只更新前後筆狀態，不重建整份下拉選單。
  if ($("scorePrevStudent")) $("scorePrevStudent").disabled = next <= 0;
  if ($("scoreNextStudent")) $("scoreNextStudent").disabled = next >= students.length - 1;
  updateScoreMode(false);
  saveScoreEntryProgress();
}

function updateScoreMode(refreshStudentOptions) {
  const student = studentsByIdCache.get(String($("scoreStudent").value));
  const subject = $("scoreSubject").value;
  const grade3 = student && isGrade3Class(student.class_name);
  const grade3Math = student && isGrade3Math(student.class_name, subject);
  const grade3Other = !!grade3 && !grade3Math;
  $("generalAttendanceField").classList.toggle("hidden", !!grade3);
  $("normalScoreField").classList.toggle("hidden", !!grade3);
  $("grade3MathFields").classList.toggle("hidden", !grade3Math);
  $("grade3Fields").classList.toggle("hidden", !grade3Other);
  $("scoreValue").required = !grade3 && $("generalAttendance").value !== "請假";
  $("grade3MathScore").required = !!grade3Math;
  $("grade3MathGrade").required = !!grade3Math;
  $("correctCount").required = !!grade3Other;
  $("gradeLevel").required = !!grade3Other;
  if (refreshStudentOptions !== false) updateScoreStudentOptions(true);
  updateGrade3AbsenceMode(student);
}

function updateGrade3AbsenceMode(studentOverride) {
  const mathGrade = $("grade3MathGrade");
  const otherGrade = $("gradeLevel");
  updateGradeSelectStyle(mathGrade);
  updateGradeSelectStyle(otherGrade);
  const student = arguments.length
    ? studentOverride
    : $("scoreStudent") ? studentsByIdCache.get(String($("scoreStudent").value)) : null;
  const subject = $("scoreSubject") ? $("scoreSubject").value : "";
  const grade3Math = student && isGrade3Math(student.class_name, subject);
  const grade3Other = student && isGrade3Class(student.class_name) && !grade3Math;
  const mathAbsent = grade3Math && (mathGrade.value === "缺考" || mathGrade.value === "請假");
  const otherAbsent = grade3Other && (otherGrade.value === "缺考" || otherGrade.value === "請假");
  const generalLeave = !!student && !isGrade3Class(student.class_name) &&
    $("generalAttendance").value === "請假";
  $("scoreValue").required = !!student && !isGrade3Class(student.class_name) && !generalLeave;
  $("scoreValue").disabled = generalLeave;
  $("grade3MathScore").required = !!grade3Math && !mathAbsent;
  $("correctCount").required = !!grade3Other && !otherAbsent;
  $("grade3MathScore").disabled = !!mathAbsent;
  $("correctCount").disabled = !!otherAbsent;
  if (mathAbsent) $("grade3MathScore").value = "";
  if (otherAbsent) $("correctCount").value = "";
  if (generalLeave) $("scoreValue").value = "";
  const showHint = mathAbsent || otherAbsent || generalLeave;
  $("absenceHint").textContent = generalLeave || mathGrade.value === "請假" || otherGrade.value === "請假"
    ? "已選擇請假，不需要輸入分數或答對題數。"
    : "已選擇缺考，不需要輸入分數或答對題數。";
  $("absenceHint").classList.toggle("hidden", !showHint);
}

async function saveScore(event) {
  event.preventDefault();
  const saveButton = $("saveScoreButton");
  if (saveButton.disabled) return;
  const studentId = $("scoreStudent").value;
  const examId = $("scoreExam").value;
  const subject = $("scoreSubject").value;
  const scope = $("scoreScope").value.trim();
  const student = studentsByIdCache.get(String(studentId));
  if (!student || !examId || !subject || !scope) {
    showMessage("請完整選擇考試週期、學生、科目並填寫考試範圍。", "error", true);
    return;
  }

  const grade3 = isGrade3Class(student.class_name);
  const grade3Math = isGrade3Math(student.class_name, subject);
  let scoreValue = null;
  let correctCount = null;
  let gradeLevel = null;

  if (grade3Math) {
    gradeLevel = $("grade3MathGrade").value;
    if (!GRADE_OPTIONS.includes(gradeLevel)) {
      showMessage("請選擇正確的模擬考等級。", "error", true);
      return;
    }
    if (gradeLevel !== "缺考" && gradeLevel !== "請假") {
      scoreValue = Number($("grade3MathScore").value);
      if ($("grade3MathScore").value === "" || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
        showMessage("國三數學請輸入 0～100 分。", "error", true);
        return;
      }
    }
  } else if (grade3) {
    gradeLevel = $("gradeLevel").value;
    if (!GRADE_OPTIONS.includes(gradeLevel)) {
      showMessage("請選擇正確的模擬考等級。", "error", true);
      return;
    }
    if (gradeLevel !== "缺考" && gradeLevel !== "請假") {
      correctCount = Number($("correctCount").value);
      if ($("correctCount").value === "" || !Number.isInteger(correctCount) || correctCount < 0) {
        showMessage("請輸入正確的答對題數。", "error", true);
        return;
      }
    }
  } else if ($("generalAttendance").value === "請假") {
    gradeLevel = "請假";
  } else {
    scoreValue = Number($("scoreValue").value);
    if ($("scoreValue").value === "" || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
      showMessage("一般成績請輸入 0～100。", "error", true);
      return;
    }
  }

  const duplicate = scoresByStudentExamSubjectScopeCache.get(
    getScoreCompositeKey(studentId, examId, subject, scope)
  );

  if (duplicate) {
    const oldResult = duplicate.grade_level === "缺考" || duplicate.grade_level === "請假" ? duplicate.grade_level :
      grade3Math ? (duplicate.score == null ? "—" : duplicate.score) + " 分／" + (duplicate.grade_level || "未設定等級") :
      grade3 ? (duplicate.correct_count == null ? "—" : duplicate.correct_count) + " 題／" + (duplicate.grade_level || "未設定等級") :
      (duplicate.score == null ? "—" : duplicate.score) + " 分";
    const newResult = gradeLevel === "缺考" || gradeLevel === "請假" ? gradeLevel :
      grade3Math ? scoreValue + " 分／" + gradeLevel :
      grade3 ? correctCount + " 題／" + gradeLevel : scoreValue + " 分";
    const exam = examsByIdCache.get(String(examId));
    if (!confirm("發現相同資料，是否覆蓋原有成績？\n\n" +
      "考試：" + formatDateRange(exam) + "\n" +
      "學生：" + student.full_name + "（" + student.class_name + "）\n" +
      "科目：" + subject + "\n範圍：" + scope + "\n\n" +
      "原有成績：" + oldResult + "\n新輸入成績：" + newResult +
      "\n\n確認後會更新原有資料，不會新增第二筆。")) return;
  }

  const payload = {
    student_id: studentId, exam_id: examId, subject: subject, scope: scope,
    score: scoreValue, correct_count: correctCount, grade_level: gradeLevel
  };
  saveButton.disabled = true;
  saveButton.textContent = "儲存中……";
  try {
    const result = duplicate
      ? await db.from("scores").update(payload).eq("id", duplicate.id).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single()
      : await db.from("scores").insert(payload).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single();
    if (result.error) throw result.error;
    upsertScoreToLocalCache(result.data);
    scoreEntrySavedCount += 1;
    clearScoreEntryDraft();
    updateScoreStudentOptions(true);
    updateScoreMode();
    const counter = $("scoreEntryCounter");
    if (counter) counter.textContent = "本次頁面已成功登錄 " + scoreEntrySavedCount + " 筆";
    const savedExam = examsByIdCache.get(String(examId));
    const savedResultText = gradeLevel === "請假" || gradeLevel === "缺考" ? gradeLevel :
      grade3Math ? scoreValue + " 分／" + gradeLevel :
      grade3 ? correctCount + " 題／" + gradeLevel : scoreValue + " 分";
    showMessage((duplicate ? "原有成績已成功覆蓋。" : "成績已成功儲存。") +
      " 學生：" + student.full_name + "（" + student.class_name + "）；考試：" + formatDateRange(savedExam) +
      "；科目：" + subject + "；範圍：" + scope + "；結果：" + savedResultText +
      "。本次頁面累計完成 " + scoreEntrySavedCount + " 筆。", "success", true);
  } catch (error) {
    showMessage("成績儲存失敗，原輸入資料已保留。原因：" + error.message, "error", true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "儲存成績";
  }
}

// ==================================================
// 9. 學生管理
// ==================================================

function renderStudents() {
  const content = $("adminContent");
  const filter = $("studentStatusFilter") ? $("studentStatusFilter").value : "active";
  const classFilter = $("studentClassFilter") ? $("studentClassFilter").value : "all";
  const subjectFilter = $("studentSubjectFilter") ? $("studentSubjectFilter").value : "all";
  const keywordFilter = $("studentKeywordFilter") ? $("studentKeywordFilter").value : "";

  // 修課科目索引於管理資料載入時建立，搜尋／篩選時直接重用。
  const getActiveSubjects = studentId =>
    activeSubjectsByStudentCache.get(String(studentId)) || [];

  // 將狀態、班級與修課科目條件合併為單次學生快取遍歷，
  // 避免先建立 matchingStudents 再建立 enrolledStudents 兩份中間陣列。
  const visibleStudents = [];
  studentsCache.forEach(function (student) {
    const active = student.is_active !== false;
    if ((filter === "active" ? !active : active)) return;
    if (classFilter !== "all" && student.class_name !== classFilter) return;
    if (subjectFilter !== "all" && !getActiveSubjects(student.id).some(function (item) {
      return item.subject === subjectFilter;
    })) return;
    visibleStudents.push(student);
  });

  // 學生管理清單依學生編號自然排序，確保 G101、G102、G103……按數字由小到大排列。
  const studentCodeCollator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base"
  });
  visibleStudents.sort(function (a, b) {
    return studentCodeCollator.compare(
      String(a.student_code || "").trim(),
      String(b.student_code || "").trim()
    ) || String(a.full_name || "").localeCompare(String(b.full_name || ""), "zh-Hant");
  });

  const rows = visibleStudents.map(function (student) {
    const active = student.is_active !== false;
    return "<tr data-student-search='" + escapeHtml((String(student.student_code || "") + " " + String(student.full_name || "")).toLocaleLowerCase()) + "'>" +
      "<td>" + escapeHtml(student.student_code) + "</td>" +
      "<td>" + escapeHtml(student.full_name) + "</td>" +
      "<td>" + escapeHtml(student.class_name) + "</td>" +
      "<td class='student-subject-cell'>" + (getActiveSubjects(student.id).map(item => escapeHtml(({ "國文":"國", "英文":"英", "數學":"數", "自然":"自" })[item.subject] || item.subject)).join("、") || "<span class='muted'>未設定</span>") + "</td>" +
      "<td>" + (active
        ? "<span class='student-status-active'>在學</span>"
        : "<span class='student-status-inactive'>離班</span>") + "</td>" +
      "<td class='student-action-cell action-cell'><div class='action-buttons'>" +
        "<button class='btn btn-small' data-edit-student='" + escapeHtml(student.id) + "'>修改</button>" +
        "<button class='btn " + (active ? "btn-danger" : "btn-success") + " btn-small student-status-action' data-toggle-student='" + escapeHtml(student.id) + "' title='" + (active ? "離班" : "重新啟用") + "' aria-label='" + (active ? "離班" : "重新啟用") + "'>" + (active ? "離班" : "<span class='student-status-enable-icon' aria-hidden='true'>↻</span><span>啟用</span>") + "</button>" +
      "</div></td></tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>學生管理</h2>" +
    "<div class='panel'><h3 id='studentFormTitle'>新增學生</h3>" +
      "<form id='studentForm'><input type='hidden' id='studentEditId'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>班級</label><select id='studentClass' required><option value=''>請選擇班級</option><option>國一班</option><option>國二班</option><option>國三班</option></select></div>" +
          "<div class='field'><label>學生編號</label><input id='studentCode' required readonly></div>" +
          "<div class='field'><label>學生姓名</label><input id='studentName' required></div>" +
        "</div>" +
        "<div class='field student-subject-field'><label>勾選科目</label><div class='student-subject-options'>" +
          SUBJECTS.map(subject => "<label class='student-subject-option'><input type='checkbox' name='studentSubject' value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</label>").join("") +
        "</div><small class='muted'>請勾選學生實際修讀的科目；未勾選的科目不會列入漏登檢查。日後修課異動可在此修改。</small></div>" +
        "<div class='toolbar' style='display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:nowrap;margin-top:12px'>" +
          "<button class='btn btn-success' type='submit' style='flex:1'>儲存學生資料</button>" +
          "<button class='btn btn-secondary' type='button' id='studentCancel' style='flex:1'>清除</button>" +
        "</div>" +
      "</form></div>" +
      "<div class='toolbar student-filter-toolbar'>" +
        "<label for='studentStatusFilter'><strong>學生狀態：</strong></label>" +
        "<select id='studentStatusFilter'><option value='active'>在學學生</option><option value='inactive'>離班學生</option></select>" +
        "<label for='studentClassFilter'><strong>班級：</strong></label>" +
        "<select id='studentClassFilter'><option value='all'>全部學生</option><option value='國一班'>國一班</option><option value='國二班'>國二班</option><option value='國三班'>國三班</option></select>" +
        "<label for='studentSubjectFilter'><strong>修課科目：</strong></label>" +
        "<select id='studentSubjectFilter'><option value='all'>全部科目</option>" +
          SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") +
        "</select>" +
        "<label for='studentKeywordFilter'><strong>搜尋：</strong></label>" +
        "<input id='studentKeywordFilter' class='student-search-input' type='search' placeholder='輸入姓名或學生編號' aria-label='搜尋學生姓名或學生編號'>" +
        "<button class='btn btn-small btn-secondary' type='button' id='studentClearFilters'>清除篩選</button>" +
        "<span id='studentSubjectCount' class='student-filter-count'>符合條件 " + visibleStudents.length + " 人</span>" +
      "</div>" +
      "<div class='table-wrap'><table class='student-management-table'>" +
        "<thead><tr><th>學生編號</th><th>姓名</th><th>班級</th><th>修課科目</th><th>狀態</th><th>操作</th></tr></thead>" +
        "<tbody>" + (rows || "<tr><td colspan='6' class='empty'>目前沒有符合條件的學生</td></tr>") + "</tbody>" +
      "</table></div>";

  $("studentStatusFilter").value = filter;
  $("studentClassFilter").value = classFilter;
  $("studentSubjectFilter").value = subjectFilter;
  $("studentKeywordFilter").value = keywordFilter;
  // 學生清單每次篩選重繪才會更換；搜尋時沿用已取得的列，避免重複 DOM 查詢與陣列建立。
  const studentRows = Array.from(content.querySelectorAll(".student-management-table tbody tr[data-student-search]"));
  function applyStudentKeyword() {
    const keyword = $("studentKeywordFilter").value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    studentRows.forEach(function (row) {
      const matched = !keyword || row.dataset.studentSearch.includes(keyword);
      row.hidden = !matched;
      if (matched) visibleCount++;
    });
    $("studentSubjectCount").textContent = "符合條件 " + visibleCount + " 人";
  }
  applyStudentKeyword();
  $("studentStatusFilter").addEventListener("change", renderStudents);
  $("studentClassFilter").addEventListener("change", renderStudents);
  $("studentSubjectFilter").addEventListener("change", renderStudents);
  $("studentKeywordFilter").addEventListener("input", applyStudentKeyword);
  $("studentClearFilters").addEventListener("click", function () {
    $("studentStatusFilter").value = "active";
    $("studentClassFilter").value = "all";
    $("studentSubjectFilter").value = "all";
    $("studentKeywordFilter").value = "";
    renderStudents();
  });
  $("studentForm").addEventListener("submit", saveStudent);
  $("studentClass").addEventListener("change", function () {
    if (!$("studentEditId").value) {
      $("studentCode").value = getNextStudentCode($("studentClass").value);
    }
  });
  $("studentCancel").addEventListener("click", clearStudentForm);

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-student]");
    const toggleButton = event.target.closest("[data-toggle-student]");
    if (editButton) editStudent(editButton.dataset.editStudent);
    if (toggleButton) await toggleStudentStatus(toggleButton.dataset.toggleStudent);
  };
}

function getNextStudentCode(className) {
  const prefixMap = { "國一班": "G1", "國二班": "G2", "國三班": "G3" };
  const prefix = prefixMap[className];
  if (!prefix) return "";

  const maxNumber = studentsCache.reduce(function (max, student) {
    const code = String(student.student_code || "").trim().toUpperCase();
    const match = code.match(new RegExp("^" + prefix + "(\\d+)$"));
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  return prefix + String(maxNumber + 1).padStart(2, "0");
}

function clearStudentForm() {
  $("studentForm").reset();
  $("studentEditId").value = "";
  $("studentCode").readOnly = true;
  $("studentCode").value = getNextStudentCode($("studentClass").value);
  document.querySelectorAll("input[name='studentSubject']").forEach(checkbox => { checkbox.checked = false; });
  $("studentFormTitle").textContent = "新增學生";
}

function editStudent(id) {
  const student = studentsByIdCache.get(String(id));
  if (!student) return;

  $("studentEditId").value = student.id;
  $("studentCode").readOnly = false;
  $("studentCode").value = student.student_code || "";
  $("studentName").value = student.full_name || "";
  $("studentClass").value = student.class_name || "";
  const activeSubjectSet = new Set(
    (activeSubjectsByStudentCache.get(String(student.id)) || []).map(item => item.subject)
  );
  document.querySelectorAll("input[name='studentSubject']").forEach(function (checkbox) {
    checkbox.checked = activeSubjectSet.has(checkbox.value);
  });
  $("studentFormTitle").textContent = "修改學生資料";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveStudent(event) {
  event.preventDefault();

  const id = $("studentEditId").value;
  const payload = {
    student_code: $("studentCode").value.trim(),
    full_name: $("studentName").value.trim(),
    class_name: $("studentClass").value
  };

  if (!payload.student_code || !payload.full_name || !payload.class_name) {
    showMessage("請完整填寫學生編號、姓名及班級。", "error");
    return;
  }

  const normalizedCode = payload.student_code.toLocaleUpperCase();
  const duplicate = studentsCache.find(function (student) {
    return String(student.id) !== String(id) &&
      String(student.student_code || "").trim().toLocaleUpperCase() === normalizedCode;
  });
  if (duplicate) {
    showMessage("學生編號「" + payload.student_code + "」已被 " +
      (duplicate.full_name || "其他學生") + " 使用，請確認編號後再儲存。", "error");
    $("studentCode").focus();
    return;
  }

  const submitButton = $("studentForm").querySelector("button[type='submit']");
  const originalButtonText = submitButton ? submitButton.textContent : "";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "儲存中…";
  }

  try {
    let studentId = id;
    let savedStudent = null;
    if (id) {
      const result = await db.from("students").update(payload).eq("id", id);
      if (result.error) throw result.error;
      savedStudent = { ...studentsByIdCache.get(String(id)), ...payload };
    } else {
      const result = await db.from("students")
        .insert(Object.assign({ is_active: true }, payload))
        .select("id, student_code, full_name, class_name, is_active")
        .single();
      if (result.error) throw result.error;
      studentId = result.data.id;
      savedStudent = result.data;
    }

    const selectedSubjects = Array.from(document.querySelectorAll("input[name='studentSubject']:checked"))
      .map(checkbox => checkbox.value);
    const subjectRows = SUBJECTS.map(subject => ({
      student_id: studentId,
      subject: subject,
      is_active: selectedSubjects.includes(subject)
    }));

    const subjectResult = await db.from("student_subjects")
      .upsert(subjectRows, { onConflict: "student_id,subject" });
    if (subjectResult.error) throw subjectResult.error;

    // 學生資料及修課科目已成功寫入後，局部同步快取，避免再次讀取整套後台資料。
    if (id) {
      studentsCache = studentsCache.map(student =>
        String(student.id) === String(studentId) ? savedStudent : student
      );
    } else {
      studentsCache.push(savedStudent);
    }
    studentSubjectsCache = studentSubjectsCache.filter(item =>
      String(item.student_id) !== String(studentId)
    ).concat(subjectRows);
    rebuildAdminEntityIndexes();
    rebuildActiveSubjectsByStudentCache();

    clearStudentForm();
    renderStudents();
    showMessage(id ? "學生資料及修課科目已更新。" : "學生及修課科目已新增。", "success");

  } catch (error) {
    showMessage("學生資料儲存失敗：" + error.message, "error");
  } finally {
    if (submitButton && submitButton.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText || "儲存學生資料";
    }
  }
}

async function toggleStudentStatus(id) {
  const student = studentsByIdCache.get(String(id));
  if (!student) {
    showMessage("找不到學生資料，請重新整理。", "error");
    return;
  }

  const currentlyActive = student.is_active !== false;
  const nextStatus = !currentlyActive;
  const action = nextStatus ? "重新啟用" : "停用";

  const warning = currentlyActive
    ? "\n\n停用後：\n・不會出現在成績登錄學生選單。\n・不會列入尚未登錄成績的學生檢查。\n・既有成績及家長綁定資料會保留。\n・家長仍可查詢過往已公布的成績。"
    : "\n\n啟用後，學生會重新出現在成績登錄及家長綁定選單。";

  if (!confirm("確定" + action + "學生「" + student.full_name + "」嗎？" + warning)) return;

  try {
    const result = await db.from("students")
      .update({ is_active: nextStatus })
      .eq("id", id);

    if (result.error) throw result.error;

    // 學生狀態變更只影響學生快取與依賴學生狀態的索引，不必重載整套管理資料。
    student.is_active = nextStatus;
    rebuildAdminEntityIndexes();
    renderStudents();
    showMessage("學生「" + student.full_name + "」已" + action + "。", "success");
  } catch (error) {
    showMessage(action + "學生失敗：" + error.message, "error");
  }
}

async function deleteStudent(id) {
  const student = studentsByIdCache.get(String(id));
  if (!student) return;

  if (!confirm("確定刪除學生「" + student.full_name + "」？\n\n若此學生仍有成績或家長綁定，資料庫可能會拒絕刪除。")) return;

  try {
    const result = await db.from("students").delete().eq("id", id);
    if (result.error) throw result.error;

    // 刪除學生後同步受影響的本地快取，避免重新載入整套管理資料。
    studentsCache = studentsCache.filter(item => String(item.id) !== String(id));
    studentSubjectsCache = studentSubjectsCache.filter(item => String(item.student_id) !== String(id));
    scoresCache = scoresCache.filter(item => {
      if (String(item.student_id) !== String(id)) return true;
      scoresByIdCache.delete(String(item.id));
      scoresByStudentExamSubjectScopeCache.delete(
        getScoreCompositeKey(item.student_id, item.exam_id, item.subject, item.scope)
      );
      return false;
    });
    guardianLinksCache = guardianLinksCache.filter(item => String(item.student_id) !== String(id));
    missingExclusionsCache = missingExclusionsCache.filter(item => String(item.student_id) !== String(id));
    rebuildAdminEntityIndexes();
    rebuildActiveSubjectsByStudentCache();
    rebuildGuardianBindingIndexes();
    invalidateAdminHighestPreviewCache();
    renderStudents();
    showMessage("學生資料已刪除。", "success");

  } catch (error) {
    showMessage("刪除失敗：" + error.message, "error");
  }
}

// ==================================================
// 10. 考試管理
// ==================================================


function clearExamForm() {
  $("examForm").reset();
  $("examEditId").value = "";
  $("examFormTitle").textContent = "新增考試";
  setDefaultExamDates();
}

function editExam(id) {
  const exam = examsByIdCache.get(String(id));
  if (!exam) return;

  $("examEditId").value = exam.id;
  $("examStart").value = exam.start_date || "";
  $("examEnd").value = exam.end_date || "";
  updateExamDateRangeDisplay();
  examCalendarOpen = false;
  examCalendarSelectingEnd = false;
  renderExamDateCalendar();
  $("examFormTitle").textContent = "修改考試日期";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveExam(event) {
  event.preventDefault();

  const id = $("examEditId").value;
  const startDate = $("examStart").value;
  const endDate = $("examEnd").value;

  if (!startDate || !endDate) {
    showMessage("請填寫開始日期及結束日期。", "error");
    return;
  }

  if (endDate < startDate) {
    showMessage("結束日期不可早於開始日期。", "error");
    $("examDateRangeDisplay").focus();
    return;
  }

  const duplicate = examsCache.find(function (exam) {
    return String(exam.id) !== String(id) &&
      String(exam.start_date || "") === startDate &&
      String(exam.end_date || "") === endDate;
  });
  if (duplicate) {
    alert(
      "無法新增或修改考試！\n\n" +
      "資料庫中已經存在相同的考試日期區間：\n" +
      formatDateRange(duplicate) +
      "\n\n為避免覆蓋原有考試及成績，系統已取消這次儲存。"
    );
    $("examDateRangeDisplay").focus();
    return;
  }

  if (id) {
    let linkedScoreCount = 0;
    scoresCache.forEach(score => {
      if (String(score.exam_id) === String(id)) linkedScoreCount += 1;
    });
    if (linkedScoreCount > 0 && !confirm(
      "這個考試場次目前已有 " + linkedScoreCount + " 筆成績。\n\n" +
      "修改日期只會改變考試週期的顯示，不會刪除或搬移成績。\n" +
      "確定要更新日期嗎？"
    )) return;
  }

  const payload = {
    title: startDate === endDate ? startDate : startDate + "～" + endDate,
    start_date: startDate,
    end_date: endDate
  };

  const submitButton = $("examForm").querySelector("button[type='submit']");
  const originalButtonText = submitButton ? submitButton.textContent : "";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "儲存中…";
  }

  try {
    const result = id
      ? await db.from("exams").update(payload).eq("id", id)
      : await db.from("exams").insert(payload).select("id, title, start_date, end_date").single();

    if (result.error) throw result.error;

    if (id) {
      examsCache = examsCache.map(function (exam) {
        return String(exam.id) === String(id)
          ? { ...exam, ...payload }
          : exam;
      });
    } else {
      // 新增場次回傳資料庫產生的 ID，直接同步本地快取，避免完整重載。
      examsCache.push(result.data);
    }
    rebuildExamIndexes();
    renderScoreEntry();
    showMessage(id ? "考試日期已更新。" : "考試場次已新增。", "success");

  } catch (error) {
    showMessage("考試資料儲存失敗：" + error.message, "error");
  } finally {
    if (submitButton && submitButton.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText || "儲存考試";
    }
  }
}

async function deleteExam(id) {
  const exam = examsByIdCache.get(String(id));
  if (!exam) return;

  if (!confirm(
    "確定刪除考試場次「" + formatDateRange(exam) + "」？\n\n" +
    "若已有成績資料，資料庫可能會拒絕刪除。"
  )) return;

  try {
    const result = await db.from("exams").delete().eq("id", id);
    if (result.error) throw result.error;

    examsCache = examsCache.filter(function (item) {
      return String(item.id) !== String(id);
    });
    rebuildExamIndexes();
    renderScoreEntry();
    showMessage("考試資料已刪除。", "success");

  } catch (error) {
    showMessage("刪除考試失敗：" + error.message, "error");
  }
}

// ==================================================
// 11. 家長帳號建立、家長及學生綁定
// ==================================================

function renderGuardians() {
  const content = $("adminContent");
  const studentsById = studentsByIdCache;
  const parentsById = parentProfilesByIdCache;
  const firstLinkedStudentByGuardian = new Map();
  const linkedStudentIds = new Set();
  const boundGuardianIds = new Set();

  guardianLinksCache.forEach(function (link) {
    const guardianId = String(link.guardian_id);
    const studentId = String(link.student_id);
    linkedStudentIds.add(studentId);
    boundGuardianIds.add(guardianId);
    if (!firstLinkedStudentByGuardian.has(guardianId)) {
      firstLinkedStudentByGuardian.set(guardianId, studentsById.get(studentId) || null);
    }
  });

  const parentOptions = profilesCache.map(function (profile) {
    const loginIdentity = profile.email || profile.phone || "未設定登入帳號";
    const linkedStudent = firstLinkedStudentByGuardian.get(String(profile.id));
    const parentLabel = linkedStudent
      ? linkedStudent.full_name + "家長"
      : (profile.display_name || loginIdentity);
    return "<option value='" + escapeHtml(profile.id) + "'>" +
      escapeHtml(parentLabel + "｜" + loginIdentity) +
      "</option>";
  }).join("");

  // 家長綁定的學生下拉選單固定依國一、國二、國三排序；同班學生維持原有資料順序。
  const activeStudents = activeStudentsCache.slice().sort(function (a, b) {
    const aRank = classOrder.indexOf(a.class_name);
    const bRank = classOrder.indexOf(b.class_name);
    const normalizedARank = aRank < 0 ? classOrder.length : aRank;
    const normalizedBRank = bRank < 0 ? classOrder.length : bRank;
    return normalizedARank - normalizedBRank;
  });
  const studentOptions = activeStudents.map(function (student) {
    return "<option value='" + escapeHtml(student.id) + "'>" +
      escapeHtml(student.class_name + "｜" + student.student_code + "｜" + student.full_name) +
      "</option>";
  }).join("");

  // 靜態列資料只建立一次；搜尋時只比對預先整理好的文字，避免每次輸入都重建所有 HTML。
  const guardianRowItems = [];

  guardianLinksCache.forEach(function (link) {
    const parent = parentsById.get(String(link.guardian_id));
    const student = studentsById.get(String(link.student_id));
    if (!student) return;

    const loginIdentity = parent ? (parent.email || parent.phone || "") : "";
    const parentName = student.full_name + "家長";
    const searchText = [
      student.full_name,
      student.student_code,
      student.class_name,
      loginIdentity,
      parentName
    ].join(" ").toLocaleLowerCase();

    guardianRowItems.push({
      className: student.class_name,
      searchText: searchText,
      html:
        "<tr>" +
          "<td>" + escapeHtml(student.class_name) + "</td>" +
          "<td>" + escapeHtml(student.full_name) + "</td>" +
          "<td>" + (parent
            ? "<strong>" + escapeHtml(parentName) + "</strong><br><span class='muted'>" + escapeHtml(loginIdentity || "—") + "</span>"
            : "—") + "</td>" +
          "<td><span class='guardian-status-bound'>已綁定</span></td>" +
          "<td class='action-cell'>" +
            "<div class='action-buttons'>" +
              (parent ? "<button class='btn btn-small' data-edit-parent='" + escapeHtml(parent.id) + "'>修改</button>" : "") +
              "<button class='btn btn-danger btn-small' data-unbind='" +
                escapeHtml(link.guardian_id) + "|" +
                escapeHtml(link.student_id) + "'>解除</button>" +
              (parent ? "<button class='btn btn-small' data-reset-parent='" + escapeHtml(parent.id) + "'>重設密碼</button>" : "") +
              (parent ? "<button class='btn btn-danger btn-small' data-delete-parent='" + escapeHtml(parent.id) + "'>刪除帳號</button>" : "") +
            "</div>" +
          "</td>" +
        "</tr>"
    });
  });

  profilesCache.forEach(function (parent) {
    if (parent.role !== "parent") return;
    const parentId = String(parent.id);
    if (boundGuardianIds.has(parentId)) return;

    const loginIdentity = parent.email || parent.phone || "";
    const parentName = parent.display_name || loginIdentity || "未設定家長";
    guardianRowItems.push({
      className: "",
      searchText: [parentName, loginIdentity, "尚未綁定學生"].join(" ").toLocaleLowerCase(),
      html:
        "<tr class='guardian-unbound-row'>" +
          "<td>—</td>" +
          "<td>—</td>" +
          "<td><strong>" + escapeHtml(parentName) + "</strong><br><span class='muted'>" + escapeHtml(loginIdentity || "—") + "</span></td>" +
          "<td><span class='guardian-status-unbound'>尚未綁定學生</span></td>" +
          "<td class='action-cell'><div class='action-buttons'>" +
            "<button class='btn btn-small' data-edit-parent='" + escapeHtml(parent.id) + "'>修改</button>" +
            "<button class='btn btn-small' data-reset-parent='" + escapeHtml(parent.id) + "'>重設密碼</button>" +
            "<button class='btn btn-danger btn-small' data-delete-parent='" + escapeHtml(parent.id) + "'>刪除帳號</button>" +
          "</div></td>" +
        "</tr>"
    });
  });

  activeStudents.forEach(function (student) {
    if (linkedStudentIds.has(String(student.id))) return;
    guardianRowItems.push({
      className: student.class_name,
      searchText: [
        student.full_name,
        student.student_code,
        student.class_name,
        "尚未綁定家長"
      ].join(" ").toLocaleLowerCase(),
      html:
        "<tr class='guardian-unbound-row'>" +
          "<td>" + escapeHtml(student.class_name) + "</td>" +
          "<td>" + escapeHtml(student.full_name) + "</td>" +
          "<td>—</td>" +
          "<td><span class='guardian-status-unbound'>尚未綁定家長</span></td>" +
          "<td class='action-cell'>請建立家長帳號並完成綁定</td>" +
        "</tr>"
    });
  });

  // 預先建立班級索引；選定班級時只掃描該班列資料，全部班級仍沿用原始順序。
  // 全部班級檢視時固定依國一、國二、國三排列；未綁定家長（無班級）排在最後。
  // 使用穩定排序，班級內原有資料順序不變。
  guardianRowItems.sort(function (a, b) {
    const aIndex = a.className ? classOrder.indexOf(a.className) : classOrder.length;
    const bIndex = b.className ? classOrder.indexOf(b.className) : classOrder.length;
    const aRank = aIndex < 0 ? classOrder.length : aIndex;
    const bRank = bIndex < 0 ? classOrder.length : bIndex;
    return aRank - bRank;
  });

  const guardianRowsByClass = new Map();
  guardianRowItems.forEach(function (item) {
    if (!item.className) return;
    if (!guardianRowsByClass.has(item.className)) guardianRowsByClass.set(item.className, []);
    guardianRowsByClass.get(item.className).push(item);
  });

  function buildGuardianRows() {
    const selectedClass = $("guardianClass") ? $("guardianClass").value : "";
    const keyword = $("guardianKeyword")
      ? $("guardianKeyword").value.trim().toLocaleLowerCase()
      : "";
    const candidates = selectedClass
      ? (guardianRowsByClass.get(selectedClass) || [])
      : guardianRowItems;
    const rows = [];

    candidates.forEach(function (item) {
      if (keyword && !item.searchText.includes(keyword)) return;
      rows.push(item.html);
    });

    return { html: rows.join(""), count: rows.length };
  }

  content.innerHTML =
    "<h2 class='section-title'>家長帳號管理</h2>" +

    "<div class='panel'><h3>新增家長帳號</h3>" +
      "<p class='muted'>可選擇使用 Email 或手機號碼建立家長帳號。手機帳號不需要簡訊驗證。</p>" +
      "<form id='createParentForm'><div class='form-grid'>" +
        "<div class='field'><label>帳號類型</label><select id='newParentAccountType'><option value='email'>Email 登入</option><option value='phone'>手機號碼登入</option></select></div>" +
        "<div class='field'><label>家長 Email／手機號碼</label><input id='newParentAccount' type='text' placeholder='請輸入 Email 或 0912345678' autocomplete='off' required></div>" +
        "<div class='field'><label>綁定學生</label><select id='newParentStudent' required><option value=''>請選擇學生</option>" + studentOptions + "</select></div>" +
      "</div>" +
      "<p class='muted'>系統會產生一次性隨機臨時密碼。家長首次登入時，必須先設定自己的新密碼。</p>" +
      "<button class='btn btn-success' type='submit' id='createParentButton'>建立家長帳號</button>" +
      "</form></div>" +

    "<div class='panel'><h3>既有家長帳號與學生綁定</h3>" +
      "<form id='guardianForm'><div class='form-grid'>" +
        "<div class='field'><label>家長帳號</label><select id='guardianParent' required><option value=''>請選擇家長</option>" + parentOptions + "</select></div>" +
        "<div class='field'><label>學生</label><select id='guardianStudent' required><option value=''>請選擇學生</option>" + studentOptions + "</select></div>" +
      "</div><button class='btn btn-success' type='submit' id='saveGuardianBindingButton'>建立綁定</button></form></div>" +

    "<div class='panel'>" +
      "<h3>既有家長帳號與學生綁定清單</h3>" +
      "<div class='toolbar guardian-filter-toolbar'>" +
        "<label for='guardianClass'><strong>班級：</strong></label>" +
        "<select id='guardianClass'>" +
          "<option value=''>全部班級</option>" +
          "<option value='國一班'>國一班</option>" +
          "<option value='國二班'>國二班</option>" +
          "<option value='國三班'>國三班</option>" +
        "</select>" +
        "<label for='guardianKeyword'><strong>搜尋：</strong></label>" +
        "<input id='guardianKeyword' type='search' placeholder='姓名、學生編號或家長帳號' aria-label='搜尋家長或學生' style='min-width:220px;flex:1'>" +
        "<span id='guardianResultCount' class='muted' style='font-size: 14px'></span>" +
      "</div>" +
      "<div class='table-wrap'><table class='guardian-management-table'>" +
        "<thead><tr><th>班級</th><th>學生姓名</th><th>家長名稱／帳號</th><th>綁定狀態</th><th>操作</th></tr></thead>" +
        "<tbody id='guardianRows'>" +
          (buildGuardianRows().html || "<tr><td colspan='5' class='empty'>目前沒有家長帳號資料</td></tr>") +
        "</tbody>" +
      "</table></div>" +
    "</div>";

  $("createParentForm").addEventListener("submit", createParentAccount);
  $("guardianForm").addEventListener("submit", saveGuardianBinding);

  function refreshGuardianRows() {
    const result = buildGuardianRows();
    $("guardianRows").innerHTML =
      result.html || "<tr><td colspan='5' class='empty'>沒有符合條件的家長或學生</td></tr>";
    const counter = $("guardianResultCount");
    if (counter) counter.textContent = "符合條件 " + result.count + " 筆";
  }

  $("guardianClass").addEventListener("change", refreshGuardianRows);
  $("guardianKeyword").addEventListener("input", refreshGuardianRows);
  refreshGuardianRows();

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-parent]");
    const unbindButton = event.target.closest("[data-unbind]");
    const resetButton = event.target.closest("[data-reset-parent]");
    const deleteButton = event.target.closest("[data-delete-parent]");

    if (editButton) {
      await editParentAccount(editButton.dataset.editParent);
      return;
    }

    if (unbindButton) {
      const parts = unbindButton.dataset.unbind.split("|");
      await removeGuardianBinding(parts[0], parts[1]);
      return;
    }

    if (resetButton) {
      await resetParentPassword(resetButton.dataset.resetParent);
      return;
    }

    if (deleteButton) {
      await deleteParentAccount(deleteButton.dataset.deleteParent);
    }
  };
}

// ==================================================
// 11-1. 刪除尚未綁定學生的家長帳號
// ==================================================

async function deleteUnboundParentAccount(parentId) {
  const parent = parentProfilesByIdCache.get(String(parentId));

  if (!parent) {
    showMessage("找不到這位家長的帳號資料，請重新整理。", "error");
    return;
  }

  const hasBinding = guardiansWithBindingsCache.has(String(parentId));

  if (hasBinding) {
    showMessage("這個家長帳號仍有學生綁定，請先解除所有綁定後再刪除。", "error");
    return;
  }

  if (!confirm(
    "確定要永久刪除這個未綁定的家長帳號嗎？\n\n" +
    "家長姓名：" + (parent.display_name || "未設定姓名") + "\n" +
    "登入 Email：" + (parent.email || "—") + "\n\n" +
    "此操作會同時刪除 Supabase Auth 登入帳號及 profiles 資料，且無法復原。"
  )) return;

  try {
    const result = await db.functions.invoke(
      "admin-delete-parent-account",
      { body: { parentId: parentId } }
    );

    if (result.error) {
      throw new Error(
        result.data && result.data.error
          ? result.data.error
          : result.error.message
      );
    }

    const data = result.data || {};
    if (!data.success) {
      throw new Error(data.error || "家長帳號刪除失敗。");
    }

    // 未綁定家長刪除成功後，只移除該筆家長快取並重建索引。
    profilesCache = profilesCache.filter(
      profile => String(profile.id) !== String(parentId)
    );
    rebuildAdminEntityIndexes();
    renderGuardians();
    showMessage("家長登入帳號及資料已成功刪除。", "success");

  } catch (error) {
    console.error("刪除家長帳號失敗：", error);
    showMessage("刪除家長帳號失敗：" + error.message, "error");
  }
}

// ==================================================
// 11-2. 修改家長姓名及 Email
// ==================================================

async function editParentAccount(parentId) {
  const parent = parentProfilesByIdCache.get(String(parentId));

  if (!parent) {
    showMessage("找不到這位家長的帳號資料，請重新整理。", "error");
    return;
  }

  const displayNameInput = prompt(
    "請輸入家長姓名：",
    parent.display_name || ""
  );

  if (displayNameInput === null) return;

  const displayName = displayNameInput.trim();

  if (!displayName) {
    showMessage("家長姓名不可空白。", "error");
    return;
  }

  const isPhoneAccount = Boolean(parent.phone) || !parent.email;
  let email = "";
  let phone = "";

  if (isPhoneAccount) {
    const phoneInput = prompt(
      "請輸入家長登入手機號碼：",
      parent.phone || ""
    );

    if (phoneInput === null) return;

    phone = phoneInput.trim().replace(/[\\s()-]/g, "");

    if (!/^09\\d{8}$/.test(phone) &&
        !/^8869\\d{8}$/.test(phone) &&
        !/^\\+8869\\d{8}$/.test(phone)) {
      showMessage("請輸入有效的台灣手機號碼，例如 0912345678。", "error");
      return;
    }

    if (/^09\\d{8}$/.test(phone)) {
      phone = "+886" + phone.substring(1);
    } else if (/^8869\\d{8}$/.test(phone)) {
      phone = "+" + phone;
    }

    const duplicate = profilesCache.find(function (item) {
      return String(item.id) !== String(parentId) &&
        String(item.phone || "").replace(/[\\s()-]/g, "") === phone;
    });

    if (duplicate) {
      showMessage("這支手機號碼已經被其他家長帳號使用。", "error");
      return;
    }
  } else {
    const emailInput = prompt(
      "請輸入家長登入 Email：",
      parent.email || ""
    );

    if (emailInput === null) return;

    email = emailInput.trim().toLowerCase();

    const emailPattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

    if (!emailPattern.test(email)) {
      showMessage("請輸入有效的 Email 地址。", "error");
      return;
    }

    const duplicate = profilesCache.find(function (item) {
      return String(item.id) !== String(parentId) &&
        String(item.email || "").toLowerCase() === email;
    });

    if (duplicate) {
      showMessage("這個 Email 已經被其他家長帳號使用。", "error");
      return;
    }
  }

  const accountLabel = isPhoneAccount ? "手機號碼" : "Email";
  const oldAccount = isPhoneAccount
    ? (parent.phone || "—")
    : (parent.email || "—");
  const newAccount = isPhoneAccount ? phone : email;

  if (!confirm(
    "確認修改家長資料嗎？\n\n" +
    "原姓名：" + (parent.display_name || "—") + "\n" +
    "新姓名：" + displayName + "\n\n" +
    "原" + accountLabel + "：" + oldAccount + "\n" +
    "新" + accountLabel + "：" + newAccount + "\n\n" +
    "家長密碼及學生綁定不會變更。"
  )) return;

  try {
    const result = await db.functions.invoke(
      "admin-update-parent-account",
      {
        body: isPhoneAccount
          ? {
              parentId: parentId,
              displayName: displayName,
              phone: phone
            }
          : {
              parentId: parentId,
              displayName: displayName,
              email: email
            }
      }
    );

    if (result.error) {
      throw new Error(
        result.data && result.data.error
          ? result.data.error
          : result.error.message
      );
    }

    const data = result.data || {};

    if (!data.success) {
      throw new Error(data.error || "家長資料更新失敗。");
    }

    // 家長資料更新只同步該筆 profiles 快取，學生與成績資料無須重載。
    profilesCache = profilesCache.map(function (profile) {
      if (String(profile.id) !== String(parentId)) return profile;
      return {
        ...profile,
        display_name: displayName,
        ...(isPhoneAccount
          ? { phone: phone }
          : { email: email })
      };
    });
    rebuildAdminEntityIndexes();
    renderGuardians();

    showMessage(
      "家長姓名及登入" + accountLabel + "已成功更新。",
      "success"
    );

  } catch (error) {
    console.error("修改家長資料失敗：", error);
    showMessage("修改家長資料失敗：" + error.message, "error");
  }
}

// ==================================================
// 11-3. 呼叫 Edge Function 建立家長帳號
// ==================================================

async function createParentAccount(event) {
  event.preventDefault();

  const accountType = $("newParentAccountType").value;
  const accountInput = $("newParentAccount").value.trim();
  const studentId = $("newParentStudent").value;
  const button = $("createParentButton");

  let email = null;
  let phone = null;
  let loginLabel = accountInput;

  try {
    if (accountType === "phone") {
      phone = normalizeTaiwanMobile(accountInput);
      loginLabel = phone;
    } else {
      email = accountInput.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("請輸入有效的 Email 地址。");
      }
      loginLabel = email;
    }
  } catch (error) {
    showMessage(error.message, "error");
    return;
  }

  const displayName = loginLabel;

  // 先比對目前已載入的家長帳號，避免重複呼叫 Edge Function。
  const duplicateParent = profilesCache.find(function (profile) {
    if (accountType === "phone") {
      const existingPhone = profile.phone
        ? normalizeTaiwanMobile(profile.phone)
        : "";
      return existingPhone && existingPhone === phone;
    }
    return String(profile.email || "").trim().toLowerCase() === email;
  });

  if (duplicateParent) {
    showMessage(
      "此 " + (accountType === "phone" ? "手機號碼" : "Email") +
      " 已經建立過家長帳號，請勿重複建立。若要新增學生，請至「家長綁定」將既有家長帳號與學生綁定。",
      "error"
    );
    return;
  }

  if (!studentId) {
    showMessage("請選擇要綁定的學生。", "error");
    return;
  }

  const student = studentsByIdCache.get(String(studentId));
  if (!student) {
    showMessage("找不到所選學生，請重新整理後再試。", "error");
    return;
  }

  if (!confirm(
    "請確認以下家長帳號資料：\n\n" +
    "帳號類型：" + (accountType === "phone" ? "手機號碼" : "Email") + "\n" +
    "登入帳號：" + loginLabel + "\n" +
    "綁定學生：" + student.full_name + "\n" +
    "班級：" + student.class_name + "\n" +
    "初始密碼：系統將自動產生一次性隨機密碼，首次登入必須修改。\n\n" +
    "確認建立家長帳號嗎？"
  )) return;

  button.disabled = true;
  button.textContent = "建立中……";

  try {
    const result = await db.functions.invoke(
      "admin-create-parent-account",
      {
        body: { email, phone, displayName, studentId }
      }
    );

    if (result.error) {
      throw new Error(
        result.data && result.data.error
          ? result.data.error
          : result.error.message
      );
    }

    const data = result.data || {};
    if (!data.success || !data.initialPassword) {
      throw new Error(data.error || "帳號建立結果不完整，請確認 Supabase Edge Function。");
    }

    await loadAdminData();
    renderGuardians();

    const passwordText = data.initialPassword;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(passwordText);
        copied = true;
      }
    } catch (copyError) {
      console.warn("複製初始密碼失敗：", copyError);
    }

    alert(
      "家長帳號建立成功！\n\n" +
      "登入帳號：" + loginLabel + "\n" +
      "綁定學生：" + student.full_name + "\n" +
      "初始密碼：" + passwordText + "\n\n" +
      (copied
        ? "初始密碼已複製，可以直接貼到 LINE 傳給家長。"
        : "請記下初始密碼，並透過 LINE 提供給家長。")
    );

    showMessage(
      "家長帳號「" + loginLabel + "」已建立，並完成「" + student.full_name + "」的學生綁定。",
      "success"
    );

  } catch (error) {
    console.error("建立家長帳號失敗：", error);

    let detail = error.message || "未知錯誤";
    // Edge Function 可能以非 2xx 回應包裝重複帳號錯誤，嘗試讀取伺服器回傳的明確訊息。
    try {
      const response = error.context;
      if (response && typeof response.clone === "function") {
        const payload = await response.clone().json();
        detail = payload.error || payload.message || detail;
      }
    } catch (parseError) {
      // 保留原始錯誤訊息，不影響主要錯誤處理。
    }

    const normalizedDetail = String(detail).toLowerCase();
    const duplicateError =
      /already exists|already registered|duplicate|user already|email.*(exist|registered)|phone.*(exist|registered)|已存在|重複/.test(normalizedDetail);

    if (duplicateError) {
      showMessage(
        "此 " + (accountType === "phone" ? "手機號碼" : "Email") +
        " 已經建立過家長帳號，請勿重複建立。若要新增學生，請至「家長綁定」使用既有家長帳號。",
        "error"
      );
    } else {
      showMessage("建立家長帳號失敗：" + detail, "error");
    }
  } finally {
    const currentButton = $("createParentButton");
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = "建立家長帳號";
    }
  }
}

// ==================================================
// 11-4. 原有手動建立家長綁定
// ==================================================

async function saveGuardianBinding(event) {
  event.preventDefault();

  const button = $("saveGuardianBindingButton");
  if (!button || button.disabled) return;

  const guardianId = $("guardianParent").value;
  const studentId = $("guardianStudent").value;
  if (!guardianId || !studentId) {
    showMessage("請先選擇家長帳號及學生。", "error");
    return;
  }

  const exists = guardianStudentBindingKeysCache.has(
    JSON.stringify([String(guardianId), String(studentId)])
  );

  if (exists) {
    showMessage("這筆家長與學生綁定已存在，請勿重複建立。", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "建立中……";
  try {
    const result = await db.from("guardian_students").insert({
      guardian_id: guardianId,
      student_id: studentId
    });

    if (result.error) {
      if (result.error.code === "23505") {
        throw new Error("這筆家長與學生綁定已存在，請重新整理清單確認。");
      }
      throw result.error;
    }

    // 新增綁定只影響家長綁定快取，無須重新載入整套管理端資料。
    guardianLinksCache.push({ guardian_id: guardianId, student_id: studentId });
    rebuildGuardianBindingIndexes();
    renderGuardians();
    showMessage("家長與學生已成功綁定。", "success");

  } catch (error) {
    showMessage("建立綁定失敗：" + error.message, "error");
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "建立綁定";
    }
  }
}

async function removeGuardianBinding(guardianId, studentId) {
  if (!confirm("確定解除這筆家長與學生的綁定？")) return;

  try {
    const result = await db
      .from("guardian_students")
      .delete()
      .eq("guardian_id", guardianId)
      .eq("student_id", studentId);

    if (result.error) throw result.error;

    // 解除綁定只同步對應的本機關聯資料與索引。
    guardianLinksCache = guardianLinksCache.filter(link =>
      !(String(link.guardian_id) === String(guardianId) &&
        String(link.student_id) === String(studentId))
    );
    rebuildGuardianBindingIndexes();
    renderGuardians();
    showMessage("已解除綁定。", "success");

  } catch (error) {
    showMessage("解除綁定失敗：" + error.message, "error");
  }
}

// ==================================================
// 11-5. 教師帳號與授課權限管理
// ==================================================

function renderTeacherManagement() {
  const content = $("adminContent");
  const teacherById = teacherProfilesByIdCache;
  const teacherRoleIds = teacherRoleIdsCache;
  const teacherOptions = teacherProfilesCache.map(function (profile) {
    return "<option value='" + escapeHtml(profile.id) + "'>" +
      escapeHtml(profile.email || profile.display_name || profile.id) +
      "</option>";
  }).join("");

  const selectedTeacherId = $("teacherAccountSelect")
    ? $("teacherAccountSelect").value
    : "";

  const assignmentSubjectOrder = { "國文": 1, "英文": 2, "自然": 3 };
  const assignmentClassOrder = { "國一班": 1, "國二班": 2, "國三班": 3 };
  const sortTeacherAssignments = function (items) {
    return items.slice().sort(function (a, b) {
      const subjectA = assignmentSubjectOrder[a.subject] || 99;
      const subjectB = assignmentSubjectOrder[b.subject] || 99;
      if (subjectA !== subjectB) return subjectA - subjectB;
      const classA = assignmentClassOrder[a.class_name] || 99;
      const classB = assignmentClassOrder[b.class_name] || 99;
      if (classA !== classB) return classA - classB;
      return 0;
    });
  };

  const assignmentRows = sortTeacherAssignments(teacherAssignmentsCache
    .filter(item => !selectedTeacherId || String(item.teacher_id) === String(selectedTeacherId)))
    .map(function (item) {
      const teacher = teacherById.get(String(item.teacher_id));
      return "<tr data-teacher-assignment-row='" + escapeHtml(item.id) + "'>" +
        "<td>" + escapeHtml(teacher ? teacher.email : "教師帳號") + "</td>" +
        "<td>" + escapeHtml(item.class_name) + "</td>" +
        "<td>" + escapeHtml(item.subject) + "</td>" +
        "<td><button class='btn btn-danger btn-small' data-delete-teacher-assignment='" + escapeHtml(item.id) + "'>移除綁定</button></td>" +
      "</tr>";
    }).join("");

  const eligibleParents = profilesCache.filter(profile =>
    !teacherRoleIds.has(String(profile.id))
  );
  const eligibleParentOptions = eligibleParents.map(profile =>
    "<option value='" + escapeHtml(profile.id) + "'>" +
    escapeHtml(profile.display_name || profile.email || profile.id) +
    "（" + escapeHtml(profile.email || "") + "）</option>"
  ).join("");

  content.innerHTML =
    "<h2 class='section-title'>教師管理</h2>" +
    "<div class='panel'><h3>既有家長帳號增加教師身分</h3>" +
      "<p class='muted'>選擇已存在的家長帳號，即可保留原本 Email、密碼及孩子綁定，另外啟用教師查詢身分；不會建立新登入帳號。</p>" +
      "<form id='addTeacherRoleForm'><div class='form-grid'>" +
        "<div class='field'><label>既有家長帳號</label><select id='existingParentForTeacher' required><option value=''>請選擇家長帳號</option>" + eligibleParentOptions + "</select></div>" +
      "</div><button class='btn btn-success' type='submit' " + (eligibleParents.length ? "" : "disabled") + ">增加教師身分</button></form>" +
    "</div>" +
    "<div class='panel'><h3>建立獨立教師帳號</h3>" +
      "<p class='muted'>輸入教師 Email，系統會建立教師登入帳號並產生臨時密碼。教師登入後可自行修改密碼。</p>" +
      "<form id='createTeacherForm'><div class='form-grid'>" +
        "<div class='field'><label>教師 Email（登入帳號）</label><input id='newTeacherEmail' type='email' autocomplete='off' placeholder='請輸入教師 Email' required></div>" +
      "</div><button class='btn btn-success' type='submit' id='createTeacherButton'>建立教師帳號</button></form>" +
    "</div>" +
    "<div class='panel'><h3>教師帳號管理</h3>" +
      "<p class='muted'>教師帳號建立後，管理員會私下提供登入資訊。教師首次登入或密碼重設後，必須先更改為至少 8 個字元的新密碼，才能查詢成績。</p>" +
      "<div class='table-wrap'><table class='teacher-account-table'><thead><tr><th>教師登入 Email</th><th>操作</th></tr></thead>" +
      "<tbody id='teacherAccountRows'>" +
        (teacherProfilesCache.map(function (profile) {
          const actions = profile.isAdditionalTeacherRole
            ? "<button class='btn btn-danger btn-small' data-remove-teacher-role='" + escapeHtml(profile.id) + "'>移除教師身分</button>"
            : "<button class='btn btn-small' data-reset-teacher='" + escapeHtml(profile.id) + "'>重設密碼</button>" +
              "<button class='btn btn-danger btn-small' data-delete-teacher='" + escapeHtml(profile.id) + "'>刪除帳號</button>";
          return "<tr><td>" + escapeHtml(profile.email || profile.display_name || "—") +
            (profile.isAdditionalTeacherRole ? " <span class='muted'>（家長兼教師）</span>" : "") + "</td>" +
            "<td class='action-cell'><div class='action-buttons'>" + actions + "</div></td></tr>";
        }).join("") || "<tr><td colspan='2' class='empty'>目前沒有教師帳號</td></tr>") +
      "</tbody></table></div>" +
    "</div>" +
    "<div class='panel' id='teacherAssignmentPanel'><h3>設定授課班級與科目</h3>" +
      (teacherProfilesCache.length
        ? "<form id='teacherAssignmentForm'><div class='form-grid'>" +
            "<div class='field'><label>教師帳號</label><select id='teacherAccountSelect' required><option value=''>請選擇教師</option>" + teacherOptions + "</select></div>" +
            "<div class='field'><label>授課班級</label><select id='teacherClassSelect' required><option value=''>請選擇班級</option><option>國一班</option><option>國二班</option><option>國三班</option></select></div>" +
            "<div class='field'><label>授課科目</label><select id='teacherSubjectSelect' required><option value=''>請選擇科目</option>" + SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") + "</select></div>" +
          "</div><button class='btn btn-success' type='submit' id='saveTeacherAssignmentButton'>新增授課權限</button></form>"
        : "<div class='empty'>目前尚無教師帳號，請先建立教師帳號。</div>") +
    "</div>" +
    "<div class='panel'><h3>教師授課權限清單</h3>" +
      "<div class='toolbar'><label for='teacherAssignmentFilter'><strong>教師：</strong></label><select id='teacherAssignmentFilter'><option value=''>全部教師</option>" + teacherOptions + "</select></div>" +
      "<div class='table-wrap'><table class='teacher-assignment-table'><thead><tr><th>教師帳號</th><th>班級</th><th>科目</th><th>操作</th></tr></thead>" +
      "<tbody id='teacherAssignmentRows'>" + (assignmentRows || "<tr><td colspan='4' class='empty'>目前沒有授課權限設定</td></tr>") + "</tbody></table></div>" +
    "</div>";

  $("createTeacherForm").addEventListener("submit", createTeacherAccount);
  $("addTeacherRoleForm").addEventListener("submit", addTeacherRoleToParent);
  if ($("teacherAssignmentForm")) {
    $("teacherAssignmentForm").addEventListener("submit", saveTeacherAssignment);
    $("teacherAccountSelect").addEventListener("change", function () {
      $("teacherAssignmentFilter").value = this.value;
      refreshTeacherAssignmentRows();
    });
  }
  $("teacherAssignmentFilter").addEventListener("change", refreshTeacherAssignmentRows);

  function refreshTeacherAssignmentRows() {
    const selected = $("teacherAssignmentFilter").value;
    const rows = sortTeacherAssignments(teacherAssignmentsCache
      .filter(item => !selected || String(item.teacher_id) === String(selected)))
      .map(function (item) {
        const teacher = teacherById.get(String(item.teacher_id));
        return "<tr data-teacher-assignment-row='" + escapeHtml(item.id) + "'><td>" + escapeHtml(teacher ? teacher.email : "教師帳號") + "</td>" +
          "<td>" + escapeHtml(item.class_name) + "</td><td>" + escapeHtml(item.subject) + "</td>" +
          "<td><button class='btn btn-danger btn-small' data-delete-teacher-assignment='" + escapeHtml(item.id) + "'>移除綁定</button></td></tr>";
      }).join("");
    $("teacherAssignmentRows").innerHTML = rows || "<tr><td colspan='4' class='empty'>目前沒有授課權限設定</td></tr>";
  }

  content.onclick = async function (event) {
    const resetButton = event.target.closest("[data-reset-teacher]");
    if (resetButton) {
      const profile = teacherById.get(String(resetButton.dataset.resetTeacher));
      if (profile) await manageTeacherAccount("reset_password", profile.id, profile.email || "");
      return;
    }

    const deleteButton = event.target.closest("[data-delete-teacher]");
    if (deleteButton) {
      const profile = teacherById.get(String(deleteButton.dataset.deleteTeacher));
      if (profile) await manageTeacherAccount("delete", profile.id, profile.email || "");
      return;
    }

    const assignmentButton = event.target.closest("[data-delete-teacher-assignment]");
    if (assignmentButton) {
      await deleteTeacherAssignment(assignmentButton.dataset.deleteTeacherAssignment, assignmentButton);
      return;
    }

    const removeRoleButton = event.target.closest("[data-remove-teacher-role]");
    if (removeRoleButton) {
      await removeAdditionalTeacherRole(removeRoleButton.dataset.removeTeacherRole);
    }
  };
}

async function addTeacherRoleToParent(event) {
  event.preventDefault();
  const userId = $("existingParentForTeacher").value;
  const profile = parentProfilesByIdCache.get(String(userId));
  if (!profile) {
    showMessage("請選擇有效的既有家長帳號。", "error");
    return;
  }
  if (!confirm(
    "確定替這個既有家長帳號增加教師身分？\n\n" +
    "帳號：" + (profile.email || profile.display_name || userId) +
    "\n\n原本家長身分、密碼及孩子綁定都會保留。"
  )) return;

  try {
    const result = await db.from("profile_roles").insert({
      user_id: userId,
      role: "teacher"
    });
    if (result.error) {
      if (result.error.code === "23505") throw new Error("此帳號已經具有教師身分。");
      throw result.error;
    }
    await loadAdminData();
    renderTeacherManagement();
    showMessage("已成功增加教師身分，原本家長帳號及綁定資料均保留。", "success");
  } catch (error) {
    showMessage("增加教師身分失敗：" + error.message, "error");
  }
}

async function removeAdditionalTeacherRole(userId) {
  const profile = teacherProfilesByIdCache.get(String(userId));
  if (!profile || !profile.isAdditionalTeacherRole) return;
  if (!profile) return;
  if (!confirm(
    "確定移除此帳號的教師身分？\n\n" +
    "帳號：" + (profile.email || profile.display_name || userId) +
    "\n\n系統會一併移除教師授課指派，但會保留原本家長登入帳號、密碼及孩子綁定。"
  )) return;

  try {
    const assignmentDelete = await db.from("teacher_assignments").delete().eq("teacher_id", userId);
    if (assignmentDelete.error) throw assignmentDelete.error;
    const roleDelete = await db.from("profile_roles").delete().eq("user_id", userId).eq("role", "teacher");
    if (roleDelete.error) throw roleDelete.error;
    await loadAdminData();
    renderTeacherManagement();
    showMessage("教師身分已移除，原本家長帳號及孩子綁定仍保留。", "success");
  } catch (error) {
    showMessage("移除教師身分失敗：" + error.message, "error");
  }
}

async function createTeacherAccount(event) {
  event.preventDefault();
  const email = $("newTeacherEmail").value.trim().toLowerCase();
  const button = $("createTeacherButton");
  if (!email) return;

  if (!confirm("確定建立教師帳號？\n\n登入帳號：" + email + "\n角色：教師")) return;
  button.disabled = true;
  button.textContent = "建立中……";

  try {
    const result = await db.functions.invoke("admin-create-teacher-account", {
      body: { email: email }
    });
    if (result.error) {
      throw new Error(result.data && result.data.error ? result.data.error : result.error.message);
    }
    const data = result.data || {};
    if (!data.success || !data.temporaryPassword) {
      throw new Error(data.error || "教師帳號建立結果不完整，請確認 Edge Function 已部署。");
    }
    await loadAdminData();
    renderTeacherManagement();
    const copyPassword = confirm(
      "教師帳號建立成功！\n\n登入帳號：" + (data.email || email) +
      "\n臨時密碼：" + data.temporaryPassword +
      "\n\n請將臨時密碼透過 LINE 提供給教師；教師首次登入必須先更改為至少 8 個字元的新密碼。\n\n按「確定」複製臨時密碼。"
    );
    if (copyPassword) {
      try { await navigator.clipboard.writeText(data.temporaryPassword); showMessage("教師臨時密碼已複製。", "success"); }
      catch (copyError) { showMessage("教師臨時密碼：" + data.temporaryPassword, "success"); }
    }
    showMessage("教師帳號「" + email + "」已建立。", "success");
  } catch (error) {
    showMessage("建立教師帳號失敗：" + error.message, "error");
  } finally {
    const currentButton = $("createTeacherButton");
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = "建立教師帳號";
    }
  }
}

async function manageTeacherAccount(action, teacherId, email) {
  const isDelete = action === "delete";

  if (isDelete) {
    const confirmed = confirm(
      "確定永久刪除這位教師的 Email 登入帳號？\n\n" +
      "教師帳號：" + email + "\n\n" +
      "刪除後將無法登入，該教師的所有授課權限也會一併移除。此操作無法復原。"
    );
    if (!confirmed) return;
  } else {
    if (!confirm("確定重設這位教師的登入密碼？\n\n教師帳號：" + email)) return;
  }

  try {
    const result = await db.functions.invoke("admin-manage-teacher-account", {
      body: { action: action, teacherId: teacherId }
    });

    if (result.error) {
      throw new Error(result.data && result.data.error ? result.data.error : result.error.message);
    }

    const data = result.data || {};
    if (!data.success) throw new Error(data.error || "教師帳號操作失敗。");

    if (isDelete) {
      await loadAdminData();
      renderTeacherManagement();
      showMessage("教師帳號已刪除，授課權限也已清除。", "success");
      return;
    }

    if (!data.temporaryPassword) throw new Error("密碼已重設，但沒有取得臨時密碼。");

    const copied = confirm(
      "教師密碼已重設成功！\n\n" +
      "登入帳號：" + (data.email || email) + "\n" +
      "臨時密碼：" + data.temporaryPassword +
      "\n\n請將密碼透過 LINE 提供給教師；教師首次登入必須先更改密碼。\n\n按「確定」複製臨時密碼。"
    );

    if (copied) {
      try {
        await navigator.clipboard.writeText(data.temporaryPassword);
        showMessage("教師臨時密碼已複製。", "success");
      } catch (copyError) {
        showMessage("教師臨時密碼：" + data.temporaryPassword, "success");
      }
    } else {
      showMessage("臨時密碼已產生，請記下剛才顯示的密碼。", "success");
    }
  } catch (error) {
    showMessage((isDelete ? "刪除教師帳號" : "重設教師密碼") + "失敗：" + error.message, "error");
  }
}

async function saveTeacherAssignment(event) {
  event.preventDefault();
  const button = $("saveTeacherAssignmentButton");
  if (!button || button.disabled) return;

  const assignmentPanel = $("teacherAssignmentPanel");
  const assignmentPanelTop = assignmentPanel
    ? assignmentPanel.getBoundingClientRect().top
    : null;
  const teacherId = $("teacherAccountSelect").value;
  const className = $("teacherClassSelect").value;
  const subject = $("teacherSubjectSelect").value;
  if (!teacherId || !className || !subject) {
    showMessage("請選擇教師、班級及科目。", "error");
    return;
  }

  const duplicate = teacherAssignmentsCache.some(item =>
    String(item.teacher_id) === String(teacherId) &&
    item.class_name === className &&
    item.subject === subject
  );
  if (duplicate) {
    showMessage("這位教師已經有相同班級及科目的授課權限，不需要重複新增。", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "新增中……";
  try {
    const result = await db.from("teacher_assignments").insert({
      teacher_id: teacherId,
      class_name: className,
      subject: subject
    }).select("id, teacher_id, class_name, subject").single();
    if (result.error) {
      if (result.error.code === "23505") throw new Error("這位教師已經有相同的授課權限。");
      throw result.error;
    }
    teacherAssignmentsCache.push(result.data);
    renderTeacherManagement();
    if ($("teacherAccountSelect")) $("teacherAccountSelect").value = teacherId;
    if ($("teacherClassSelect")) $("teacherClassSelect").value = className;
    if ($("teacherSubjectSelect")) $("teacherSubjectSelect").value = subject;
    showMessage("教師授課權限已新增。", "success", true);

    // 以「設定授課班級與科目」區塊作為定位基準，重新 render 後校正位置。
    requestAnimationFrame(function () {
      const refreshedPanel = $("teacherAssignmentPanel");
      if (refreshedPanel && assignmentPanelTop !== null) {
        const newTop = refreshedPanel.getBoundingClientRect().top;
        window.scrollBy({ top: newTop - assignmentPanelTop, behavior: "auto" });
      }
    });
  } catch (error) {
    showMessage("新增授課權限失敗：" + error.message, "error");
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "新增授課權限";
    }
  }
}

async function deleteTeacherAssignment(id, button) {
  if (!confirm("確定移除此筆教師授課權限？")) return;

  const currentRow = button ? button.closest("tr") : null;
  const nextRow = currentRow ? currentRow.nextElementSibling : null;
  const previousRow = currentRow ? currentRow.previousElementSibling : null;
  const anchorRowId = nextRow && nextRow.dataset.teacherAssignmentRow
    ? nextRow.dataset.teacherAssignmentRow
    : previousRow && previousRow.dataset.teacherAssignmentRow
      ? previousRow.dataset.teacherAssignmentRow
      : "";
  const anchorTop = currentRow ? currentRow.getBoundingClientRect().top : null;
  const assignmentPanel = currentRow ? currentRow.closest(".panel") : null;
  const panelTop = assignmentPanel ? assignmentPanel.getBoundingClientRect().top : null;

  try {
    const result = await db.from("teacher_assignments").delete().eq("id", id);
    if (result.error) throw result.error;
    teacherAssignmentsCache = teacherAssignmentsCache.filter(
      item => String(item.id) !== String(id)
    );
    renderTeacherManagement();
    showMessage("教師授課權限已移除。", "success", true);

    requestAnimationFrame(function () {
      const refreshedRow = anchorRowId
        ? document.querySelector("[data-teacher-assignment-row='" + anchorRowId + "']")
        : null;
      if (refreshedRow && anchorTop !== null) {
        window.scrollBy({
          top: refreshedRow.getBoundingClientRect().top - anchorTop,
          behavior: "auto"
        });
      } else if (panelTop !== null) {
        const refreshedPanel = $("teacherAssignmentRows");
        const panel = refreshedPanel ? refreshedPanel.closest(".panel") : null;
        if (panel) {
          window.scrollBy({
            top: panel.getBoundingClientRect().top - panelTop,
            behavior: "auto"
          });
        }
      }
    });
  } catch (error) {
    showMessage("移除教師授課權限失敗：" + error.message, "error", true);
  }
}

// ==================================================
// 12. 家長密碼管理
// ==================================================

function renderPasswords() {
  const content = $("adminContent");
  const studentsById = studentsByIdCache;
  const linksByGuardian = new Map();

  guardianLinksCache.forEach(function (link) {
    const guardianId = String(link.guardian_id);
    const student = studentsById.get(String(link.student_id));
    if (!student) return;
    if (!linksByGuardian.has(guardianId)) linksByGuardian.set(guardianId, []);
    linksByGuardian.get(guardianId).push(student);
  });

  const rows = profilesCache.map(function (profile) {
    const loginAccount = profile.email || profile.phone || "—";
    const linkedStudents = linksByGuardian.get(String(profile.id)) || [];
    const linkedStudentNames = Array.from(new Set(linkedStudents.map(student => student.full_name)));
    const searchableText = [
      profile.display_name || "",
      profile.email || "",
      profile.phone || "",
      ...linkedStudents.flatMap(student => [
        student.full_name || "",
        student.student_code || "",
        student.class_name || ""
      ])
    ].join(" ").toLocaleLowerCase();

    return "<tr data-parent-search='" + escapeHtml(searchableText) + "'>" +
      "<td>" + escapeHtml(profile.display_name || "未設定姓名") + "</td>" +
      "<td>" + escapeHtml(loginAccount) + "</td>" +
      "<td>" + (linkedStudentNames.length
        ? linkedStudentNames.map(escapeHtml).join("、")
        : "<span class='muted'>尚未綁定學生</span>") + "</td>" +
      "<td><div class='action-buttons'>" +
        "<button class='btn btn-small' data-reset-parent='" + escapeHtml(profile.id) + "'>重設密碼</button>" +
        "<button class='btn btn-danger btn-small' data-delete-parent='" + escapeHtml(profile.id) + "'>刪除帳號</button>" +
      "</div></td>" +
      "</tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>家長帳號管理</h2>" +
    "<p class='muted'>可重設家長登入密碼，或刪除不再使用的家長帳號。刪除前請確認家長姓名及綁定學生；刪除帳號後會解除該家長的所有學生綁定，但學生資料及成績會保留。</p>" +
    "<div class='toolbar parent-account-filter-toolbar'>" +
      "<label for='parentAccountKeyword'><strong>搜尋：</strong></label>" +
      "<input id='parentAccountKeyword' type='search' placeholder='家長姓名、Email、手機或學生姓名／編號' aria-label='搜尋家長帳號或已綁定學生' style='min-width:240px;flex:1'>" +
      "<span id='parentAccountResultCount' class='muted' style='font-size: 14px'></span>" +
    "</div>" +
    "<div class='table-wrap password-table-wrap'><table class='password-management-table'>" +
      "<thead><tr><th>家長姓名</th><th>登入帳號（Email／手機）</th><th>已綁定學生</th><th>操作</th></tr></thead>" +
      "<tbody id='parentAccountRows'>" + (rows || "<tr><td colspan='4' class='empty'>目前沒有家長帳號</td></tr>") + "</tbody>" +
    "</table></div>";

  const searchInput = $("parentAccountKeyword");
  const resultCount = $("parentAccountResultCount");
  const accountRows = Array.from(content.querySelectorAll("tr[data-parent-search]"));

  function applyParentAccountSearch() {
    const keyword = searchInput.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    accountRows.forEach(function (row) {
      const matched = !keyword || row.dataset.parentSearch.includes(keyword);
      row.hidden = !matched;
      if (matched) visibleCount += 1;
    });
    resultCount.textContent = "符合條件 " + visibleCount + "／" + accountRows.length + " 位家長";
  }

  searchInput.addEventListener("input", applyParentAccountSearch);
  applyParentAccountSearch();

  content.onclick = async function (event) {
    const resetButton = event.target.closest("[data-reset-parent]");
    if (resetButton) {
      await resetParentPassword(resetButton.dataset.resetParent);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-parent]");
    if (deleteButton) {
      await deleteParentAccount(deleteButton.dataset.deleteParent);
    }
  };
}

function getLinkedStudentNames(parentUserId) {
  const studentsById = studentsByIdCache;
  const names = new Set();
  guardianLinksCache.forEach(function (link) {
    if (String(link.guardian_id) !== String(parentUserId)) return;
    const student = studentsById.get(String(link.student_id));
    if (student && student.full_name) names.add(student.full_name);
  });
  return Array.from(names);
}

async function resetParentPassword(parentUserId) {
  const parent = parentProfilesByIdCache.get(String(parentUserId));
  if (!parent) {
    showMessage("找不到這筆家長帳號資料，請重新整理後再試。", "error");
    return;
  }

  const linkedStudentNames = getLinkedStudentNames(parentUserId);
  const loginAccount = parent.email || parent.phone || "未設定";
  if (!confirm(
    "確定重設這位家長的登入密碼嗎？\n\n" +
    "家長姓名：" + (parent.display_name || "未命名") + "\n" +
    "登入帳號：" + loginAccount + "\n" +
    "綁定學生：" + (linkedStudentNames.length ? linkedStudentNames.join("、") : "尚未綁定") + "\n\n" +
    "重設後，請將系統回傳的臨時密碼提供給家長。"
  )) return;

  const button = Array.from(document.querySelectorAll("[data-reset-parent]"))
    .find(item => String(item.dataset.resetParent) === String(parentUserId));
  if (button) {
    button.disabled = true;
    button.textContent = "重設中…";
  }

  try {
    const result = await db.functions.invoke("admin-reset-parent-password", {
      body: { parentUserId: parentUserId }
    });
    if (result.error) {
      const detail = result.data && result.data.error ? result.data.error : result.error.message;
      throw new Error(detail || "重設家長密碼失敗。");
    }

    const data = result.data || {};
    if (data.success !== true) {
      throw new Error(data.error || "伺服器未確認密碼重設成功，請確認後再試。");
    }

    const temporaryPassword = [
      data.temporaryPassword,
      data.tempPassword,
      data.initialPassword
    ].find(value => typeof value === "string" && value.trim());

    if (!temporaryPassword) {
      throw new Error("伺服器未回傳有效的臨時密碼。為避免提供錯誤密碼，系統不會顯示重設成功，請先確認帳號狀態。");
    }

    if (button) {
      button.disabled = false;
      button.textContent = "重設密碼";
    }
    showMessage("家長密碼已重設。臨時密碼：" + temporaryPassword.trim() + "。請將臨時密碼提供給家長。", "success");
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "重設密碼";
    }
    showMessage("重設家長密碼失敗：" + error.message, "error");
  }
}

async function deleteParentAccount(parentUserId) {
  const parent = parentProfilesByIdCache.get(String(parentUserId));

  if (!parent) {
    showMessage("找不到這筆家長帳號資料，請重新整理後再試。", "error");
    return;
  }

  const loginAccount = parent.email || parent.phone || "未設定";
  const linkedStudentNames = getLinkedStudentNames(parentUserId);
  const confirmed = confirm(
    "確定要永久刪除以下家長帳號？\n\n" +
    "家長姓名：" + (parent.display_name || "未命名") + "\n" +
    "登入帳號：" + loginAccount + "\n" +
    "綁定學生：" + (linkedStudentNames.length ? linkedStudentNames.join("、") : "尚未綁定") + "\n\n" +
    "刪除後：\n" +
    "1. 該家長將無法再登入。\n" +
    "2. 該家長與學生的綁定將解除。\n" +
    "3. 學生資料及考試成績會保留。\n\n" +
    "此操作無法復原，確定要刪除嗎？"
  );
  if (!confirmed) return;

  const button = document.querySelector("[data-delete-parent='" + parentUserId + "']");
  if (button) {
    button.disabled = true;
    button.textContent = "刪除中…";
  }

  try {
    const result = await db.functions.invoke("admin-delete-parent-account", {
      body: { parentId: parentUserId }
    });

    if (result.error) {
      const detail = result.data && result.data.error ? result.data.error : result.error.message;
      throw new Error(detail || "刪除家長帳號失敗。");
    }

    const data = result.data || {};
    if (!data.success) {
      throw new Error(data.error || "刪除家長帳號失敗。");
    }

    profilesCache = profilesCache.filter(function (profile) {
      return String(profile.id) !== String(parentUserId);
    });
    guardianLinksCache = guardianLinksCache.filter(function (link) {
      return String(link.guardian_id) !== String(parentUserId);
    });
    rebuildAdminEntityIndexes();
    rebuildGuardianBindingIndexes();
    renderGuardians();
    showMessage("家長帳號已刪除，學生資料及成績均已保留。", "success");
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "刪除帳號";
    }
    showMessage("刪除家長帳號失敗：" + error.message, "error");
  }
}

// ==================================================
// 13. 登入紀錄
// ==================================================

async function renderLoginLogs() {
  const content = $("adminContent");

  content.innerHTML =
    "<h2 class='section-title'>登入紀錄</h2>" +
    "<div class='empty'>正在讀取登入紀錄……</div>";

  try {
    // 先取得最近 200 筆登入紀錄，再只查這批紀錄涉及的帳號，避免傳輸整張 profiles。
    const logsResult = await db.from("login_events")
      .select("user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (logsResult.error) throw logsResult.error;

    const logs = logsResult.data || [];
    const loggedUserIds = Array.from(new Set(
      logs.map(log => String(log.user_id)).filter(Boolean)
    ));
    let profilesById = new Map();
    if (loggedUserIds.length) {
      const profilesResult = await db.from("profiles")
        .select("id, role, email")
        .in("id", loggedUserIds);
      if (profilesResult.error) throw profilesResult.error;
      profilesById = new Map((profilesResult.data || []).map(profile => [String(profile.id), profile]));
    }
    const studentsById = studentsByIdCache;
    const studentNamesByGuardian = new Map();

    // 每位家長的綁定學生姓名只整理一次，避免每筆登入紀錄重複 map／Set。
    guardianLinksCache.forEach(link => {
      const guardianId = String(link.guardian_id);
      const student = studentsById.get(String(link.student_id));
      if (!student) return;
      if (!studentNamesByGuardian.has(guardianId)) studentNamesByGuardian.set(guardianId, new Set());
      studentNamesByGuardian.get(guardianId).add(student.full_name);
    });
    const linkedStudentNamesByGuardian = new Map();
    studentNamesByGuardian.forEach((names, guardianId) => {
      linkedStudentNamesByGuardian.set(guardianId, Array.from(names).join("、"));
    });

    // 日期格式器與教師名稱索引在整次渲染共用，避免每筆登入紀錄重複建立。
    const logDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
    });
    const logDateDisplayFormatter = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric"
    });
    const logTimeDisplayFormatter = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    const teacherNamesByEmail = {
      "black951165@gmail.com": "王炫老師",
      "tingning1995120@gmail.com": "溫老師",
      "nice0220@hotmail.com": "林一老師"
    };

    const rows = logs.map(function (log) {
      const profile = profilesById.get(String(log.user_id));

      let loginIdentity = "未知帳號";
      let loginRoleLabel = "未知";
      let loginRoleBadgeClass = "login-role-unknown";

      if (profile && profile.role === "admin") {
        loginRoleLabel = "管理員";
        loginRoleBadgeClass = "login-role-admin";
        loginIdentity = "";
      } else if (profile && profile.role === "teacher") {
        loginRoleLabel = "老師";
        loginRoleBadgeClass = "login-role-teacher";
        const teacherEmail = String(profile.email || "").trim().toLowerCase();
        loginIdentity = teacherNamesByEmail[teacherEmail] || profile.email || "教師帳號";
      } else {
        if (profile && profile.role === "parent") {
          loginRoleLabel = "家長";
          loginRoleBadgeClass = "login-role-parent";
        }
        loginIdentity = linkedStudentNamesByGuardian.get(String(log.user_id)) || "尚未綁定學生";
      }

      const logDate = log.created_at ? new Date(log.created_at) : null;
      const dateKey = logDate ? logDateKeyFormatter.format(logDate) : "";
      const displayTime = logDate
        ? logDateDisplayFormatter.format(logDate) + "　　" + logTimeDisplayFormatter.format(logDate)
        : "—";
      const searchText = [
        loginRoleLabel, loginIdentity, profile && profile.email, log.user_id
      ].filter(Boolean).join(" ").toLocaleLowerCase();

      return "<tr data-log-search='" + escapeHtml(searchText) + "' data-log-date='" + escapeHtml(dateKey) + "'><td><span class=\"login-role-badge " + loginRoleBadgeClass + "\">" + escapeHtml(loginRoleLabel) + "</span>" +
        (loginIdentity ? " " + escapeHtml(loginIdentity) : "") + "</td><td>" +
        escapeHtml(displayTime) + "</td></tr>";
    }).join("");

    content.innerHTML =
      "<h2 class='section-title'>登入紀錄</h2>" +
      "<div class='toolbar' style='display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap'>" +
        "<p class='muted' style='margin:0'>最近 200 筆登入紀錄（包含管理員、家長及教師）。</p>" +
        "<button class='btn btn-danger btn-small' type='button' id='clearLoginLogsButton'>清除全部登入紀錄</button>" +
      "</div>" +
      "<div class='login-log-legend'>" +
        "<span class='login-log-legend-item'><i class='login-log-legend-swatch login-log-legend-admin'></i>管理員</span>" +
        "<span class='login-log-legend-item'><i class='login-log-legend-swatch login-log-legend-parent'></i>家長</span>" +
        "<span class='login-log-legend-item'><i class='login-log-legend-swatch login-log-legend-teacher'></i>老師</span>" +
      "</div>" +
      "<div class='toolbar' style='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0'>" +
        "<input id='loginLogKeyword' type='search' class='form-control' placeholder='搜尋家長／教師' style='flex:1;min-width:160px' autocomplete='off'>" +
        "<span id='loginLogResultCount' class='muted' style='white-space:nowrap'></span>" +
      "</div>" +
      "<div class='table-wrap'><table class='login-log-table'><thead><tr><th>登入身分</th><th>登入時間</th></tr></thead>" +
      "<tbody id='loginLogRows'>" + (rows || "<tr><td colspan='2' class='empty'>目前沒有登入紀錄</td></tr>") +
      "</tbody></table></div>";

    const clearButton = $("clearLoginLogsButton");
    if (clearButton) clearButton.addEventListener("click", clearAllLoginLogs);

    const keywordInput = $("loginLogKeyword");
    const resultCount = $("loginLogResultCount");
    const logRows = Array.from(content.querySelectorAll("#loginLogRows tr[data-log-search]"));
    const applyLogFilters = function () {
      const keyword = String(keywordInput && keywordInput.value || "").trim().toLocaleLowerCase();
      let visibleCount = 0;
      logRows.forEach(row => {
        const matchesKeyword = !keyword || String(row.dataset.logSearch || "").includes(keyword);
        row.hidden = !matchesKeyword;
        if (matchesKeyword) visibleCount += 1;
      });
      if (resultCount) resultCount.textContent = "符合 " + visibleCount + "／" + logs.length + " 筆";
    };
    if (keywordInput) keywordInput.addEventListener("input", applyLogFilters);
    applyLogFilters();
  } catch (error) {
    content.innerHTML =
      "<h2 class='section-title'>登入紀錄</h2>" +
      "<p class='system-message error'>讀取失敗：" + escapeHtml(error.message) + "</p>";
  }
}

async function clearAllLoginLogs() {
  const confirmed = confirm(
    "確定要清除全部登入紀錄嗎？\n\n將會清除管理員、家長及教師的所有登入紀錄。\n此操作無法復原，且不會影響任何學生資料或成績。"
  );
  if (!confirmed) return;

  const button = $("clearLoginLogsButton");
  if (button) {
    button.disabled = true;
    button.textContent = "清除中…";
  }

  try {
    const result = await db.from("login_events")
      .delete({ count: "exact" })
      .not("created_at", "is", null);
    if (result.error) throw result.error;

    const remaining = await db.from("login_events").select("*", { count: "exact", head: true });
    if (remaining.error) throw remaining.error;
    if ((remaining.count || 0) > 0) {
      throw new Error("仍有 " + remaining.count + " 筆登入紀錄未清除，請確認資料表是否允許管理員刪除。");
    }

    await renderLoginLogs();
    showMessage("已清除管理員、家長及教師的全部登入紀錄；學生資料與成績不受影響。", "success");
  } catch (error) {
    await renderLoginLogs();
    showMessage("清除登入紀錄失敗：" + error.message, "error");
  }
}

// ==================================================
// 13-1. 學生週考檢閱紀錄
// ==================================================

async function renderStudentReviewRecords(selectedExamId) {
  const content = $("adminContent");
  // 考試日期索引已於管理資料載入時排序，匯出頁直接共用，避免每次進入頁面重複複製與排序。
  const examList = examsByDateDescCache;
  const activeStudents = explicitlyActiveStudentsCache;
  const currentExamId = selectedExamId ||
    (examList.length ? String(examList[0].id) : "");

  content.innerHTML =
    "<h2 class='section-title'>學生週考檢閱紀錄</h2>" +
    "<div class='toolbar' style='align-items:flex-end'>" +
      "<div class='field' style='margin:0;min-width:220px;flex:1'>" +
        "<label for='reviewExamSelect'>考試週期</label>" +
        "<select id='reviewExamSelect' style='width:100%;padding:10px;border:1px solid #ccd4df;border-radius:8px'>" +
          examList.map(function(exam) {
            return "<option value='" + escapeHtml(exam.id) + "' " +
              (String(exam.id) === currentExamId ? "selected" : "") + ">" +
              escapeHtml(formatDateRange(exam)) + "</option>";
          }).join("") +
        "</select>" +
      "</div>" +
      "<div class='field' style='margin:0;min-width:150px;flex:1'>" +
        "<label for='reviewClassSelect'>班級</label>" +
        "<select id='reviewClassSelect' style='width:100%;padding:10px;border:1px solid #ccd4df;border-radius:8px'>" +
          "<option value=''>全部班級</option>" +
          "<option value='國一班'>國一班</option>" +
          "<option value='國二班'>國二班</option>" +
          "<option value='國三班'>國三班</option>" +
        "</select>" +
      "</div>" +
      "<button class='btn btn-secondary' id='reviewRefreshButton' type='button'>重新整理</button>" +
    "</div>" +
    "<div id='reviewRecordContent' class='empty'>正在讀取檢閱紀錄……</div>";

  const examSelect = $("reviewExamSelect");
  const classSelect = $("reviewClassSelect");
  const refreshButton = $("reviewRefreshButton");
  const recordContent = $("reviewRecordContent");

  if (!examList.length) {
    recordContent.innerHTML = "目前沒有考試週期資料。";
    examSelect.disabled = true;
    classSelect.disabled = true;
    refreshButton.disabled = true;
    return;
  }

  let cachedReviewExamId = "";
  let cachedReviewMap = new Map();

  async function loadRecords(forceReload) {
    const selectedExamId = examSelect.value;
    recordContent.innerHTML = "<div class='empty'>正在讀取檢閱紀錄……</div>";
    refreshButton.disabled = true;

    try {
      if (forceReload || cachedReviewExamId !== selectedExamId) {
        const result = await db
          .from("score_review_records")
          .select("student_id, reviewed_at")
          .eq("exam_id", selectedExamId);

        if (result.error) throw result.error;

        cachedReviewMap = new Map(
          (result.data || []).map(record => [String(record.student_id), record])
        );
        cachedReviewExamId = selectedExamId;
      }

      const reviewMap = cachedReviewMap;
      const selectedClass = classSelect.value;
      let visibleCount = 0;
      let eligibleCount = 0;
      let noScoreCount = 0;
      let reviewedCount = 0;
      const rowHtml = [];
      const reviewClassOrder = { "國一班": 1, "國二班": 2, "國三班": 3 };
      const sortedReviewStudents = activeStudents.slice().sort(function(a, b) {
        const classA = String(a.class_name || "");
        const classB = String(b.class_name || "");
        const orderA = reviewClassOrder[classA] || 99;
        const orderB = reviewClassOrder[classB] || 99;
        if (orderA !== orderB) return orderA - orderB;
        if (orderA === 99 && classA !== classB) return classA.localeCompare(classB, "zh-Hant");
        return 0;
      });

      sortedReviewStudents.forEach(function(student) {
        if (selectedClass && student.class_name !== selectedClass) return;

        visibleCount++;
        const hasWeeklyScore = scoresCache.some(function(score) {
          return String(score.student_id) === String(student.id) &&
            String(score.exam_id) === String(selectedExamId);
        });
        const record = hasWeeklyScore ? reviewMap.get(String(student.id)) : null;
        if (!hasWeeklyScore) {
          noScoreCount++;
        } else {
          eligibleCount++;
          if (record) reviewedCount++;
        }

        const status = !hasWeeklyScore
          ? "<span class='review-status-badge' style='display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 7px;border-radius:6px;color:#000000;font-size: 18px;line-height:30px;font-weight:800;white-space:nowrap'>無成績</span>"
          : record
            ? "<span class='review-status-badge' style='display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 7px;border-radius:6px;background:#e3f5e9;color:#20683d;font-size: 18px;line-height:30px;font-weight:800;white-space:nowrap'>已檢閱</span>"
            : "<span class='review-status-badge' style='display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 7px;border-radius:6px;background:#fde8e8;color:#a32626;font-size: 18px;line-height:30px;font-weight:800;white-space:nowrap'>未檢閱</span>";
        const reviewedAt = hasWeeklyScore && record && record.reviewed_at
          ? new Date(record.reviewed_at).toLocaleString("zh-TW", {
              timeZone: "Asia/Taipei",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            })
          : "—";

        rowHtml.push("<tr>" +
          "<td>" + escapeHtml(student.class_name || "—") + "</td>" +
          "<td>" + escapeHtml(student.student_code || "—") + "</td>" +
          "<td>" + escapeHtml(student.full_name || "—") + "</td>" +
          "<td>" + status + "</td>" +
          "<td>" + escapeHtml(reviewedAt) + "</td>" +
        "</tr>");
      });

      const pendingCount = eligibleCount - reviewedCount;
      const completionRate = eligibleCount
        ? Math.round(reviewedCount / eligibleCount * 100)
        : 0;
      const rows = rowHtml.join("");

      recordContent.innerHTML =
        "<div class='grid' style='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:8px 0 18px'>" +
          "<div class='panel' style='margin:0;padding:7px 10px;text-align:center'><div class='muted' style='line-height:1.2'>已檢閱</div><div style='font-size: 20px;line-height:1.2;font-weight:900;color:#27845b'>" + reviewedCount + "</div></div>" +
          "<div class='panel' style='margin:0;padding:7px 10px;text-align:center'><div class='muted' style='line-height:1.2'>未檢閱</div><div style='font-size: 20px;line-height:1.2;font-weight:900;color:#bd4242'>" + pendingCount + "</div></div>" +
          "<div class='panel' style='margin:0;padding:7px 10px;text-align:center'><div class='muted' style='line-height:1.2'>完成率</div><div style='font-size: 20px;line-height:1.2;font-weight:900;color:#315d86'>" + completionRate + "%</div></div>" +
        "</div>" +
        "<p class='muted'>目前在學學生共 " + visibleCount + " 人；有週考成績 " + eligibleCount + " 人，無成績 " + noScoreCount + " 人（無成績不列入檢閱人數及完成率計算）。</p>" +
        "<div class='table-wrap'><table class='student-record-table' style='min-width:620px'><thead><tr>" +
          "<th>班級</th><th>學生編號</th><th>學生姓名</th><th>檢閱狀態</th><th>檢閱時間</th>" +
        "</tr></thead><tbody>" +
          (rows || "<tr><td colspan='5' class='empty'>此班級目前沒有在學學生。</td></tr>") +
        "</tbody></table></div>";
    } catch (error) {
      recordContent.innerHTML =
        "<div class='system-message error' style='display:block'>讀取檢閱紀錄失敗：" +
        escapeHtml(error.message) + "</div>";
    } finally {
      refreshButton.disabled = false;
    }
  }

  examSelect.addEventListener("change", function () {
    loadRecords();
  });
  classSelect.addEventListener("change", function () {
    loadRecords();
  });
  refreshButton.addEventListener("click", function () {
    loadRecords(true);
  });
  await loadRecords();
}

// ==================================================
// 14. 成績匯出
// ==================================================

function renderExport() {
  const content = $("adminContent");

  // 直接重用管理資料載入時已排序的考試索引，避免重複排序。
  const examList = examsByDateDescCache;

  const examOptions = examList.map(function (exam) {
    return (
      "<label class='export-period-item'>" +
        "<input type='checkbox' class='exportExam' value='" +
          escapeHtml(exam.id) +
        "'>" +
        "<span class='export-period-date'>" +
          escapeHtml(formatDateRange(exam)) +
        "</span>" +
      "</label>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>成績匯出</h2>" +

    "<div class='export-panel'>" +

      "<div class='export-panel-title'>選擇要匯出的考試週期</div>" +

      "<label class='export-select-all'>" +
        "<input type='checkbox' id='exportSelectAll'>" +
        "<span>全部選取</span>" +
      "</label>" +

      "<div class='export-period-list' id='exportExamList'>" +
        (
          examOptions ||
          "<div class='export-empty'>目前沒有考試週期資料</div>"
        ) +
      "</div>" +

      "<div class='export-summary'>" +
        "<span id='exportSelectedCount' class='export-count'>已選取 0 個考試週期</span>" +
        "<span>可同時選取多個考試週期</span>" +
      "</div>" +

      "<button class='btn btn-success export-download' id='downloadCsv' disabled>" +
        "下載 CSV 成績表" +
      "</button>" +

    "</div>" +

    "<p class='muted' style='margin-top:14px;line-height:1.8'>" +
      "匯出欄位：週考區間、班級、學生編號、學生姓名、科目、考試範圍、一般成績、答對題數、模擬考等級。" +
    "</p>";

  const selectAll = $("exportSelectAll");
  const checkboxes = Array.from(
    document.querySelectorAll(".exportExam")
  );
  const downloadButton = $("downloadCsv");

  function updateExportSelection() {
    let selectedCount = 0;
    const totalCount = checkboxes.length;

    checkboxes.forEach(function (checkbox) {
      if (checkbox.checked) selectedCount++;
    });

    selectAll.checked =
      totalCount > 0 && selectedCount === totalCount;

    selectAll.indeterminate =
      selectedCount > 0 && selectedCount < totalCount;

    $("exportSelectedCount").textContent =
      "已選取 " + selectedCount + " 個考試週期";

    downloadButton.disabled = selectedCount === 0;
  }

  selectAll.addEventListener("change", function () {
    checkboxes.forEach(function (checkbox) {
      checkbox.checked = selectAll.checked;
    });

    updateExportSelection();
  });

  checkboxes.forEach(function (checkbox) {
    checkbox.addEventListener("change", updateExportSelection);
  });

  downloadButton.addEventListener("click", exportCsv);

  updateExportSelection();
}

// ==================================================
// 14-1. 匯出 CSV 成績資料
// ==================================================

function exportCsv() {
  const selectedIds = Array.from(
    document.querySelectorAll(".exportExam:checked")
  ).map(function (checkbox) {
    return String(checkbox.value);
  });

  if (selectedIds.length === 0) {
    showMessage("請至少選擇一個考試週期。", "error");
    return;
  }

  const headers = [
    "週考區間",
    "班級",
    "學生編號",
    "學生姓名",
    "科目",
    "考試範圍",
    "一般成績",
    "答對題數",
    "模擬考等級"
  ];

  const rows = [
    headers.map(csvCell).join(",")
  ];

  const selectedIdSet = new Set(selectedIds);
  const studentsById = studentsByIdCache;
  // 直接重用管理資料載入時建立的考試索引，避免每次匯出都重新掃描全部考試。
  const examsById = examsByIdCache;

  let exportedCount = 0;
  scoresCache.forEach(function (score) {
    if (!selectedIdSet.has(String(score.exam_id))) return;

    const student = studentsById.get(String(score.student_id));
    const exam = examsById.get(String(score.exam_id));
    if (!student || !exam) return;

    rows.push([
      formatDateRange(exam),
      student.class_name,
      student.student_code,
      student.full_name,
      score.subject,
      score.scope,
      score.score,
      score.correct_count,
      score.grade_level
    ].map(csvCell).join(","));
    exportedCount++;
  });

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei"
  });

  downloadText(
    "小象成績資料_" + today + ".csv",
    rows.join("\r\n"),
    "text/csv;charset=utf-8"
  );

  showMessage(
    "CSV 成績表已產生，共匯出 " +
    exportedCount +
    " 筆成績資料。",
    "success"
  );
}

// 家長端固定底部功能列：僅保留修改密碼與登出
function buildParentBottomNav() {
  return (
    "<nav class='parent-bottom-nav' aria-label='家長功能'>" +
      "<button class='parent-action-btn parent-password-btn parent-change-password' type='button' title='修改登入密碼' aria-label='修改登入密碼'>" +
        "<svg class='parent-action-icon' viewBox='0 0 24 24' aria-hidden='true'><path d='M7 10V7a5 5 0 0 1 10 0v3'/><rect x='4' y='10' width='16' height='11' rx='2'/><path d='M12 14v3'/></svg>" +
        "<span>修改密碼</span>" +
      "</button>" +
      "<button class='parent-action-btn parent-logout-btn parent-logout logout-action' type='button' title='登出系統' aria-label='登出系統'>" +
        "<svg class='parent-action-icon' viewBox='0 0 24 24' aria-hidden='true'><path d='M10 17l5-5-5-5'/><path d='M15 12H3'/><path d='M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6'/></svg>" +
        "<span>登出</span>" +
      "</button>" +
    "</nav>"
  );
}
function bindParentActionButtons() {
  document.querySelectorAll(".parent-change-password").forEach(function (button) {
    button.addEventListener("click", changeOwnPassword);
  });
  document.querySelectorAll(".parent-logout").forEach(function (button) {
    button.addEventListener("click", handleLogout);
  });
}



// ==================================================
// 段考成績登錄（獨立資料表，不影響週成績）
// ==================================================

async function renderTermExamEntry() {
  const content=$("adminContent"), subjects=["國文","英文","數學","歷史","地理","公民","自然"];
  const keys=["subject_chinese","subject_english","subject_math","subject_history","subject_geography","subject_civics","subject_natural"];
  const classes=["國一班","國二班","國三班"], draftKey="xiaoxiang-term-exam-entry-draft-v2", prefKey="xiaoxiang-term-exam-entry-selection-v2";
  let records=[];
  let recordsById=new Map();
  let recordsByStudentKey=new Map();
  let overviewStaticCache=null;
  const termStudentsByClass = new Map();
  studentsCache.forEach(function(student) {
    if (student.is_active === false) return;
    if (!termStudentsByClass.has(student.class_name)) {
      termStudentsByClass.set(student.class_name, []);
    }
    termStudentsByClass.get(student.class_name).push(student);
  });
  termStudentsByClass.forEach(function(students) {
    students.sort((a, b) =>
      String(a.student_code || "").localeCompare(
        String(b.student_code || ""),
        "zh-Hant",
        { numeric: true }
      )
    );
  });
  const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||"null")||d;}catch(_){return d;}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(_){}};
  const available=y=>String(y).trim()==="114"?["國一班","國二班"]:classes;
  const rosterClass=(y,c)=>String(y).trim()==="114"?({"國一班":"國二班","國二班":"國三班"})[c]||"":c;
  const criteria=()=>({year:$("termAcademicYear").value.trim(),semester:$("termSemester").value,exam:$("termExamNumber").value,className:$("termClass").value});
  const termRecordKey=(year,semester,exam,studentId)=>JSON.stringify([String(year),String(semester),String(exam),String(studentId)]);
  const ready=c=>!!(c.year&&c.semester&&c.exam&&c.className), cid=c=>[c.year,c.semester,c.exam,c.className].join("|");
  const drafts=()=>read(draftKey,{});
  function saveDraft(row){
    const c=criteria();if(!ready(c))return;
    const all=drafts(),id=cid(c);all[id]=all[id]||{};const d={};
    keys.forEach((k,i)=>d[k]=row.querySelector('[data-term-score="'+i+'"]').value);
    d.class_rank=row.querySelector("[data-term-class-rank]").value;d.school_rank=row.querySelector("[data-term-school-rank]").value;
    all[id][row.dataset.termStudent]=d;write(draftKey,all);
    const active=document.activeElement;
    write(prefKey,{...c,studentId:row.dataset.termStudent,field:active?.dataset?.termScore??(active?.hasAttribute("data-term-class-rank")?"class_rank":active?.hasAttribute("data-term-school-rank")?"school_rank":"")});
    const status=$("termDraftStatus");if(status)status.textContent="輸入進度已自動暫存於此裝置";
  }
  function updateCompletionMark(row){
    const complete=keys.every((_,i)=>row.querySelector('[data-term-score="'+i+'"]').value.trim()!=="");
    const mark=row.querySelector(".term-completion-mark");
    if(!mark)return;
    mark.classList.toggle("is-complete",complete);
    mark.classList.toggle("is-incomplete",!complete);
    mark.textContent=complete?"✓":"●";
    mark.setAttribute("aria-label",complete?"七科成績完整":"尚有科目未輸入");
    mark.title=complete?"七科成績完整":"尚有科目未輸入";
  }
  function total(row){
    const v=keys.map((_,i)=>row.querySelector('[data-term-score="'+i+'"]').value.trim());
    const n=v.every(x=>x!=="")?v.reduce((a,x)=>a+Number(x),0):null;
    row.querySelector("[data-term-total]").textContent=n===null?"—":n.toFixed(2).replace(/\.00$/,"").replace(/(\.\d)0$/,"$1");
  }
  function renderRoster(){
    const c=criteria(),root=$("termExamRoster");
    if(!ready(c)){root.innerHTML="<div class='empty'>請先選擇學年度、學期、段考及班級，系統就會帶入整班學生。</div>";return;}
    const students=termStudentsByClass.get(rosterClass(c.year,c.className)) || [];
    if(!students.length){root.innerHTML="<div class='empty'>目前班級沒有在學學生。</div>";return;}
    const classDraft=(drafts()[cid(c)]||{});
    const rows=students.map(st=>{
      const old=recordsByStudentKey.get(termRecordKey(c.year,c.semester,c.exam,st.id));
      const d=classDraft[String(st.id)]||{},v=k=>d[k]!==undefined?d[k]:(old&&old[k]!=null?old[k]:"");
      const cells=keys.map((k,i)=>"<td><input data-term-score='"+i+"' type='number' min='0' max='100' step='0.01' inputmode='decimal' aria-label='"+subjects[i]+"成績' value='"+escapeHtml(v(k))+"'></td>").join("");
      const sum=keys.every(k=>v(k)!=="")?keys.reduce((n,k)=>n+Number(v(k)),0).toFixed(2).replace(/\.00$/,"").replace(/(\.\d)0$/,"$1"):"—";
      return "<tr data-term-student='"+escapeHtml(st.id)+"'><td class='term-student-name'><span class='term-student-name-text'>"+escapeHtml(st.full_name)+"</span><small>"+escapeHtml(st.student_code||"")+"</small>"+"<span class='term-completion-mark "+(keys.every(k=>v(k)!=="")?"is-complete' role='img' aria-label='七科成績完整' title='七科成績完整'>✓":"is-incomplete' role='img' aria-label='尚有科目未輸入' title='尚有科目未輸入'>●")+"</span>"+"</td>"+cells+
        "<td class='term-total-cell' data-term-total>"+sum+"</td><td><input data-term-class-rank type='number' min='1' step='1' value='"+escapeHtml(v("class_rank"))+"' aria-label='班排'></td>"+
        "<td><input data-term-school-rank type='number' min='1' step='1' value='"+escapeHtml(v("school_rank"))+"' aria-label='校排'></td></tr>";
    }).join("");
    root.innerHTML="<div class='term-roster-toolbar'><span>共 "+students.length+" 位學生；填寫完成後可一次儲存整班。</span><span id='termDraftStatus' class='term-draft-status'>"+(Object.keys(classDraft).length?"已還原上次未完成的輸入":"輸入時會自動暫存")+"</span></div>"+
      "<div class='table-wrap term-roster-wrap'><table class='term-bulk-table'><thead><tr><th>學生</th>"+subjects.map(x=>"<th>"+x+"</th>").join("")+"<th>總分</th><th>班排</th><th>校排</th></tr></thead><tbody>"+rows+"</tbody></table></div>"+
      "<div class='toolbar term-bulk-actions'><button class='btn btn-success' id='termSaveClassButton' type='button'>儲存整班成績</button><button class='btn btn-secondary' id='termClearDraftButton' type='button'>清除未儲存暫存</button></div>";
    root.querySelectorAll("tbody tr").forEach(row=>{
      row.querySelectorAll("input").forEach(input=>{
        if(input.matches("[data-term-score]")) updateScoreInputWarning(input, true);
        input.addEventListener("input",()=>{
          if(input.matches("[data-term-score]")) updateScoreInputWarning(input, true);
          total(row);updateCompletionMark(row);saveDraft(row);
        });
      });
      updateCompletionMark(row);
    });
    $("termSaveClassButton").addEventListener("click",saveClass);
    $("termClearDraftButton").addEventListener("click",()=>{if(!confirm("確定清除目前班級尚未儲存的暫存資料？已存入資料庫的成績不會受到影響。"))return;const all=drafts();delete all[cid(c)];write(draftKey,all);renderRoster();});
    const p=read(prefKey,{});if(p&&cid(p)===cid(c)&&p.studentId){
      const row=Array.from(root.querySelectorAll("tr[data-term-student]")).find(x=>x.dataset.termStudent===String(p.studentId));
      if(row){const sel=p.field==="class_rank"?"[data-term-class-rank]":p.field==="school_rank"?"[data-term-school-rank]":p.field!==""?'[data-term-score="'+p.field+'"]':null;const target=sel?row.querySelector(sel):null;if(target)target.focus({preventScroll:true});}
    }
  }
  async function saveClass(){
    const c=criteria();if(!ready(c)){alert("請先完整選擇學年度、學期、段考及班級。");return;}
    const button=$("termSaveClassButton"),rows=Array.from($("termExamRoster").querySelectorAll("tbody tr[data-term-student]")),payloads=[];
    let oldCount = 0;
    for(const row of rows){
      const vals=keys.map((_,i)=>row.querySelector('[data-term-score="'+i+'"]').value.trim()),cr=row.querySelector("[data-term-class-rank]").value.trim(),sr=row.querySelector("[data-term-school-rank]").value.trim();
      const has=vals.some(x=>x!==""),ranked=cr!==""||sr!=="";
      if(!has&&!ranked)continue;
      if(has&&vals.some(x=>x==="")){alert(row.querySelector(".term-student-name").childNodes[0].textContent.trim()+"：七科成績請全部填寫，或整列留白。");row.querySelector('[data-term-score="'+vals.indexOf("")+'"]').focus();return;}
      for(let i=0;i<vals.length;i++)if(vals[i]!==""&&(!Number.isFinite(Number(vals[i]))||Number(vals[i])<0||Number(vals[i])>100)){alert(subjects[i]+"成績必須介於 0～100 分。");row.querySelector('[data-term-score="'+i+'"]').focus();return;}
      for(const [x,label] of [[cr,"班排"],[sr,"校排"]])if(x!==""&&(!Number.isInteger(Number(x))||Number(x)<1)){alert(label+"請輸入大於 0 的整數，或保持空白。");return;}
      const studentId=row.dataset.termStudent,old=recordsByStudentKey.get(termRecordKey(c.year,c.semester,c.exam,studentId));
      if(old)oldCount++;
      payloads.push({academic_year:c.year,semester:c.semester,exam_number:Number(c.exam),class_name:c.className,student_id:studentId,
        subject_chinese:vals[0]===""?null:Number(vals[0]),subject_english:vals[1]===""?null:Number(vals[1]),subject_math:vals[2]===""?null:Number(vals[2]),
        subject_history:vals[3]===""?null:Number(vals[3]),subject_geography:vals[4]===""?null:Number(vals[4]),subject_civics:vals[5]===""?null:Number(vals[5]),
        subject_natural:vals[6]===""?null:Number(vals[6]),total_score:has?vals.reduce((a,x)=>a+Number(x),0):(old?old.total_score:null),
        class_rank:cr===""?null:Number(cr),school_rank:sr===""?null:Number(sr),updated_at:new Date().toISOString()});
    }
    if(!payloads.length){alert("目前沒有可儲存的成績或排名。");return;}
    if(oldCount&&!confirm("本次將儲存 "+payloads.length+" 位學生，其中 "+oldCount+" 位已有段考資料，是否確認更新？"))return;
    button.disabled=true;button.textContent="整班儲存中……";
    try{
      const result=await db.from("term_exam_scores").upsert(payloads,{onConflict:"academic_year,semester,exam_number,student_id"});if(result.error)throw result.error;
      const all=drafts();delete all[cid(c)];write(draftKey,all);await loadRecords();renderRoster();
      showMessage("整班段考成績已儲存，共 "+payloads.length+" 位學生。","success",true);
    }catch(error){alert("整班儲存失敗："+error.message+"。輸入暫存仍保留，可修正後再試。");}
    finally{const b=$("termSaveClassButton");if(b){b.disabled=false;b.textContent="儲存整班成績";}}
  }
  function updateClasses(){const sel=$("termClass"),old=sel.value,list=available($("termAcademicYear").value);sel.innerHTML="<option value=''>請選擇班級</option>"+list.map(x=>"<option value='"+x+"'>"+x+"</option>").join("");sel.value=list.includes(old)?old:"";}
  function renderRecords(){
    const root=$("termExamRecords"),p={year:root.querySelector("#termFilterYear")?.value||"",semester:root.querySelector("#termFilterSemester")?.value||"",exam:root.querySelector("#termFilterExam")?.value||"",className:root.querySelector("#termFilterClass")?.value||"",subject:root.querySelector("#termFilterSubject")?.value||"total_score",name:root.querySelector("#termFilterStudentName")?.value||""};
    if(!overviewStaticCache){
      overviewStaticCache={
        years:[...new Set(records.map(x=>String(x.academic_year||"")))].filter(Boolean).sort((a,b)=>b.localeCompare(a,"zh-Hant",{numeric:true})),
        options:subjects.map((name,i)=>({key:keys[i],name})).concat([{key:"total_score",name:"總分"},{key:"class_rank",name:"班排名"},{key:"school_rank",name:"校排名"}]),
        studentsById:studentsByIdCache
      };
    }
    const years=overviewStaticCache.years,options=overviewStaticCache.options,studentsById=overviewStaticCache.studentsById;
    const chosen=options.find(x=>x.key===p.subject)||options[0],q=p.name.trim().toLocaleLowerCase();
    const filtered=records.filter(r=>{const student=studentsById.get(String(r.student_id));const studentName=String(student?.full_name||"");return(!p.year||String(r.academic_year)===p.year)&&(!p.semester||r.semester===p.semester)&&(!p.exam||String(r.exam_number)===p.exam)&&(!p.className||r.class_name===p.className)&&(!q||studentName.toLocaleLowerCase().includes(q));});
    const sorted=filtered.slice().sort((a,b)=>{const av=a[chosen.key],bv=b[chosen.key];const an=av==null||av===""?null:Number(av),bn=bv==null||bv===""?null:Number(bv);if(an===null&&bn!==null)return 1;if(bn===null&&an!==null)return -1;if(an!==null&&bn!==null&&an!==bn)return bn-an;return String(studentsById.get(String(a.student_id))?.full_name||"").localeCompare(String(studentsById.get(String(b.student_id))?.full_name||""),"zh-Hant");});
    const rows=sorted.map(r=>{const st=studentsById.get(String(r.student_id)),v=r[chosen.key],score=chosen.key!=="class_rank"&&chosen.key!=="school_rank";return "<tr><td>"+escapeHtml(r.academic_year+" ("+(r.semester==="上學期"?"上":"下")+") "+(["","第一次","第二次","第三次"][Number(r.exam_number)]||""))+"</td><td>"+escapeHtml(r.class_name)+"</td><td>"+escapeHtml(st?.full_name||"學生資料不存在")+"</td><td>"+(v==null?"—":score&&Number(v)<60?"<span class='low-score'>"+escapeHtml(v)+"</span>":escapeHtml(v))+"</td><td class='action-cell'><div class='action-buttons'><button class='btn btn-small' data-term-edit='"+escapeHtml(r.id)+"'>修改</button><button class='btn btn-danger btn-small' data-term-delete='"+escapeHtml(r.id)+"'>刪除</button></div></td></tr>";}).join("");
    root.innerHTML="<div class='form-grid term-exam-overview-filters' style='row-gap:8px;column-gap:12px;margin-bottom:14px'><div class='field'><label>學年度</label><select id='termFilterYear'><option value=''>全部學年度</option>"+years.map(y=>"<option>"+escapeHtml(y)+"</option>").join("")+"</select></div><div class='field'><label>上下學期</label><select id='termFilterSemester'><option value=''>全部學期</option><option>上學期</option><option>下學期</option></select></div><div class='field'><label>段考</label><select id='termFilterExam'><option value=''>全部段考</option><option value='1'>第一次</option><option value='2'>第二次</option><option value='3'>第三次</option></select></div><div class='field'><label>班級</label><select id='termFilterClass'><option value=''>全部班級</option>"+classes.map(x=>"<option>"+x+"</option>").join("")+"</select></div><div class='field'><label>科目</label><select id='termFilterSubject'>"+options.map(x=>"<option value='"+x.key+"'>"+x.name+"</option>").join("")+"</select></div><div class='field'><label>學生姓名</label><input id='termFilterStudentName' placeholder='輸入學生姓名搜尋'></div></div>"+
      (filtered.length?"<div class='table-wrap'><table class='term-exam-overview-table'><thead><tr><th>考試</th><th>班級</th><th>學生</th><th>"+chosen.name+"</th><th>操作</th></tr></thead><tbody>"+rows+"</tbody></table></div>":"<div class='empty'>"+(records.length?"目前篩選條件沒有符合的段考成績。":"目前尚無段考成績。")+"</div>");
    for(const id of ["termFilterYear","termFilterSemester","termFilterExam","termFilterClass","termFilterSubject","termFilterStudentName"]){const el=root.querySelector("#"+id);const map={"termFilterYear":"year","termFilterSemester":"semester","termFilterExam":"exam","termFilterClass":"className","termFilterSubject":"subject","termFilterStudentName":"name"};el.value=p[map[id]]||"";if(id==="termFilterSubject")el.value=chosen.key;el.addEventListener("change",renderRecords);}
  }
  async function loadRecords(){const res=await db.from("term_exam_scores").select("id, academic_year, semester, exam_number, class_name, student_id, subject_chinese, subject_english, subject_math, subject_history, subject_geography, subject_civics, subject_natural, total_score, class_rank, school_rank").order("academic_year",{ascending:false}).order("semester").order("exam_number").order("class_name").order("student_id");if(res.error)throw res.error;records=res.data||[];recordsById=new Map(records.map(record=>[String(record.id),record]));recordsByStudentKey=new Map();records.forEach(record=>recordsByStudentKey.set(termRecordKey(record.academic_year,record.semester,record.exam_number,record.student_id),record));overviewStaticCache=null;renderRecords();}
  const saved=read(prefKey,{});
  content.innerHTML="<h2 class='section-title'>段考成績登錄</h2><div class='panel term-exam-form'><div class='form-grid'>"+
    "<div class='field'><label for='termAcademicYear'>學年度（手動輸入）</label><input id='termAcademicYear' maxlength='20' placeholder='例如：115' value='"+escapeHtml(saved.year||"")+"'></div>"+
    "<div class='field'><label for='termSemester'>學期</label><select id='termSemester'><option value=''>請選擇學期</option><option value='上學期'>上學期</option><option value='下學期'>下學期</option></select></div>"+
    "<div class='field'><label for='termExamNumber'>段考</label><select id='termExamNumber'><option value=''>請選擇段考</option><option value='1'>第一次段考</option><option value='2'>第二次段考</option><option value='3'>第三次段考</option></select></div>"+
    "<div class='field'><label for='termClass'>班級</label><select id='termClass'><option value=''>請選擇班級</option>"+available(saved.year||"").map(x=>"<option value='"+x+"'>"+x+"</option>").join("")+"</select></div></div></div>"+
    "<div id='termExamRoster'><div class='empty'>請先選擇學年度、學期、段考及班級。</div></div><div class='panel'><h3 id='termExamOverviewTitle'>段考成績總覽</h3><div id='termExamRecords'>資料載入中……</div></div>";
  $("termSemester").value=saved.semester||"";$("termExamNumber").value=saved.exam||"";$("termClass").value=available(saved.year||"").includes(saved.className)?saved.className:"";
  for(const id of ["termAcademicYear","termSemester","termExamNumber","termClass"]){$(id).addEventListener(id==="termAcademicYear"?"input":"change",()=>{if(id==="termAcademicYear")updateClasses();write(prefKey,criteria());renderRoster();});}
  try{
    await loadRecords();renderRoster();
    $("termExamRecords").addEventListener("click", async e => {
      const edit = e.target.closest("[data-term-edit]");
      if (edit) {
        const rec = recordsById.get(edit.dataset.termEdit);
        if (!rec) return;
        $("termAcademicYear").value = rec.academic_year || "";
        updateClasses();
        $("termSemester").value = rec.semester || "";
        $("termExamNumber").value = String(rec.exam_number || "");
        $("termClass").value = rec.class_name || "";
        write(prefKey, criteria());
        renderRoster();
        const row = Array.from($("termExamRoster").querySelectorAll("tr[data-term-student]"))
          .find(x => x.dataset.termStudent === String(rec.student_id));
        if (row) {
          keys.forEach((key, index) => {
            row.querySelector('[data-term-score="' + index + '"]').value =
              rec[key] == null ? "" : rec[key];
          });
          row.querySelector("[data-term-class-rank]").value =
            rec.class_rank == null ? "" : rec.class_rank;
          row.querySelector("[data-term-school-rank]").value =
            rec.school_rank == null ? "" : rec.school_rank;
          total(row);
          saveDraft(row);
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      const del = e.target.closest("[data-term-delete]");
      if (!del || del.disabled) return;
      const rec = recordsById.get(del.dataset.termDelete);
      if (!rec || !confirm("確定刪除這筆段考成績嗎？")) return;

      del.disabled = true;
      const originalText = del.textContent;
      del.textContent = "刪除中……";
      try {
        const result = await db.from("term_exam_scores").delete().eq("id", rec.id);
        if (result.error) throw result.error;
        await loadRecords();
        renderRoster();
        showMessage("段考成績已刪除。", "success", true);
      } catch (error) {
        console.error("刪除段考成績失敗：", error);
        alert("刪除段考成績失敗：" + (error?.message || "請稍後再試。"));
      } finally {
        if (del.isConnected) {
          del.disabled = false;
          del.textContent = originalText;
        }
      }
    });
  }catch(error){$("termExamRecords").innerHTML="<div class='system-message error' style='display:block'>讀取段考成績失敗："+escapeHtml(error.message)+"</div>";}
}
// ==================================================
// 段考成績登錄結束
// ==================================================

// ==================================================
// 歷屆畢業學生模考成績管理（獨立資料表）
// ==================================================

async function renderAlumniMockScores() {
  const content = $("adminContent");
  content.innerHTML =
    "<h2 class='section-title'>模考成績</h2>" +
    "<p class='muted'>此區資料獨立保存，不會影響目前在籍學生、家長查詢或教師查詢。</p>" +
    "<div class='alumni-score-form'>" +
      "<h3 id='alumniFormTitle' style='margin:0 0 7px;color:#23466b'>新增模考成績</h3>" +
      "<form id='alumniScoreForm'>" +
        "<div class='alumni-score-basic-grid'>" +
          "<div class='field'><label for='alumniAcademicYear'>學年度</label><input id='alumniAcademicYear' type='text' placeholder='例如：114學年度' maxlength='30' required></div>" +
          "<div class='field'><label for='alumniStudentName'>學生姓名</label><input id='alumniStudentName' type='text' maxlength='50' required></div>" +
          "<div class='field'><label for='alumniExamScope'>新增類型</label><select id='alumniExamScope' required><option value=''>請選擇類型</option><option value='班內模考'>班內模考</option><option value='正式模考'>北北基模考</option><option value='會考'>會考</option></select></div>" +
          "<div class='field' id='alumniExamRangeField'><label for='alumniExamRange'>考試範圍</label><input id='alumniExamRange' type='text' maxlength='100' placeholder='例如：第一次模擬考全範圍' required></div>" +
          "<div class='field alumni-rank-field' id='alumniGenderRankField' style='display:none'><label for='alumniGenderRank'>區（男／女）排名</label><input id='alumniGenderRank' type='number' min='1' step='1' placeholder='請輸入名次'></div>" +
          "<div class='field alumni-rank-field' id='alumniDistrictRankField' style='display:none'><label for='alumniDistrictRank'>區排名</label><input id='alumniDistrictRank' type='number' min='1' step='1' placeholder='請輸入名次'></div>" +
          "<div class='field alumni-rank-field' id='alumniCompositionScoreField' style='display:none'><label for='alumniCompositionScore'>作文（0～1.2分）</label><input id='alumniCompositionScore' type='number' min='0' max='1.2' step='0.1' placeholder='0～1.2'></div><div class='field' id='alumniAdmissionSchoolField' style='display:none'><label for='alumniAdmissionSchool'>錄取學校</label><input id='alumniAdmissionSchool' type='text' maxlength='100' placeholder='請輸入錄取學校'></div>" +
        "</div>" +
        "<div class='alumni-score-subject-grid'>" +
          "<div class='field'><label for='alumniChinese'>國文級分（0～7）</label><input id='alumniChinese' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='field'><label for='alumniMath'>數學級分（0～7）</label><input id='alumniMath' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='field'><label for='alumniEnglish'>英文級分（0～7）</label><input id='alumniEnglish' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='field'><label for='alumniSocial'>社會級分（0～7）</label><input id='alumniSocial' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='field'><label for='alumniScience'>自然級分（0～7）</label><input id='alumniScience' type='number' min='0' max='7' step='1' required></div>" +
          "<div class='alumni-score-total'><span>五科總級分</span><strong id='alumniTotalPreview'>0</strong></div>" +
        "</div>" +
        "<div class='toolbar' style='margin-bottom:0'>" +
          "<button class='btn btn-success' id='alumniSaveButton' type='submit'>新增成績</button>" +
          "<button class='btn btn-secondary' id='alumniCancelEdit' type='button' style='display:none'>取消修改</button>" +
        "</div>" +
      "</form>" +
    "</div>" +
    "<h3 id='alumniHistoryTitle' style='color:#23466b;margin:0 0 10px'>歷屆模考資料</h3>" +
    "<div class='alumni-filter-row'>" +
      "<select id='alumniYearFilter' aria-label='依學年度查詢'><option value=''>全部學年度</option></select>" +
      "<input id='alumniNameFilter' type='text' placeholder='搜尋學生姓名' aria-label='搜尋學生姓名'>" +
      "<select id='alumniTypeFilter' aria-label='依類型篩選'><option value=''>全部類型</option><option value='班內模考'>班內模考</option><option value='正式模考'>北北基模考</option><option value='會考'>會考</option></select>" +
      "<select id='alumniRangeFilter' aria-label='依考試範圍篩選'><option value=''>全部考試範圍</option></select>" +
      "<select id='alumniSubjectFilter' aria-label='依考試科目篩選'><option value=''>全部考試科目</option><option value='chinese'>國文</option><option value='math'>數學</option><option value='english'>英文</option><option value='social_studies'>社會</option><option value='natural_science'>自然</option></select>" +
      "<button type='button' class='btn btn-success' id='alumniFilteredExportButton' style='height:40px;min-height:40px;padding:0 10px;font-size: 14px;white-space:nowrap'>匯出成績</button>" +
    "</div>" +
    "<div id='alumniScoreTableArea'><div class='muted'>資料載入中……</div></div>";

  let editingId = "";
  let records = [];
  const fields = [
    ["chinese", "alumniChinese"],
    ["math", "alumniMath"],
    ["english", "alumniEnglish"],
    ["social_studies", "alumniSocial"],
    ["natural_science", "alumniScience"]
  ];

  function updateRankFields() {
    const examType = $("alumniExamScope").value;
    const isFormal = examType === "正式模考";
    const isExam = examType === "會考";
    $("alumniExamRangeField").style.display = isExam ? "none" : "block";
    $("alumniExamRange").required = !isExam;
    $("alumniGenderRankField").style.display = isFormal ? "block" : "none";
    $("alumniDistrictRankField").style.display = isFormal ? "block" : "none";
    $("alumniCompositionScoreField").style.display = (isFormal || isExam) ? "block" : "none";
    $("alumniAdmissionSchoolField").style.display = isExam ? "block" : "none";
  }

  function updateTotalPreview() {
    const subjectTotal = fields.reduce(function (sum, item) {
      const raw = $(item[1]).value;
      const value = Number(raw);
      return sum + (raw !== "" && Number.isInteger(value) && value >= 0 && value <= 7 ? value : 0);
    }, 0);
    const examType = $("alumniExamScope").value;
    const includesComposition = examType === "正式模考" || examType === "會考";
    const compositionRaw = $("alumniCompositionScore").value;
    const composition = includesComposition && compositionRaw !== "" ? Number(compositionRaw) : 0;
    const total = subjectTotal + (Number.isFinite(composition) ? composition : 0);
    $("alumniTotalPreview").textContent = Number.isInteger(total) ? String(total) : total.toFixed(1);
    const totalLabel = $("alumniTotalPreview").previousElementSibling;
    if (totalLabel) totalLabel.textContent = includesComposition ? "六科總級分" : "五科總級分";
  }

  function resetForm() {
    // 新增多筆資料時保留目前選定的學年度與模考類型，避免管理員重複輸入。
    const keepAcademicYear = $("alumniAcademicYear").value;
    const keepExamScope = $("alumniExamScope").value;
    const keepExamRange = $("alumniExamRange").value;
    editingId = "";
    $("alumniScoreForm").reset();
    $("alumniAcademicYear").value = keepAcademicYear;
    $("alumniExamScope").value = keepExamScope;
    $("alumniExamRange").value = keepExamRange;
    $("alumniGenderRank").value = "";
    $("alumniDistrictRank").value = "";
    $("alumniCompositionScore").value = "";
    $("alumniAdmissionSchool").value = "";
    updateRankFields();
    $("alumniFormTitle").textContent = "新增模考成績";
    $("alumniSaveButton").disabled = false;
    $("alumniSaveButton").textContent = "新增成績";
    $("alumniCancelEdit").style.display = "none";
    updateTotalPreview();
  }

  function startEdit(record) {
    editingId = String(record.id);
    $("alumniAcademicYear").value = record.academic_year || "";
    $("alumniStudentName").value = record.student_name || "";
    $("alumniExamScope").value = record.exam_scope || "";
    $("alumniExamRange").value = record.exam_range || "";
    $("alumniGenderRank").value = record.district_gender_rank == null ? "" : record.district_gender_rank;
    $("alumniDistrictRank").value = record.district_rank == null ? "" : record.district_rank;
    $("alumniCompositionScore").value = record.composition_score == null ? "" : record.composition_score;
    $("alumniAdmissionSchool").value = record.admission_school || "";
    updateRankFields();
    fields.forEach(function (item) { $(item[1]).value = record[item[0]]; });
    $("alumniFormTitle").textContent = "修改模考成績";
    $("alumniSaveButton").disabled = false;
    $("alumniSaveButton").textContent = "儲存修改";
    $("alumniCancelEdit").style.display = "inline-block";
    updateTotalPreview();
    $("alumniScoreForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderRows() {
    const yearQuery = $("alumniYearFilter").value.trim().toLowerCase();
    const nameQuery = $("alumniNameFilter").value.trim().toLowerCase();
    const typeQuery = $("alumniTypeFilter").value;
    const rangeQuery = $("alumniRangeFilter").value;
    const subjectQuery = $("alumniSubjectFilter").value;
    const filtered = records.filter(function (record) {
      return String(record.academic_year || "").toLowerCase().includes(yearQuery) &&
        String(record.student_name || "").toLowerCase().includes(nameQuery) &&
        (!typeQuery || String(record.exam_scope || "") === typeQuery) &&
        (!rangeQuery || record.exam_scope === "會考" || String(record.exam_range || "") === rangeQuery);
    });
    const isOnlyCeesExam = typeQuery === "會考";
    if (!filtered.length) {
      $("alumniScoreTableArea").innerHTML = "<div class='empty'>" +
        (records.length ? "沒有符合查詢條件的資料。" : "目前尚無模考成績。") + "</div>";
      $("alumniFilteredExportButton").disabled = true;
      return;
    }
    const subjectColumns = [
      ["chinese", "國文"],
      ["math", "數學"],
      ["english", "英文"],
      ["social_studies", "社會"],
      ["natural_science", "自然"]
    ].filter(function (item) { return !subjectQuery || item[0] === subjectQuery; });
    const rows = filtered.map(function (record) {
      const subjectCells = subjectColumns.map(function (item) {
        return "<td class='alumni-score-number'>" + escapeHtml(record[item[0]]) + "</td>";
      }).join("");
      return "<tr>" +
        "<td>" + escapeHtml(record.academic_year) + "</td>" +
        "<td>" + escapeHtml(record.student_name) + "</td>" +
        "<td>" + escapeHtml(record.exam_scope === "正式模考" ? "北北基" : record.exam_scope === "班內模考" ? "班內" : record.exam_scope) + "</td>" +
        (isOnlyCeesExam ? "" : "<td>" + escapeHtml(record.exam_scope === "會考" ? "" : (record.exam_range || "")) + "</td>" +
        "<td class='alumni-score-number'>" + (record.exam_scope === "正式模考" && record.district_gender_rank != null ? escapeHtml(Number(record.district_gender_rank).toLocaleString("en-US")) : "—") + "</td>" +
        "<td class='alumni-score-number'>" + (record.exam_scope === "正式模考" && record.district_rank != null ? escapeHtml(Number(record.district_rank).toLocaleString("en-US")) : "—") + "</td>") +
        "<td>" + (record.exam_scope === "會考" ? escapeHtml(record.admission_school || "") : "") + "</td>" +
        subjectCells +
        "<td class='alumni-score-number'>" + (record.composition_score != null && (record.exam_scope === "正式模考" || record.exam_scope === "會考") ? escapeHtml(record.composition_score) : "—") + "</td>" +
        "<td class='alumni-score-number'><strong>" + escapeHtml(record.total_grade) + "</strong></td>" +
        "<td><div class='alumni-score-actions'>" +
          "<button type='button' class='btn btn-small' data-alumni-edit='" + escapeHtml(record.id) + "'>修改</button>" +
          "<button type='button' class='btn btn-danger btn-small' data-alumni-delete='" + escapeHtml(record.id) + "'>刪除</button>" +
        "</div></td></tr>";
    }).join("");
    const subjectHeaders = subjectColumns.map(function (item) {
      return "<th>" + item[1] + "</th>";
    }).join("");
    $("alumniScoreTableArea").innerHTML =
      "<div class='table-wrap'><table class='alumni-score-table'>" +
        "<thead><tr><th>學年度</th><th>學生姓名</th><th>模考類型</th>" + (isOnlyCeesExam ? "" : "<th>考試範圍</th><th>區（男／女）排名</th><th>區排名</th>") + "<th>錄取學校</th>" + subjectHeaders + "<th>作文</th><th>總級分</th><th>操作</th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div>" +
      "<p class='muted'>共 " + filtered.length + " 筆資料</p>";
    $("alumniFilteredExportButton").disabled = filtered.length === 0;
  }

  async function loadRecords() {
    const result = await db.from("alumni_mock_scores").select("id, academic_year, student_name, exam_scope, exam_range, district_gender_rank, district_rank, composition_score, admission_school, chinese, math, english, social_studies, natural_science, total_grade")
      .order("academic_year", { ascending: false })
      .order("exam_scope", { ascending: true })
      .order("total_grade", { ascending: false })
      .order("student_name", { ascending: true });
    if (result.error) {
      $("alumniScoreTableArea").innerHTML =
        "<div class='system-message error' style='display:block'>讀取歷屆成績失敗：" +
        escapeHtml(result.error.message) + "</div>";
      return;
    }
    records = result.data || [];
    function compareExamRange(a, b) {
      const left = String(a || "").trim();
      const right = String(b || "").trim();
      const leftIsRange = /[~～至-]/.test(left);
      const rightIsRange = /[~～至-]/.test(right);
      if (leftIsRange !== rightIsRange) return leftIsRange ? 1 : -1;
      return left.localeCompare(right, "zh-Hant", { numeric: true });
    }
    records.sort(function (a, b) {
      // 依學年度、模考類別、考試範圍排序；同一組內再依總級分由高到低排列。
      const yearOrder = String(b.academic_year || "").localeCompare(
        String(a.academic_year || ""), "zh-Hant", { numeric: true }
      );
      if (yearOrder) return yearOrder;
      const categoryOrder = { "班內模考": 0, "正式模考": 1, "會考": 2 };
      const aCategory = Object.prototype.hasOwnProperty.call(categoryOrder, a.exam_scope)
        ? categoryOrder[a.exam_scope] : 99;
      const bCategory = Object.prototype.hasOwnProperty.call(categoryOrder, b.exam_scope)
        ? categoryOrder[b.exam_scope] : 99;
      if (aCategory !== bCategory) return aCategory - bCategory;
      // 會考不使用考試範圍分組，直接依六科總級分由高到低排列。
      if (a.exam_scope !== "會考" || b.exam_scope !== "會考") {
        const rangeOrder = compareExamRange(a.exam_range, b.exam_range);
        if (rangeOrder) return rangeOrder;
      }
      const scoreA = Number(a.total_grade);
      const scoreB = Number(b.total_grade);
      const scoreOrder = (Number.isFinite(scoreB) ? scoreB : -Infinity) -
        (Number.isFinite(scoreA) ? scoreA : -Infinity);
      if (scoreOrder) return scoreOrder;
      return String(a.student_name || "").localeCompare(
        String(b.student_name || ""), "zh-Hant", { numeric: true }
      );
    });
    const yearSelect = $("alumniYearFilter");
    const selectedYear = yearSelect.value;
    const years = Array.from(new Set(records.map(function (record) {
      return String(record.academic_year || "").trim();
    }).filter(Boolean))).sort(function (a, b) {
      return b.localeCompare(a, "zh-Hant", { numeric: true });
    });
    yearSelect.innerHTML = "<option value=''>全部學年度</option>" +
      years.map(function (year) {
        return "<option value='" + escapeHtml(year) + "'>" + escapeHtml(year) + "</option>";
      }).join("");
    if (years.includes(selectedYear)) yearSelect.value = selectedYear;
    const rangeSelect = $("alumniRangeFilter");
    const selectedRange = rangeSelect.value;
    const ranges = Array.from(new Set(records.filter(function (record) {
      return record.exam_scope !== "會考";
    }).map(function (record) {
      return String(record.exam_range || "").trim();
    }).filter(Boolean))).sort(compareExamRange);
    rangeSelect.innerHTML = "<option value=''>全部考試範圍</option>" +
      ranges.map(function (range) {
        return "<option value='" + escapeHtml(range) + "'>" + escapeHtml(range) + "</option>";
      }).join("");
    if (ranges.includes(selectedRange)) rangeSelect.value = selectedRange;
    renderRows();
  }

  fields.forEach(function (item) {
    $(item[1]).addEventListener("input", updateTotalPreview);
  });
  $("alumniCompositionScore").addEventListener("input", updateTotalPreview);
  $("alumniYearFilter").addEventListener("change", renderRows);
  $("alumniNameFilter").addEventListener("input", renderRows);
  $("alumniTypeFilter").addEventListener("change", renderRows);
  $("alumniRangeFilter").addEventListener("change", renderRows);
  $("alumniSubjectFilter").addEventListener("change", renderRows);
  $("alumniFilteredExportButton").addEventListener("click", function () {
    const yearQuery = $("alumniYearFilter").value.trim().toLowerCase();
    const nameQuery = $("alumniNameFilter").value.trim().toLowerCase();
    const typeQuery = $("alumniTypeFilter").value;
    const rangeQuery = $("alumniRangeFilter").value;
    const subjectQuery = $("alumniSubjectFilter").value;
    const filtered = records.filter(function (record) {
      return String(record.academic_year || "").toLowerCase().includes(yearQuery) &&
        String(record.student_name || "").toLowerCase().includes(nameQuery) &&
        (!typeQuery || String(record.exam_scope || "") === typeQuery) &&
        (!rangeQuery || record.exam_scope === "會考" || String(record.exam_range || "") === rangeQuery);
    });
    if (!filtered.length) {
      alert("目前沒有符合篩選條件的成績可匯出。");
      return;
    }
    const subjectFields = [
      ["chinese", "國文"],
      ["math", "數學"],
      ["english", "英文"],
      ["social_studies", "社會"],
      ["natural_science", "自然"]
    ].filter(function (item) { return !subjectQuery || item[0] === subjectQuery; });
    const headers = ["學年度", "學生姓名", "模考類型", "考試範圍", "區（男／女）排名", "區排名", "錄取學校"]
      .concat(subjectFields.map(function (item) { return item[1]; }))
      .concat(["作文", "總級分"]);
    const rows = [headers.map(csvCell).join(",")].concat(filtered.map(function (record) {
      return [
        record.academic_year,
        record.student_name,
        record.exam_scope === "正式模考" ? "北北基模考" : record.exam_scope,
        record.exam_range,
        record.exam_scope === "正式模考" ? record.district_gender_rank : "",
        record.exam_scope === "正式模考" ? record.district_rank : "",
        record.exam_scope === "會考" ? record.admission_school : ""
      ].concat(subjectFields.map(function (item) { return record[item[0]]; }))
        .concat([
          record.composition_score != null && (record.exam_scope === "正式模考" || record.exam_scope === "會考") ? record.composition_score : "",
          record.total_grade
        ]).map(csvCell).join(",");
    }));
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    downloadText("小象歷屆模考成績_" + today + ".csv", rows.join("\r\n"), "text/csv;charset=utf-8");
    showMessage("已匯出符合篩選條件的 " + filtered.length + " 筆模考成績。", "success");
  });
  $("alumniCancelEdit").addEventListener("click", resetForm);
  $("alumniExamScope").addEventListener("change", function () { updateRankFields(); updateTotalPreview(); });
  updateRankFields();

  $("alumniScoreForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const payload = {
      academic_year: $("alumniAcademicYear").value.trim(),
      student_name: $("alumniStudentName").value.trim(),
      exam_scope: $("alumniExamScope").value.trim(),
      exam_range: $("alumniExamScope").value === "會考" ? "" : $("alumniExamRange").value.trim(),
      district_gender_rank: null,
      district_rank: null,
      composition_score: null,
      admission_school: null
    };
    if (payload.exam_scope === "正式模考" || payload.exam_scope === "會考") {
      const genderRankRaw = $("alumniGenderRank").value.trim();
      const districtRankRaw = $("alumniDistrictRank").value.trim();
      if (genderRankRaw !== "" && (!Number.isInteger(Number(genderRankRaw)) || Number(genderRankRaw) < 1)) {
        alert("區（男／女）排名請填寫大於 0 的整數。");
        $("alumniGenderRank").focus();
        return;
      }
      if (districtRankRaw !== "" && (!Number.isInteger(Number(districtRankRaw)) || Number(districtRankRaw) < 1)) {
        alert("區排名請填寫大於 0 的整數。");
        $("alumniDistrictRank").focus();
        return;
      }
      if (payload.exam_scope === "正式模考") {
        payload.district_gender_rank = genderRankRaw === "" ? null : Number(genderRankRaw);
        payload.district_rank = districtRankRaw === "" ? null : Number(districtRankRaw);
      }
      const compositionRaw = $("alumniCompositionScore").value.trim();
      if (compositionRaw !== "") {
        const compositionValue = Number(compositionRaw);
        if (!Number.isFinite(compositionValue) || compositionValue < 0 || compositionValue > 1.2 ||
            Math.abs(compositionValue * 10 - Math.round(compositionValue * 10)) > 1e-8) {
          alert("作文請輸入 0～1.2 分，最多至小數點後 1 位。");
          $("alumniCompositionScore").focus();
          return;
        }
        payload.composition_score = compositionValue;
      }
      if (payload.exam_scope === "會考") {
        payload.admission_school = $("alumniAdmissionSchool").value.trim() || null;
      }
    }
    for (const item of fields) {
      const raw = $(item[1]).value;
      const value = Number(raw);
      if (raw === "" || !Number.isInteger(value) || value < 0 || value > 7) {
        alert("五科級分都必須填寫 0～7 的整數。");
        $(item[1]).focus();
        return;
      }
      payload[item[0]] = value;
    }
    if (!payload.academic_year || !payload.student_name || !payload.exam_scope ||
        (payload.exam_scope !== "會考" && !payload.exam_range)) {
      alert(payload.exam_scope === "會考"
        ? "學年度、學生姓名及模考類型都必須填寫。"
        : "學年度、學生姓名、模考類型及考試範圍都必須填寫。");
      return;
    }
    // 同一場模考（學年度＋模考類型＋考試範圍）不可重複登錄同一位學生。
    // 修改既有資料時排除目前這筆，避免自己與自己比對。
    const normalizedName = payload.student_name.replace(/\\s+/g, "").toLocaleLowerCase();
    const duplicate = records.find(function (record) {
      const existingName = String(record.student_name || "").replace(/\\s+/g, "").toLocaleLowerCase();
      return String(record.academic_year || "").trim() === payload.academic_year &&
        String(record.exam_scope || "").trim() === payload.exam_scope &&
        String(record.exam_range || "").trim() === payload.exam_range &&
        existingName === normalizedName &&
        String(record.id) !== String(editingId || "");
    });
    if (duplicate) {
      alert("已有「" + payload.student_name + "」在這次考試的成績，請勿重複輸入。");
      $("alumniStudentName").focus();
      return;
    }

    const button = $("alumniSaveButton");
    button.disabled = true;
    button.textContent = "儲存中……";
    try {
      let result;
      if (editingId) {
        result = await db.from("alumni_mock_scores")
          .update(Object.assign({}, payload, { updated_at: new Date().toISOString() }))
          .eq("id", editingId);
      } else {
        result = await db.from("alumni_mock_scores").insert(payload);
      }
      if (result.error) throw result.error;
      const wasEditing = !!editingId;
      resetForm();
      await loadRecords();
      showMessage(wasEditing ? "模考成績已修改。" : "模考成績已新增。", "success", true);
    } catch (error) {
      alert("儲存歷屆成績失敗：" + error.message);
      button.disabled = false;
      button.textContent = editingId ? "儲存修改" : "新增成績";
    }
  });

  $("alumniScoreTableArea").addEventListener("click", async function (event) {
    const editButton = event.target.closest("[data-alumni-edit]");
    if (editButton) {
      const record = records.find(item => String(item.id) === String(editButton.dataset.alumniEdit));
      if (record) startEdit(record);
      return;
    }

    const deleteButton = event.target.closest("[data-alumni-delete]");
    if (!deleteButton || deleteButton.disabled) return;
    const record = records.find(item => String(item.id) === String(deleteButton.dataset.alumniDelete));
    if (!record) return;
    if (!confirm("確定要刪除「" + record.student_name + "」的「" + record.exam_scope + "」成績嗎？此動作無法復原。")) return;

    deleteButton.disabled = true;
    deleteButton.textContent = "刪除中……";
    try {
      const result = await db.from("alumni_mock_scores").delete().eq("id", record.id);
      if (result.error) throw result.error;
      if (editingId === String(record.id)) resetForm();
      await loadRecords();
      showMessage("模考成績已刪除。", "success", true);
    } catch (error) {
      console.error("刪除歷屆模考成績失敗：", error);
      alert("刪除歷屆成績失敗：" + (error && error.message ? error.message : "請確認網路連線後重試。"));
    } finally {
      if (deleteButton.isConnected) {
        deleteButton.disabled = false;
        deleteButton.textContent = "刪除";
      }
    }
  });

  updateTotalPreview();
  await loadRecords();
}

// ==================================================
// 模考成績管理結束
// ==================================================

// ==================================================
// 15. 家長端畫面
// ==================================================

let parentDashboardRequestId = 0;
let parentExamReleaseRefreshTimer = null;

async function renderParentDashboard() {
  if (parentExamReleaseRefreshTimer) {
    window.clearTimeout(parentExamReleaseRefreshTimer);
    parentExamReleaseRefreshTimer = null;
  }
  const requestId = ++parentDashboardRequestId;
  document.body.classList.add("parent-page");
  const content = $("appRoot");

  if (!document.getElementById("parentAttendanceSummaryStyles")) {
    const attendanceStyle = document.createElement("style");
    attendanceStyle.id = "parentAttendanceSummaryStyles";
    attendanceStyle.textContent =
      ".parent-attendance-summary{margin:0 0 18px;padding:0}" +
      ".parent-attendance-summary-title{margin:0 0 10px;color:#526477;font-size: 20px;font-weight:800;line-height:1.4}" +
      ".parent-attendance-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}" +
      ".parent-attendance-stat{display:flex;flex-direction:row;align-items:center;gap:7px;min-width:0;padding:12px 14px;border:1px solid #dce5ed;border-radius:10px;background:#f5f8fb}" +
      " .parent-attendance-stat-label{color:#647487;font-size: 16px !important;font-weight:700;line-height:1.45}" +
      ".parent-attendance-stat-value{color:#31506c;font-size: 20px;font-weight:800;line-height:1.35;font-variant-numeric:tabular-nums}" +
      " .parent-attendance-stat-value small{font-size: 20px !important;font-weight:800 !important}" +
      ".parent-attendance-stat-value.attendance-alert{color:#bd3030;font-weight:800}" +
      ".parent-attendance-stat-value.attendance-alert small{color:inherit !important;font-weight:800 !important;opacity:1 !important}" +
      ".parent-attendance-empty,.parent-attendance-error{margin:0 0 16px;padding:11px 13px;border:1px solid #dce5ed;border-radius:10px;background:#f5f8fb;color:#647487;font-size: 14px;line-height:1.6}" +
      ".parent-attendance-error{border-color:#f0d0d0;background:#fff5f5;color:#a32626}" +
      "@media(max-width:380px){.parent-attendance-summary-grid{gap:7px}.parent-attendance-stat{padding:10px}.parent-attendance-stat-label{font-size: 16px}.parent-attendance-stat-value{font-size: 20px}.parent-attendance-stat-value small{font-size: 16px}}";
    document.head.appendChild(attendanceStyle);
  }

  const profileResult = await db
    .from("guardian_students")
    .select("student_id")
    .eq("guardian_id", currentUser.id);

  if (requestId !== parentDashboardRequestId) return;
  if (profileResult.error) {
    throw new Error("讀取家長學生綁定失敗：" + profileResult.error.message);
  }

  const studentIds = (profileResult.data || []).map(function (item) {
    return item.student_id;
  });

  // 尚未綁定學生的家長畫面
  if (requestId !== parentDashboardRequestId) return;
  if (studentIds.length === 0) {
    content.innerHTML =
      "<div class='topbar'>" +
        "<div class='parent-brand'><h1>小象文教機構 成績查詢系統</h1></div>" +
      "</div>" +
      "<main class='dashboard'>" +
        "<div class='system-message'>目前尚未綁定學生，請聯絡管理員協助處理。</div>" +
      "</main>" +
      buildParentBottomNav();

    bindParentActionButtons();
    return;
  }

  // 學生資料與考試清單互不依賴，並行讀取以縮短家長首頁等待時間。
  const [studentsResult, examsResult] = await Promise.all([
    db.from("students")
      .select("id, student_code, full_name, class_name")
      .in("id", studentIds)
      .order("student_code"),
    db.from("exams")
      .select("id, title, start_date, end_date")
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(3)
  ]);

  if (requestId !== parentDashboardRequestId) return;
  if (studentsResult.error) {
    throw new Error("讀取學生資料失敗：" + studentsResult.error.message);
  }
  if (examsResult.error) {
    throw new Error("讀取考試資料失敗：" + examsResult.error.message);
  }

  const parentStudents = studentsResult.data || [];
  // 考試清單已由資料庫依日期排序並限制最近三場，避免載入完整歷史考試資料。
  const latestThreeExams = examsResult.data || [];
  const reviewExamIds = latestThreeExams.map(function (exam) {
    return exam.id;
  });

  // 三項資料彼此獨立，並行讀取，避免家長首頁逐項等待網路往返。
  const parentDataRequestsPromise = Promise.all([
    reviewExamIds.length > 0
      ? fetchAllRows(() => db.from("scores")
          .select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level")
          .in("student_id", studentIds)
          .in("exam_id", reviewExamIds)
          .order("id", { ascending: true }))
      : Promise.resolve({ data: [], error: null }),
    db.rpc("get_parent_class_scope_highest_scores"),
    reviewExamIds.length > 0 && studentIds.length > 0
      ? fetchAllRows(() => db.from("score_review_records")
          .select("exam_id, student_id, guardian_id, reviewed_at")
          .in("exam_id", reviewExamIds)
          .in("student_id", studentIds)
          .order("exam_id", { ascending: true })
          .order("student_id", { ascending: true })
          .order("guardian_id", { ascending: true }))
      : Promise.resolve({ data: [], error: null })
  ]);


  let cachedTaiwanDateTime = null;

  function getTaiwanDateTime() {
    if (cachedTaiwanDateTime) return cachedTaiwanDateTime;

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());

    const result = {};

    parts.forEach(function (part) {
      result[part.type] = part.value;
    });

    cachedTaiwanDateTime = result;
    return cachedTaiwanDateTime;
  }

  // 家長端僅顯示本週彙總，不呈現每日或逐堂明細。
  const taiwanToday = getTaiwanDateTime();
  const todayISO = taiwanToday.year + "-" + taiwanToday.month + "-" + taiwanToday.day;
  const currentDate = new Date(todayISO + "T00:00:00Z");
  const weekday = currentDate.getUTCDay();
  // 家長端持續顯示最近一次週六 18:00 已發布的出缺席週，直到下次發布。
  const latestReleasedSaturday = new Date(currentDate);
  const daysSinceSaturday = (weekday + 1) % 7;
  latestReleasedSaturday.setUTCDate(latestReleasedSaturday.getUTCDate() - daysSinceSaturday);
  if (weekday === 6 && Number(taiwanToday.hour) < 18) {
    latestReleasedSaturday.setUTCDate(latestReleasedSaturday.getUTCDate() - 7);
  }
  const weekStartDate = new Date(latestReleasedSaturday);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 5);
  const weekStartISO = weekStartDate.toISOString().slice(0, 10);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() + 6);
  const weekEndISO = weekStartDate.toISOString().slice(0, 10);

  let parentAttendanceRecords = [];
  let parentAttendanceLoadError = null;
  // 出缺席課程清單與成績資料互不依賴，合併等待以減少家長首頁一次網路往返。
  const [parentDataRequests, attendanceSessionsResult] = await Promise.all([
    parentDataRequestsPromise,
    db.from("attendance_sessions")
      .select("id")
      .gte("session_date", weekStartISO)
      .lte("session_date", weekEndISO)
  ]);

  if (requestId !== parentDashboardRequestId) return;
  if (attendanceSessionsResult.error) {
    parentAttendanceLoadError = attendanceSessionsResult.error;
  } else {
    const attendanceSessionIds = (attendanceSessionsResult.data || []).map(item => item.id);
    if (attendanceSessionIds.length) {
      const attendanceRecordsResult = await fetchAllRows(() => db
        .from("attendance_records")
        .select("student_id,attendance_status,late_minutes,checkin_status")
        .in("session_id", attendanceSessionIds)
        .in("student_id", studentIds));
      if (requestId !== parentDashboardRequestId) return;
      if (attendanceRecordsResult.error) {
        parentAttendanceLoadError = attendanceRecordsResult.error;
      } else {
        parentAttendanceRecords = attendanceRecordsResult.data || [];
      }
    }
  }

  const scoresResult = parentDataRequests[0];
  const highestScoresResult = parentDataRequests[1];
  const reviewResult = parentDataRequests[2];

  if (scoresResult.error) {
    throw new Error("讀取成績資料失敗：" + scoresResult.error.message);
  }
  if (highestScoresResult.error) {
    throw new Error("讀取班級最高分失敗：" + highestScoresResult.error.message);
  }
  if (reviewResult.error) {
    throw new Error("讀取成績檢閱紀錄失敗：" + reviewResult.error.message);
  }

  const parentScores = scoresResult.data || [];
  // RPC 僅回傳已綁定孩子所在班級的最高分統計，不讀取其他學生的個別成績。
  const parentClassHighestScores = highestScoresResult.data || [];
  const parentReviewRecords = reviewResult.data || [];

  // 將家長端成績、班級最高分及檢閱紀錄建立索引，避免每張成績卡反覆掃描陣列。
  const parentStudentExamKey = (studentId, examId) =>
    JSON.stringify([String(studentId), String(examId)]);
  const parentHighestScoreKey = (studentId, examId, subject, scope) =>
    JSON.stringify([String(studentId), String(examId), String(subject), String(scope || "")]);

  const parentScoresByStudentExam = new Map();
  parentScores.forEach(function (score) {
    const key = parentStudentExamKey(score.student_id, score.exam_id);
    if (!parentScoresByStudentExam.has(key)) parentScoresByStudentExam.set(key, []);
    parentScoresByStudentExam.get(key).push(score);
  });

  const parentHighestScoreByKey = new Map();
  parentClassHighestScores.forEach(function (item) {
    const key = parentHighestScoreKey(item.student_id, item.exam_id, item.subject, item.scope);
    if (!parentHighestScoreByKey.has(key)) parentHighestScoreByKey.set(key, item);
  });

  const parentReviewByStudentExam = new Map();
  parentReviewRecords.forEach(function (record) {
    const key = parentStudentExamKey(record.student_id, record.exam_id);
    if (!parentReviewByStudentExam.has(key)) parentReviewByStudentExam.set(key, record);
  });

  function findClassHighestScore(student, exam, score) {
    return parentHighestScoreByKey.get(
      parentHighestScoreKey(student.id, exam.id, score.subject, score.scope)
    );
  }

  function findReviewRecord(student, exam) {
    return parentReviewByStudentExam.get(parentStudentExamKey(student.id, exam.id));
  }


  const parentAttendanceByStudent = new Map();
  parentAttendanceRecords.forEach(function (record) {
    const key = String(record.student_id);
    if (!parentAttendanceByStudent.has(key)) {
      parentAttendanceByStudent.set(key, { recordCount: 0, lateMinutes: 0, uncheckedCount: 0 });
    }
    const summary = parentAttendanceByStudent.get(key);
    summary.recordCount++;
    if (record.attendance_status === "normal") {
      summary.lateMinutes += Math.max(0, Number(record.late_minutes) || 0);
      if (record.checkin_status === "not_checked_in") summary.uncheckedCount++;
    }
  });

  function buildParentAttendanceSummary(student) {
    // 顯示最近一次週六 18:00 已發布的出缺席週，並明確標示實際統計日期。
    const periodLabel = weekStartISO.replace(/-/g, "/").slice(5) + "～" + weekEndISO.replace(/-/g, "/").slice(5);
    if (parentAttendanceLoadError) {
      return "<div class='parent-attendance-error' role='alert'>統計期間（" + periodLabel + "）的出缺席資料暫時無法讀取，請稍後再試。</div>";
    }
    const summary = parentAttendanceByStudent.get(String(student.id));
    if (!summary || summary.recordCount === 0) {
      return "<div class='parent-attendance-empty'>統計期間（" + periodLabel + "）尚無出缺席紀錄。</div>";
    }
    return (
      "<section class='parent-attendance-summary' aria-label='出缺席統計：" + periodLabel + "'>" +
        "<h3 class='parent-attendance-summary-title'>出缺席統計（" + periodLabel + "）</h3>" +
        "<div class='parent-attendance-summary-grid'>" +
          "<div class='parent-attendance-stat'>" +
            "<span class='parent-attendance-stat-label'>遲到</span>" +
            "<span class='parent-attendance-stat-value" + (summary.lateMinutes > 0 ? " attendance-alert" : "") + "'>" +
              summary.lateMinutes + " <small>分鐘</small></span>" +
          "</div>" +
          "<div class='parent-attendance-stat'>" +
            "<span class='parent-attendance-stat-label'>未打卡</span>" +
            "<span class='parent-attendance-stat-value" + (summary.uncheckedCount > 0 ? " attendance-alert" : "") + "'>" +
              summary.uncheckedCount + " <small>次</small></span>" +
          "</div>" +
        "</div>" +
      "</section>"
    );
  }

  const releasedExamCache = new Map();

  function isExamReleased(exam) {
    if (!exam) return false;

    const examKey = String(exam.id || "");
    if (examKey && releasedExamCache.has(examKey)) {
      return releasedExamCache.get(examKey);
    }

    if (!exam.end_date) {
      if (examKey) releasedExamCache.set(examKey, false);
      return false;
    }

    const taiwan = getTaiwanDateTime();

    const today =
      taiwan.year + "-" + taiwan.month + "-" + taiwan.day;

    // 考試日期是台灣日曆日期；使用 UTC 日期運算，避免家長裝置時區影響公告日。
    const endDate = new Date(String(exam.end_date).slice(0, 10) + "T00:00:00Z");
    if (Number.isNaN(endDate.getTime())) {
      if (examKey) releasedExamCache.set(examKey, false);
      return false;
    }

    const weekday = endDate.getUTCDay();
    const daysUntilSaturday = (6 - weekday + 7) % 7;
    endDate.setUTCDate(endDate.getUTCDate() + daysUntilSaturday);

    const releaseDate =
      endDate.getUTCFullYear() + "-" +
      String(endDate.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(endDate.getUTCDate()).padStart(2, "0");

    if (today > releaseDate) return true;
    if (today < releaseDate) return false;

    const released = today > releaseDate || (
      today === releaseDate &&
      (
        Number(taiwan.hour) > 18 ||
        (
          Number(taiwan.hour) === 18 &&
          Number(taiwan.minute) >= 0
        )
      )
    );

    if (examKey) releasedExamCache.set(examKey, released);
    return released;
  }

  function getStudentScores(student, exam) {
    return parentScoresByStudentExam.get(parentStudentExamKey(student.id, exam.id)) || [];
  }

  // ==================================================
  // 家長成績顯示
  // 電腦版：維持表格
  // 手機版：每科一張直式卡片
  // ==================================================

  function buildParentScoreTable(student, exam) {
    const scores = getStudentScores(student, exam);
    if (scores.length === 0) {
      return "<div class='empty'>本次考試尚無成績資料。</div>";
    }
    // 國三家長端依科目分組排序；同科目內保留原本範圍順序。
    const displayScores = isGrade3Class(student.class_name)
      ? scores.slice().sort(function (a, b) {
          return SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject);
        })
      : scores;
    return (
      "<div class='parent-score-list'>" +
      displayScores.map(function (score) {
        const grade3 = isGrade3Class(student.class_name);
        const grade3Math = isGrade3Math(student.class_name, score.subject);
        let resultText = "";
        if (score.grade_level === "請假") {
          resultText = gradeTag("請假");
        } else if (score.grade_level === "缺考") {
          resultText = gradeTag("缺考");
        } else if (grade3Math) {
          resultText = "<span class='" +
            scoreClass(score.score, student.class_name, score.subject) + "'>" +
            escapeHtml(score.score == null ? "—" : score.score) +
            " 分</span> " + gradeTag(score.grade_level);
        } else if (grade3) {
          resultText = "<span class='parent-score-number'>" +
            escapeHtml(score.correct_count == null ? "—" : score.correct_count) +
            " 題</span> " + gradeTag(score.grade_level);
        } else {
          resultText = "<span class='parent-score-number " +
            scoreClass(score.score, student.class_name, score.subject) + "'>" +
            escapeHtml(score.score == null ? "—" : score.score) +
            " 分</span>";
        }
        const classHighest = findClassHighestScore(student, exam, score);
        const isMakeupScore = String(score.scope || "").includes("補考");
        const ownScoreValue = grade3 && !grade3Math
          ? score.correct_count
          : score.score;
        const isClassHighest =
          !isMakeupScore &&
          score.grade_level !== "請假" &&
          score.grade_level !== "缺考" &&
          ownScoreValue !== null &&
          ownScoreValue !== undefined &&
          classHighest &&
          classHighest.highest_score !== null &&
          classHighest.highest_score !== undefined &&
          Number(ownScoreValue) === Number(classHighest.highest_score);
        if (isClassHighest) {
          resultText =
            "<span class='parent-score-crowned'>" +
              "<span class='parent-highest-crown' role='img' aria-label='班級最高分'>" +
                "<svg viewBox='0 0 32 27' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>" +
                  "<defs>" +
                    "<linearGradient id='crownGold' x1='0' y1='0' x2='0.9' y2='1'><stop offset='0' stop-color='#FFF2A6'/><stop offset='.42' stop-color='#F6C844'/><stop offset='1' stop-color='#C98216'/></linearGradient>" +
                    "<linearGradient id='crownBand' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#FFE68A'/><stop offset='1' stop-color='#D9951D'/></linearGradient>" +
                  "</defs>" +
                  "<path d='M3 21 1.8 7.2 9 12.2 15.8 2.8 23 12.2 30.2 7.2 29 21Z' fill='url(#crownGold)' stroke='#A96812' stroke-width='1.15' stroke-linejoin='round'/>" +
                  "<path d='m3.5 19.2 5.2-5.1 3.3 5.1H3.5Zm12.3 0 3.3-5.1 5.2 5.1h-8.5Z' fill='#FFE78A' opacity='.72'/>" +
                  "<path d='M2.8 21h26.4v3.1H2.8z' rx='1' fill='url(#crownBand)' stroke='#A96812' stroke-width='.9'/>" +
                  "<path d='m16 7.1 2.5 3.1-2.5 3.1-2.5-3.1Z' fill='#D93636' stroke='#9D2028' stroke-width='.7'/>" +
                  "<path d='m8.2 11.1 1.9 2.2-1.9 2.2-1.9-2.2Z' fill='#38A96A' stroke='#187344' stroke-width='.65'/>" +
                  "<path d='m23.8 11.1 1.9 2.2-1.9 2.2-1.9-2.2Z' fill='#38A96A' stroke='#187344' stroke-width='.65'/>" +
                  "<path d='M16 1v-1.4M1.2 5.2 0 4.1M30.8 5.2 32 4.1' stroke='#F4C94F' stroke-width='1.2' stroke-linecap='round'/>" +
                  "<path d='m16 1.1.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2Z' fill='#FFF3B0'/>" +
                "</svg>" +
              "</span>" +
              resultText +
            "</span>";
        }
        const highestText = !isMakeupScore && classHighest && classHighest.highest_score != null
          ? escapeHtml(classHighest.highest_score) +
            (classHighest.value_unit === "題" ? " 題" : " 分") +
            (grade3 && classHighest.highest_grade_level
              ? " " + gradeTag(classHighest.highest_grade_level)
              : "")
          : "—";
        return (
          "<div class='parent-subject-card'>" +
            "<div class='parent-subject-info'>" +
              "<div class='parent-subject-name'>" + escapeHtml(score.subject) + "</div>" +
              "<div class='parent-subject-scope'>" +
                "<span class='parent-subject-scope-text'>" + escapeHtml(score.scope || "—") + "</span>" +
              "</div>" +
            "</div>" +
            "<div class='parent-subject-result'>" +
              "<div class='parent-subject-result-label'>成績</div>" +
              "<div class='parent-subject-result-value'>" + resultText + "</div>" +
              (isMakeupScore ? "" :
                "<div class='parent-subject-result-label' style='margin-top:7px'>班級最高</div>" +
                "<div class='parent-subject-result-value' style='font-size:14px;color:#315d86;font-weight:800'>" + highestText + "</div>") +
            "</div>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  const studentCards = parentStudents.map(function (student) {
    const examCards = latestThreeExams.map(function (exam) {
      const released = isExamReleased(exam);

      const studentExamScores = getStudentScores(student, exam);
      const reviewRecord = findReviewRecord(student, exam);
      const canReview = released && studentExamScores.length > 0;
      const reviewButton = canReview
        ? (
            "<div class='parent-review-action'>" +
              "<button type='button' class='parent-review-btn' " +
                "data-review-student='" + escapeHtml(student.id) + "' " +
                "data-review-exam='" + escapeHtml(exam.id) + "' " +
                (reviewRecord ? "disabled" : "") + ">" +
                (reviewRecord ? "已完成本週成績查閱" : "我已查閱本週成績") +
              "</button>" +
            "</div>"
          )
        : "";

      return (
        "<div class='panel'>" +
          "<h3>" + escapeHtml(formatDateRange(exam)) + "</h3>" +
          (
            released
              ? buildParentScoreTable(student, exam)
              : "<div class='empty'>本週考試成績將於週六 18:00 開放查詢。</div>"
          ) +
          reviewButton +
        "</div>"
      );
    }).join("");

    return (
      "<div class='student-card'>" +
        "<h3 class='student-heading'>" +
          "<span class='student-name'>" + escapeHtml(student.full_name) + "</span>" +
          "<span class='student-class'>" + escapeHtml(student.class_name) + "</span>" +
        "</h3>" +
        buildParentAttendanceSummary(student) +
        examCards +
      "</div>"
    );
  }).join("");

  content.innerHTML =
    "<div class='topbar'>" +
      "<div class='parent-brand'><h1>小象文教機構 成績查詢系統</h1></div>" +
    "</div>" +
    "<main class='dashboard'>" +
      studentCards +
    "</main>" +
    "<div class='footer'>© 小象文教機構</div>" +
    buildParentBottomNav();

  bindParentActionButtons();

  content.querySelectorAll(".parent-review-btn").forEach(function (button) {
    button.addEventListener("click", async function () {
      if (button.disabled) return;

      const studentId = button.dataset.reviewStudent;
      const examId = button.dataset.reviewExam;
      if (!studentId || !examId) return;

      button.disabled = true;
      button.textContent = "正在儲存……";

      try {
        const result = await db
          .from("score_review_records")
          .insert({
            exam_id: examId,
            student_id: studentId,
            guardian_id: currentUser.id
          });

        if (result.error && result.error.code !== "23505") {
          throw new Error(result.error.message);
        }

        button.textContent = "已完成本週成績查閱";
        button.disabled = true;
      } catch (error) {
        button.disabled = false;
        button.textContent = "我已查閱本週成績";
        alert("儲存檢閱紀錄失敗：" + (error && error.message ? error.message : "請確認網路連線後重試。"));
      }
    });
  });

  // 家長已登入時，若最新考試尚未到週六 18:00，於開放時間自動重新載入一次。
  // 只安排最近一個未來發布時間，避免長時間輪詢或重複計時器。
  const nextExamReleaseTimestamp = latestThreeExams.reduce(function (nextTimestamp, exam) {
    if (!exam || !exam.end_date) return nextTimestamp;
    const endDate = new Date(String(exam.end_date).slice(0, 10) + "T00:00:00Z");
    if (Number.isNaN(endDate.getTime())) return nextTimestamp;
    const daysUntilSaturday = (6 - endDate.getUTCDay() + 7) % 7;
    endDate.setUTCDate(endDate.getUTCDate() + daysUntilSaturday);
    // 台灣時間週六 18:00 等於 UTC 週六 10:00。
    const releaseTimestamp = Date.UTC(
      endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 10, 0, 0
    );
    return releaseTimestamp > Date.now() && (!nextTimestamp || releaseTimestamp < nextTimestamp)
      ? releaseTimestamp
      : nextTimestamp;
  }, null);

  if (nextExamReleaseTimestamp) {
    parentExamReleaseRefreshTimer = window.setTimeout(function () {
      parentExamReleaseRefreshTimer = null;
      if (currentProfile && currentProfile.role === "parent" && currentUser) {
        renderParentDashboard().catch(function (error) {
          console.error("家長成績開放後自動更新失敗：", error);
        });
      }
    }, Math.max(0, nextExamReleaseTimestamp - Date.now()));
  }
}

// ==================================================
// 教師端：僅查詢授權範圍內的最新成績
// ==================================================

async function renderTeacherDashboard() {
  // 教師模式啟動時，使尚未完成的家長頁面請求失效。
  parentDashboardRequestId++;
  // 防止快速切換模式時，較晚回來的舊請求覆蓋最新教師畫面。
  const requestId = ++teacherDashboardRequestId;
  document.body.classList.remove("parent-page");
  document.body.classList.add("teacher-page");
  // 教師查詢頁背景直接套用至 html、body 與應用根節點，避免外層畫布沿用深藍背景。
  document.documentElement.style.setProperty("background-color", "#f3f5f8", "important");
  document.body.style.setProperty("background-color", "#f3f5f8", "important");
  appRoot.style.setProperty("background-color", "#f3f5f8", "important");
  showLoading("正在載入教師授課資料……");

  // 先取得教師授課範圍，後續學生與修課查詢只載入相關班級／科目。
  const assignmentsResult = await db
    .from("teacher_assignments")
    .select("id, teacher_id, class_name, subject");
  if (assignmentsResult.error) {
    throw new Error("授課權限讀取失敗：" + assignmentsResult.error.message);
  }
  if (requestId !== teacherDashboardRequestId) return;

  teacherAssignmentsCache = assignmentsResult.data || [];
  if (!teacherAssignmentsCache.length) {
    teacherStudentsCache = [];
    teacherExamsCache = [];
    teacherExamsByIdCache = new Map();
    teacherExamOptionsCache = "";
    teacherStudentSubjectsCache = [];
    teacherScoresCache = [];
    teacherPermittedSubjectsByClass = new Map();
    teacherStudentsByClassSubject = new Map();
    teacherScoresByStudentExamSubject = new Map();
    appRoot.innerHTML =
      "<div class='topbar'><div><h1>小象文教機構｜教師專區 僅供查詢</h1><small>教師專區</small></div>" +
      "<main class='dashboard'><div class='system-message' style='display:block'>目前尚未設定授課權限，請聯絡管理員。</div></main>" +
      buildParentBottomNav();
    bindParentActionButtons();
    return;
  }

  const permittedClassesForQuery = Array.from(new Set(teacherAssignmentsCache.map(item => item.class_name).filter(Boolean)));
  const permittedSubjectsForQuery = Array.from(new Set(teacherAssignmentsCache.map(item => item.subject).filter(Boolean)));
  const results = await Promise.all([
    db.from("students")
      .select("id, class_name, student_code, full_name")
      .eq("is_active", true)
      .in("class_name", permittedClassesForQuery)
      .order("student_code"),
    db.from("exams").select("id, start_date, end_date"),
    db.from("student_subjects")
      .select("student_id, subject")
      .eq("is_active", true)
      .in("subject", permittedSubjectsForQuery)
  ]);

  if (requestId !== teacherDashboardRequestId) return;

  const labels = ["學生資料", "考試資料", "學生修課資料"];
  for (let i = 0; i < results.length; i++) {
    if (results[i].error) {
      throw new Error(labels[i] + "讀取失敗：" + results[i].error.message);
    }
  }

  teacherStudentsCache = results[0].data || [];
  teacherExamsCache = (results[1].data || []).sort(function (a, b) {
    return String(b.end_date || b.start_date || "").localeCompare(String(a.end_date || a.start_date || ""));
  });
  teacherExamsByIdCache = new Map(teacherExamsCache.map(exam => [String(exam.id), exam]));
  teacherExamOptionsCache = teacherExamsCache.map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");
  teacherStudentSubjectsCache = results[2].data || [];

  // 只查詢有授課權限且學生實際有修習的班級／科目組合；每批最多 200 位學生。
  const activeSubjectsByStudent = new Map();
  teacherStudentSubjectsCache.forEach(function (item) {
    const studentId = String(item.student_id);
    if (!activeSubjectsByStudent.has(studentId)) activeSubjectsByStudent.set(studentId, new Set());
    activeSubjectsByStudent.get(studentId).add(item.subject);
  });

  const teacherScoreQueries = [];
  const teacherAssignmentKeys = new Set();
  teacherAssignmentsCache.forEach(function (assignment) {
    const assignmentKey = JSON.stringify([assignment.class_name, assignment.subject]);
    if (teacherAssignmentKeys.has(assignmentKey)) return;
    teacherAssignmentKeys.add(assignmentKey);

    const studentIds = teacherStudentsCache
      .filter(function (student) {
        const activeSubjects = activeSubjectsByStudent.get(String(student.id));
        return student.class_name === assignment.class_name &&
          activeSubjects && activeSubjects.has(assignment.subject);
      })
      .map(student => String(student.id));

    for (let i = 0; i < studentIds.length; i += 200) {
      const batchIds = studentIds.slice(i, i + 200);
      teacherScoreQueries.push(function () {
        return fetchAllRows(() =>
          db.from("scores")
            .select("student_id, exam_id, subject, scope, grade_level, score, correct_count")
            .eq("subject", assignment.subject)
            .in("student_id", batchIds)
            .order("student_id", { ascending: true })
            .order("exam_id", { ascending: true })
            .order("scope", { ascending: true })
        );
      });
    }
  });

  const teacherScoreResults = [];
  const teacherScoreConcurrency = 6;
  for (let i = 0; i < teacherScoreQueries.length; i += teacherScoreConcurrency) {
    const batchResults = await Promise.all(
      teacherScoreQueries.slice(i, i + teacherScoreConcurrency).map(query => query())
    );
    teacherScoreResults.push(...batchResults);
  }

  for (const result of teacherScoreResults) {
    if (result.error) throw new Error("成績資料讀取失敗：" + result.error.message);
  }
  teacherScoresCache = teacherScoreResults.flatMap(result => result.data || []);

  // 教師頁切換考試或班級時重用授課、修課與成績索引，避免每次重新掃描完整快取。
  teacherPermittedSubjectsByClass = new Map();
  teacherAssignmentsCache.forEach(function (item) {
    if (!teacherPermittedSubjectsByClass.has(item.class_name)) {
      teacherPermittedSubjectsByClass.set(item.class_name, new Set());
    }
    teacherPermittedSubjectsByClass.get(item.class_name).add(item.subject);
  });

  teacherStudentsByClassSubject = new Map();
  const teacherActiveSubjectsByStudent = new Map();
  teacherStudentSubjectsCache.forEach(function (item) {
    const studentId = String(item.student_id);
    if (!teacherActiveSubjectsByStudent.has(studentId)) {
      teacherActiveSubjectsByStudent.set(studentId, new Set());
    }
    teacherActiveSubjectsByStudent.get(studentId).add(item.subject);
  });
  teacherStudentsCache.forEach(function (student) {
    const activeSubjects = teacherActiveSubjectsByStudent.get(String(student.id));
    if (!activeSubjects) return;
    SUBJECTS.forEach(function (subject) {
      if (!activeSubjects.has(subject)) return;
      const key = JSON.stringify([student.class_name, subject]);
      if (!teacherStudentsByClassSubject.has(key)) teacherStudentsByClassSubject.set(key, []);
      teacherStudentsByClassSubject.get(key).push(student);
    });
  });

  teacherScoresByStudentExamSubject = new Map();
  teacherScoresCache.forEach(function (item) {
    const key = JSON.stringify([String(item.student_id), String(item.exam_id), item.subject]);
    if (!teacherScoresByStudentExamSubject.has(key)) {
      teacherScoresByStudentExamSubject.set(key, []);
    }
    teacherScoresByStudentExamSubject.get(key).push(item);
  });

  teacherSelectedExamId = teacherExamsCache.length ? String(teacherExamsCache[0].id) : "";
  renderTeacherResults();
}

function renderTeacherResults() {
  const examOptions = teacherExamOptionsCache;

  const selectedExam = teacherExamsByIdCache.get(String(teacherSelectedExamId)) || null;

  const scoreKey = (studentId, examId, subject) =>
    JSON.stringify([String(studentId), String(examId), subject]);

  const permittedClasses = Array.from(teacherPermittedSubjectsByClass.keys());
  const classOrder = ["國一班", "國二班", "國三班"];
  const visibleClasses = classOrder.filter(function (className) {
    return permittedClasses.includes(className) &&
      (!teacherSelectedClassName || teacherSelectedClassName === className);
  });

  const classSections = visibleClasses.map(function (className) {
    const permittedSubjects = teacherPermittedSubjectsByClass.get(className) || new Set();
    const subjects = SUBJECTS.filter(subject => permittedSubjects.has(subject));

    const subjectSections = subjects.map(function (subject) {
      const students = teacherStudentsByClassSubject.get(JSON.stringify([className, subject])) || [];

      const groups = new Map();
      students.forEach(function (student) {
        const studentScores = selectedExam
          ? (teacherScoresByStudentExamSubject.get(scoreKey(student.id, selectedExam.id, subject)) || [])
          : [];

        const records = studentScores.length ? studentScores : [null];
        records.forEach(function (score) {
          const scope = score && score.scope
            ? String(score.scope).trim()
            : "尚未登錄範圍";
          if (!groups.has(scope)) groups.set(scope, []);

          let resultText = "<span class='grade-missing'>尚未登錄</span>";
          if (score) {
            if (score.grade_level === "請假" || score.grade_level === "缺考") {
              resultText = gradeTag(score.grade_level);
            } else if (isGrade3Math(student.class_name, subject)) {
              resultText = "<span class='parent-score-number " + scoreClass(score.score, student.class_name, subject) + "'>" +
                escapeHtml(score.score == null ? "—" : score.score) + " 分</span> " + gradeTag(score.grade_level);
            } else if (isGrade3Class(student.class_name)) {
              resultText = "<span class='parent-score-number'>" +
                escapeHtml(score.correct_count == null ? "—" : score.correct_count) + " 題</span> " + gradeTag(score.grade_level);
            } else {
              resultText = "<span class='parent-score-number " + scoreClass(score.score, student.class_name, subject) + "'>" +
                escapeHtml(score.score == null ? "—" : score.score) + " 分</span>";
            }
          }

          groups.get(scope).push({
            student: student,
            resultText: resultText,
            code: String(student.student_code || ""),
            isLeaveOrAbsent: !!(score && (score.grade_level === "請假" || score.grade_level === "缺考")),
            sortScore: !score || score.grade_level === "請假" || score.grade_level === "缺考"
              ? -Infinity
              : Number(isGrade3Class(student.class_name) && !isGrade3Math(student.class_name, subject)
                ? score.correct_count
                : score.score)
          });
        });
      });

      const scopeGroups = Array.from(groups.entries()).map(function (entry) {
        const scope = entry[0];
        const rows = entry[1].sort((a, b) =>
          Number(a.isLeaveOrAbsent) - Number(b.isLeaveOrAbsent) ||
          (b.sortScore - a.sortScore) ||
          teacherStudentCodeCollator.compare(a.code, b.code) ||
          teacherStudentNameCollator.compare(String(a.student.full_name || ""), String(b.student.full_name || ""))
        ).map(function (item) {
          return "<div class='teacher-score-row'>" +
            "<div class='teacher-score-student'>" + escapeHtml(item.student.full_name) +
              "<small>" + escapeHtml(item.student.student_code || "") + "</small></div>" +
            "<div class='teacher-score-value'>" + item.resultText + "</div>" +
          "</div>";
        }).join("");

        return "<section class='teacher-scope-group'>" +
          "<div class='teacher-scope-heading'>" + escapeHtml(scope) + "</div>" +
          "<div class='teacher-score-rows'>" + rows + "</div>" +
        "</section>";
      }).join("");

      return "<section class='teacher-subject-section'>" +
        "<h4 class='teacher-subject-heading'>" + escapeHtml(subject) + "</h4>" +
        (scopeGroups || "<div class='empty'>目前沒有修讀此科目的在學學生。</div>") +
      "</section>";
    }).join("");

    return "<section class='panel teacher-class-panel'>" +
      "<h3 class='teacher-class-heading'>" + escapeHtml(className) + "</h3>" +
      (subjectSections || "<div class='empty'>目前沒有授權科目。</div>") +
    "</section>";
  }).join("");

  const classOptions =
    "<option value=''>全部</option>" +
    classOrder.map(className =>
      "<option value='" + escapeHtml(className) + "'>" + escapeHtml(className) + "</option>"
    ).join("");

  appRoot.innerHTML =
    "<div class='topbar'><div><h1>小象文教機構｜教師專區 僅供查詢</h1></div></div>" +
    "<main class='dashboard teacher-dashboard'><div class='toolbar teacher-toolbar'>" +
      "<div class='teacher-filter-group'><label for='teacherExamSelect'><strong>考試週期</strong></label>" +
      "<select id='teacherExamSelect'>" + (examOptions || "<option value=''>目前沒有考試週期</option>") + "</select></div>" +
      "<div class='teacher-filter-group'><label for='teacherClassSelect'><strong>班級</strong></label>" +
      "<select id='teacherClassSelect'>" + classOptions + "</select></div>" +
      "<button class='btn btn-secondary' id='teacherRefreshButton'>重新整理</button>" +
    "</div>" +
    (selectedExam ? "<p class='muted'>目前顯示：" + escapeHtml(formatDateRange(selectedExam)) + "</p>" : "") +
    (classSections || "<div class='empty'>目前選擇的班級沒有授權範圍內的在學學生。</div>") +
    "</main><div class='footer'>© 小象文教機構</div>" +
    buildParentBottomNav();

  bindParentActionButtons();
  if ($("teacherExamSelect")) {
    $("teacherExamSelect").value = teacherSelectedExamId;
    $("teacherExamSelect").addEventListener("change", function () {
      teacherSelectedExamId = this.value;
      renderTeacherResults();
    });
  }
  if ($("teacherClassSelect")) {
    $("teacherClassSelect").value = teacherSelectedClassName;
    $("teacherClassSelect").addEventListener("change", function () {
      teacherSelectedClassName = this.value;
      renderTeacherResults();
    });
  }
  $("teacherRefreshButton").addEventListener("click", async function () {
    await renderDashboard();
  });
}

// ==================================================
// 16. 修改自己的登入密碼
// ==================================================

function renderFirstLoginPasswordChange() {
  const isParent = currentProfile && currentProfile.role === "parent";
  const sectionTitle = isParent ? "家長查詢專區" : "教師專區 僅供查詢";
  const accessDescription = isParent ? "進入家長成績與出缺席查詢前，請先完成密碼設定。" : "完成修改前，無法進入教師成績查詢。";
  appRoot.innerHTML =
    "<div class='topbar'><div><h1>小象文教機構｜" + sectionTitle + "</h1><small>首次登入安全設定</small></div>" +
      "<button class='tab-btn logout-action' id='teacherFirstLoginLogout'>登出</button></div>" +
    "<main class='dashboard' style='max-width:560px'>" +
      "<div class='panel'>" +
        "<h2>首次登入請更改密碼</h2>" +
        "<p class='muted'>目前使用的是系統產生的一次性臨時密碼。為保障帳號安全，請先設定至少 8 個字元的新密碼；" + accessDescription + "</p>" +
        "<form id='teacherFirstLoginPasswordForm'>" +
          "<div class='field'><label for='teacherFirstNewPassword'>新密碼（至少 8 個字元）</label><input id='teacherFirstNewPassword' type='password' autocomplete='new-password' minlength='8' required></div>" +
          "<div class='field'><label for='teacherFirstConfirmPassword'>再次輸入新密碼</label><input id='teacherFirstConfirmPassword' type='password' autocomplete='new-password' minlength='8' required></div>" +
          "<button class='btn btn-success' id='teacherFirstPasswordSubmit' type='submit'>確認修改密碼</button>" +
        "</form>" +
      "</div>" +
    "</main><div class='footer'>© 小象文教機構</div>";

  $("teacherFirstLoginLogout").addEventListener("click", handleLogout);
  $("teacherFirstLoginPasswordForm").addEventListener("submit", saveTeacherFirstLoginPassword);
}

async function saveTeacherFirstLoginPassword(event) {
  event.preventDefault();
  const password = $("teacherFirstNewPassword").value;
  const confirmation = $("teacherFirstConfirmPassword").value;
  const button = $("teacherFirstPasswordSubmit");

  if (password.length < 8) {
    alert("新密碼至少需要 8 個字元。");
    return;
  }
  if (password !== confirmation) {
    alert("兩次輸入的密碼不一致，請重新輸入。");
    return;
  }

  button.disabled = true;
  button.textContent = "儲存中……";
  try {
    const update = await db.auth.updateUser({ password: password });
    if (update.error) throw update.error;

    const completed = await db.functions.invoke("admin-manage-teacher-account", {
      body: { action: "complete_password_change" }
    });
    if (completed.error) {
      throw new Error(completed.data && completed.data.error ? completed.data.error : completed.error.message);
    }
    if (!completed.data || !completed.data.success) {
      throw new Error(completed.data && completed.data.error ? completed.data.error : "無法完成首次登入安全設定。");
    }

    const refreshed = await db.auth.getUser();
    if (refreshed.error) throw refreshed.error;
    currentUser = refreshed.data.user;
    await loadCurrentProfile();
  } catch (error) {
    alert("修改密碼失敗：" + error.message + "。請確認密碼符合 Supabase 專案的密碼規則。");
    button.disabled = false;
    button.textContent = "確認修改密碼";
  }
}

async function changeOwnPassword() {
  const newPassword = prompt(
    "請輸入新的登入密碼（至少 8 個字元）："
  );

  if (newPassword === null) return;

  if (newPassword.length < 8) {
    showMessage("新密碼至少需要 8 個字元。", "error");
    return;
  }

  const confirmPassword = prompt(
    "請再次輸入新的登入密碼："
  );

  if (confirmPassword === null) return;

  if (newPassword !== confirmPassword) {
    showMessage("兩次輸入的密碼不一致，請重新操作。", "error");
    return;
  }

  try {
    const result = await db.auth.updateUser({
      password: newPassword
    });

    if (result.error) throw result.error;

    showMessage("登入密碼已成功修改。", "success");

  } catch (error) {
    showMessage("修改密碼失敗：" + error.message, "error");
  }
}

// ==================================================
// 17. 啟動系統
// ==================================================

async function initializeApp() {
  loginPage();

  try {
    const result = await db.auth.getSession();

    if (result.error) throw result.error;

    const session = result.data.session;

    if (session && session.user) {
      currentUser = session.user;
      await loadCurrentProfile();
    }

  } catch (error) {
    console.error("系統初始化失敗：", error);
    showMessage("系統初始化失敗：" + error.message, "error");
  }

  db.auth.onAuthStateChange(function (event, session) {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      currentProfile = null;

      if ($("appRoot")) {
        loginPage();
      }
    }
  });
}

initializeApp();

/* 全站一般表單控制項統一為 40px；修正 padding/line-height 避免文字裁切，textarea 不強制單行高度 */
