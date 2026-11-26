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
  return isExamReleasedAt(exam, new Date());
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


// 週成績登錄、批次登錄與考試場次管理已移至 app-score-entry.js。

// 家長帳號、學生綁定及家長密碼管理功能已移至 app-guardians.js。

// ==================================================
// 11-5. 教師帳號與授課權限管理
// ==================================================

// 教師帳號及授課權限管理功能已移至 app-teachers.js。

// 家長密碼管理功能已移至 app-guardians.js。

// ==================================================
// 管理員登入及學生檢閱紀錄已移至 app-admin-audit.js
// ==================================================

// ==================================================
// 14. 成績匯出
// 成績匯出功能已移至 app-export.js，並由 index.html 預先載入。
// ==================================================

// 家長端固定底部功能列：僅保留修改密碼與登出
// 家長端成績查詢與共用底部操作列已移至 app-parent.js。

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
