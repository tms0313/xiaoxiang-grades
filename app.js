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

// 學生管理功能已移至 app-students.js。

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
// 段考成績登錄結束
// ==================================================

// ==================================================
// 歷屆模考成績管理已移至 app-alumni-mock.js
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
    const sectionStart =
      "<section class='parent-attendance-summary' aria-label='出缺席統計：" + periodLabel + "'>" +
        "<h3 class='parent-attendance-summary-title'>出缺席統計（" + periodLabel + "）</h3>";
    if (parentAttendanceLoadError) {
      return sectionStart +
        "<div class='parent-attendance-error' role='alert'>出缺席資料暫時無法讀取，請稍後再試。</div>" +
      "</section>";
    }

    // 即使本週尚無紀錄，也顯示摘要欄位，讓家長清楚知道目前沒有遲到或未打卡資料。
    const summary = parentAttendanceByStudent.get(String(student.id)) || {
      recordCount: 0,
      lateMinutes: 0,
      uncheckedCount: 0
    };
    const hasLate = summary.lateMinutes > 0;
    return (
      sectionStart +
        "<div class='parent-attendance-summary-grid'>" +
          "<div class='parent-attendance-stat'>" +
            "<span class='parent-attendance-stat-label'>" + (hasLate ? "遲到" : "無遲到紀錄") + "</span>" +
            "<span class='parent-attendance-stat-value" + (hasLate ? " attendance-alert" : "") + "'>" +
              (hasLate ? summary.lateMinutes + " <small>分鐘</small>" : "") + "</span>" +
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
    const examKey = String(exam && exam.id || "");
    if (examKey && releasedExamCache.has(examKey)) {
      return releasedExamCache.get(examKey);
    }

    const released = isExamReleasedAt(exam, new Date());
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
  const nowTimestamp = Date.now();
  const nextExamReleaseTimestamp = latestThreeExams.reduce(function (nextTimestamp, exam) {
    const releaseTimestamp = getExamReleaseTimestamp(exam);
    return releaseTimestamp !== null && releaseTimestamp > nowTimestamp &&
      (!nextTimestamp || releaseTimestamp < nextTimestamp)
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
