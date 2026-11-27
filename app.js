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

// 管理員頁籤導覽與班級最高分預覽已移至 app-admin-dashboard.js。

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

// 教師端成績查詢已移至 app-teacher-dashboard.js。

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
