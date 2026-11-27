/* ==================================================
   小象文教機構｜登入與帳號驗證流程
   依賴 app.js 提供的 Supabase client、全域狀態及共用函式。
   由 index.html 在 app.js 前載入；保留既有全域函式名稱。
   包含登入、首次登入密碼設定、密碼修改及系統初始化流程。
   ================================================== */

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

function resetSessionStateAfterLogout() {
  // 先使所有舊帳號的非同步請求失效，再清除計時器與快取。
  appSessionGeneration++;
  dashboardRenderRequestId++;
  parentDashboardRequestId++;
  teacherDashboardRequestId++;
  attendanceLoadRequestId++;
  attendanceCalendarRequestId++;
  attendanceWeeklyOverviewRequestId++;

  if (overviewAutoRefreshTimer) clearInterval(overviewAutoRefreshTimer);
  if (parentExamReleaseRefreshTimer) clearTimeout(parentExamReleaseRefreshTimer);
  overviewAutoRefreshTimer = null;
  parentExamReleaseRefreshTimer = null;
  overviewAutoRefreshBusy = false;

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
  missingExclusionsCache = [];

  guardianLinksCache = [];
  rebuildGuardianBindingIndexes();
  studentSubjectsCache = [];
  rebuildActiveSubjectsByStudentCache();

  teacherProfilesCache = [];
  teacherProfilesByIdCache = new Map();
  teacherAssignmentsCache = [];
  teacherStudentsCache = [];
  teacherExamsCache = [];
  teacherExamsByIdCache = new Map();
  teacherExamOptionsCache = "";
  teacherScoresCache = [];
  teacherStudentSubjectsCache = [];
  teacherPermittedSubjectsByClass = new Map();
  teacherStudentsByClassSubject = new Map();
  teacherScoresByStudentExamSubject = new Map();

  scoreEntryStudentsByClassSubject = new Map();
  bulkEntryExistingScoresByStudent = new Map();
  bulkEntryScoreContextKey = "";
  teacherSelectedExamId = "";
  teacherSelectedClassName = "";
  scoreEntrySavedCount = 0;

  adminHighestPreviewExamId = "";
  adminHighestPreviewClassName = "";
  adminHighestPreviewSubject = "";
  adminDataLoadMetrics = null;
  activeTab = "overview";

  attendanceSelectedDate = "";
  attendanceSelectedSession = null;
  attendanceLoadedStudents = [];
  attendanceSavedSessionId = "";
  attendanceCalendarMonth = "";
  attendanceCalendarMarkedDates = new Set();
  attendanceWeeklyOverviewWeek = "";
  attendanceWeeklyOverviewClass = "";
}

async function handleLogout() {
  try {
    await db.auth.signOut();
  } catch (error) {
    console.error("登出錯誤", error);
  }

  resetSessionStateAfterLogout();
  loginPage();
}

async function loadCurrentProfile() {
  const sessionGeneration = appSessionGeneration;
  const profileUserId = currentUser && currentUser.id;
  if (!currentUser) {
    loginPage();
    return;
  }

  const result = await db
    .from("profiles")
    .select("role")
    .eq("id", profileUserId)
    .maybeSingle();

  // 若查詢期間已登出或換帳號，不採用舊使用者的 profile 結果。
  if (
    sessionGeneration !== appSessionGeneration ||
    !currentUser ||
    String(currentUser.id) !== String(profileUserId)
  ) return;

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
  if (
    sessionGeneration !== appSessionGeneration ||
    !currentUser ||
    String(currentUser.id) !== String(profileUserId)
  ) return;
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
// 首次登入與密碼設定
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
// 系統啟動與登入狀態監聽
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
      resetSessionStateAfterLogout();
      if ($("appRoot")) loginPage();
    }
  });
}

