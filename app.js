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

const GRADE_OPTIONS = ["A++", "A+", "A", "B++", "B+", "B", "C", "缺考"];

let currentUser = null;
let currentProfile = null;
let studentsCache = [];
let examsCache = [];
let profilesCache = [];
let scoresCache = [];
let guardianLinksCache = [];
let activeTab = "overview";

// ==================================================
// 1. 基本工具
// ==================================================

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(message, type) {
  const box = $("systemMessage");

  if (!box) {
    alert(message);
    return;
  }

  box.textContent = message;
  box.className = "system-message " + (type || "");
  box.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

function formatDateRange(exam) {
  if (!exam) return "—";

  const start = formatDate(exam.start_date);
  const end = formatDate(exam.end_date);

  if (!exam.start_date && !exam.end_date) {
    return exam.title || "未設定日期";
  }

  if (start === end || !exam.end_date) return start;
  if (!exam.start_date) return end;

  return start + "～" + end;
}

function isGrade3Class(className) {
  return String(className || "").includes("國三");
}

function isGrade3Math(className, subject) {
  return isGrade3Class(className) && subject === "數學";
}

function scoreClass(score, className, subject) {
  if (
    isGrade3Math(className, subject) &&
    score !== null &&
    score !== undefined &&
    Number(score) < 60
  ) {
    return "low-score";
  }

  if (isGrade3Class(className)) return "";

  if (score !== null && score !== undefined && Number(score) < 60) {
    return "low-score";
  }

  return "";
}

function gradeTag(gradeLevel) {
  if (!gradeLevel) {
    return "<span class='grade-tag'>—</span>";
  }

  if (gradeLevel === "缺考") {
    return "<span class='grade-tag grade-absent'>缺考</span>";
  }

  return "<span class='grade-tag'>" +
    escapeHtml(gradeLevel) +
    "</span>";
}

function updateGradeSelectStyle(selectElement) {
  if (!selectElement) return;

  selectElement.classList.toggle(
    "grade-select-absent",
    selectElement.value === "缺考"
  );
}

function showLoading(message) {
  const root = $("appRoot");
  if (!root) return;

  const old = $("loadingMessage");
  if (old) old.remove();

  const div = document.createElement("div");
  div.id = "loadingMessage";
  div.className = "loading-message";
  div.textContent = message || "資料載入中……";
  root.appendChild(div);
}

function hideLoading() {
  const box = $("loadingMessage");
  if (box) box.remove();
}

function sortByDateDesc(items, field) {
  return items.slice().sort(function (a, b) {
    return String(b[field] || "").localeCompare(String(a[field] || ""));
  });
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob(["\uFEFF", content], {
    type: mimeType || "text/plain;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value == null ? "" : value);
  return '"' + text.replace(/"/g, '""') + '"';
}

// ==================================================
// 2. 畫面樣式
// ==================================================

const style = document.createElement("style");

style.textContent = [
  "body { margin:0; background:#f3f5f8; color:#263445; font-family:Arial,'Microsoft JhengHei',sans-serif; }",
  "* { box-sizing:border-box; }",
  "button,input,select { font:inherit; }",
  "button { cursor:pointer; }",

  ".login-wrap { min-height:100vh; display:flex; justify-content:center; align-items:center; padding:20px; }",
  ".login-card { width:min(420px,100%); background:#fff; padding:35px; border-radius:18px; box-shadow:0 8px 30px rgba(0,0,0,.08); }",
  ".login-card h1 { text-align:center; font-size:25px; margin:0 0 8px; color:#23466b; }",
  ".login-card p { text-align:center; color:#788493; margin-bottom:25px; }",

  ".field { margin-bottom:16px; }",
  ".field label { display:block; font-weight:700; margin-bottom:7px; }",
  ".field input,.field select { width:100%; padding:12px; border:1px solid #ccd4df; border-radius:8px; background:#fff; }",

  ".btn { border:0; border-radius:8px; padding:10px 16px; background:#315d86; color:#fff; font-weight:700; }",
  ".btn:hover { filter:brightness(.94); }",
  ".btn-secondary { background:#64748b; }",
  ".btn-danger { background:#bd4242; }",
  ".btn-success { background:#27845b; }",
  ".btn-small { padding:5px 9px; font-size:12px; margin:0; white-space:nowrap; }",
  ".login-card .btn { width:100%; padding:13px; }",
  ".btn:disabled { opacity:.6; cursor:not-allowed; }",

  ".forgot-password { margin-top:18px; padding:13px; border-radius:8px; background:#f1f5f9; color:#526477; font-size:14px; line-height:1.8; text-align:center; }",
  ".system-message { display:none; padding:12px 15px; border-radius:8px; margin-bottom:16px; background:#fff3cd; color:#765b13; }",
  ".system-message.error { background:#fde8e8; color:#a32626; }",
  ".system-message.success { background:#e3f5e9; color:#20683d; }",

  ".topbar { background:#23466b; color:#fff; padding:16px 24px; display:flex; justify-content:space-between; align-items:center; gap:15px; flex-wrap:wrap; }",
  ".topbar h1 { font-size:20px; margin:0; color:#fff; }",
  ".topbar small { color:#fff; }",
  ".parent-action-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:38px; padding:8px 12px; border:1px solid rgba(255,255,255,.34); border-radius:9px; color:#fff; font-size:13px; font-weight:800; letter-spacing:.2px; vertical-align:middle; transition:background .15s,transform .15s,box-shadow .15s; }",
  ".parent-action-btn:hover { transform:translateY(-1px); box-shadow:0 3px 10px rgba(0,0,0,.18); }",
  ".parent-password-btn { background:#3c78a8; }",
  ".parent-password-btn:hover { background:#4b8bbd; }",
  ".parent-logout-btn { background:#a83e45; }",
  ".parent-logout-btn:hover { background:#c04d55; }",
  ".parent-action-icon { width:18px; height:18px; flex:0 0 18px; fill:none; stroke:currentColor; stroke-width:1.9; stroke-linecap:round; stroke-linejoin:round; }",

  ".dashboard { width:min(1200px,94%); margin:30px auto; background:#fff; padding:28px; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,.08); }",
  ".tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px; border-bottom:1px solid #e4e9ef; padding-bottom:15px; }",
  ".tab-btn { border:0; padding:10px 14px; border-radius:8px; background:#edf1f5; color:#34475b; font-weight:700; }",
  ".tab-btn:hover { background:#315d86; color:#fff; }",
  ".tab-btn.active { background:#315d86; color:#fff; }",

  ".section-title { font-size:21px; margin:0 0 18px; color:#23466b; }",
  ".toolbar { display:flex; gap:10px; flex-wrap:wrap; margin:15px 0; align-items:center; }",
  ".toolbar input,.toolbar select { padding:9px; border:1px solid #ccd4df; border-radius:7px; }",
  ".form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; }",
  ".panel { border:1px solid #e2e8ef; border-radius:12px; padding:18px; margin-bottom:18px; }",
  ".panel h3 { margin:0 0 15px; color:#315d86; }",

  ".table-wrap { overflow-x:auto; width:100%; -webkit-overflow-scrolling:touch; }",
  "table { border-collapse:collapse; width:100%; min-width:650px; }",
  "th,td { border-bottom:1px solid #e7ebf0; padding:11px 10px; text-align:left; vertical-align:middle; }",
  "th { background:#f3f6f9; color:#40566d; white-space:nowrap; }",
  "tr:hover td { background:#fafbfd; }",

  ".overview-table { min-width:1050px; table-layout:fixed; }",
  ".overview-table th:nth-child(1),.overview-table td:nth-child(1) { width:13%; }",
  ".overview-table th:nth-child(2),.overview-table td:nth-child(2) { width:9%; }",
  ".overview-table th:nth-child(3),.overview-table td:nth-child(3) { width:8%; }",
  ".overview-table th:nth-child(4),.overview-table td:nth-child(4) { width:11%; }",
  ".overview-table th:nth-child(5),.overview-table td:nth-child(5) { width:8%; }",
  ".overview-table th:nth-child(6),.overview-table td:nth-child(6) { width:17%; }",
  ".overview-table th:nth-child(7),.overview-table td:nth-child(7) { width:13%; }",
  ".overview-table th:nth-child(8),.overview-table td:nth-child(8) { width:21%; }",

  ".action-cell { min-width:155px; white-space:nowrap; }",
  ".action-buttons { display:flex; align-items:center; justify-content:flex-start; flex-wrap:nowrap; gap:5px; white-space:nowrap; }",
  ".action-buttons .btn { flex:0 0 auto; margin:0; }",

  ".parent-score-table { width:100%; min-width:560px; table-layout:fixed; }",
  ".parent-score-table th:nth-child(1),.parent-score-table td:nth-child(1) { width:18%; text-align:center; }",
  ".parent-score-table th:nth-child(2),.parent-score-table td:nth-child(2) { width:52%; }",
  ".parent-score-table th:nth-child(3),.parent-score-table td:nth-child(3) { width:30%; text-align:center; }",
  ".parent-score-table td { overflow-wrap:anywhere; word-break:break-word; }",
  ".parent-score-table td:nth-child(3) { white-space:normal; }",

  /* 家長成績：電腦版表格、手機版卡片 */
  ".parent-score-desktop { display:block; }",
  ".parent-score-mobile { display:none; }",

  ".parent-subject-card { border:1px solid #dfe7ef; border-radius:10px; padding:14px; margin-bottom:10px; background:#fff; }",
  ".parent-subject-name { font-size:16px; font-weight:800; color:#23466b; margin-bottom:10px; }",
  ".parent-subject-scope { font-size:14px; color:#526477; line-height:1.7; overflow-wrap:anywhere; word-break:break-word; margin-bottom:10px; }",
  ".parent-subject-scope-label { color:#8491a0; font-size:12px; font-weight:700; margin-bottom:3px; }",
  ".parent-subject-result { padding-top:9px; border-top:1px solid #edf0f4; font-size:16px; font-weight:800; color:#263445; line-height:1.8; }",

  ".student-management-table { width:100%; min-width:650px; table-layout:fixed; }",
  ".student-management-table th:nth-child(1),.student-management-table td:nth-child(1) { width:17%; }",
  ".student-management-table th:nth-child(2),.student-management-table td:nth-child(2) { width:22%; }",
  ".student-management-table th:nth-child(3),.student-management-table td:nth-child(3) { width:21%; }",
  ".student-management-table th:nth-child(4),.student-management-table td:nth-child(4) { width:40%; min-width:220px; }",
  ".student-management-table td.student-action-cell { white-space:nowrap; }",

  ".exam-management-table { min-width:600px; table-layout:fixed; }",
  ".exam-management-table th:nth-child(1),.exam-management-table td:nth-child(1) { width:30%; }",
  ".exam-management-table th:nth-child(2),.exam-management-table td:nth-child(2) { width:30%; }",
  ".exam-management-table th:nth-child(3),.exam-management-table td:nth-child(3) { width:40%; }",

  ".guardian-management-table { min-width:850px; }",
  ".guardian-unbound-row td { background:#fffaf0; }",
  ".guardian-status-unbound { display:inline-block; padding:4px 8px; border-radius:6px; background:#fff0cf; color:#8a5a00; font-weight:800; white-space:nowrap; }",

  ".low-score { color:#d32626; font-weight:800; }",
  ".grade-tag { display:inline-block; padding:4px 9px; border-radius:6px; background:#e8eff8; color:#315d86; font-weight:800; white-space:nowrap; }",
  ".grade-absent { color:#d32626 !important; background:#fde8e8 !important; font-weight:900 !important; }",
  ".grade-select-absent { color:#d32626 !important; font-weight:900 !important; }",
  "option[value='缺考'] { color:#d32626; font-weight:900; }",

  ".export-panel { border:1px solid #e2e8ef; border-radius:12px; padding:20px; background:#fff; }",
  ".export-panel-title { font-size:17px; font-weight:800; color:#315d86; margin-bottom:15px; }",
  ".export-select-all { display:flex; align-items:center; gap:11px; padding:15px 16px; border:1px solid #d8e2ed; border-radius:10px; background:#f2f6fa; margin-bottom:12px; cursor:pointer; }",
  ".export-select-all input { width:19px; height:19px; accent-color:#315d86; cursor:pointer; }",
  ".export-select-all span { font-weight:800; color:#23466b; }",
  ".export-period-list { display:flex; flex-direction:column; gap:8px; }",
  ".export-period-item { display:flex; align-items:center; gap:12px; padding:13px 16px; border:1px solid #e3e9f0; border-radius:9px; background:#fff; cursor:pointer; transition:background .15s,border-color .15s; }",
  ".export-period-item:hover { background:#f7f9fc; border-color:#b9cadb; }",
  ".export-period-item:has(input:checked) { background:#f0f5fa; border-color:#9db5cc; }",
  ".export-period-item input { width:18px; height:18px; accent-color:#315d86; flex:0 0 auto; cursor:pointer; }",
  ".export-period-date { font-weight:700; color:#34475b; }",
  ".export-summary { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:15px 2px; color:#64748b; font-size:14px; }",
  ".export-count { font-weight:800; color:#315d86; }",
  ".export-download { width:100%; padding:13px 18px; font-size:15px; }",
  ".export-download:disabled { opacity:.45; cursor:not-allowed; }",
  ".export-empty { padding:25px; text-align:center; color:#8491a0; background:#f8fafc; border-radius:9px; }",

  ".muted { color:#778494; font-size:13px; }",
  ".empty { padding:25px; text-align:center; color:#8491a0; }",
  ".loading-message { position:fixed; top:15px; right:15px; z-index:9999; background:#23466b; color:#fff; padding:12px 18px; border-radius:8px; box-shadow:0 3px 12px rgba(0,0,0,.2); }",
  ".student-card { border:1px solid #e2e8ef; border-radius:12px; padding:18px; margin:15px 0; }",
  ".student-card h3 { margin-top:0; color:#23466b; }",
  ".footer { text-align:center; color:#8995a2; padding:25px; font-size:13px; }",
  ".hidden { display:none !important; }",

  "@media(max-width:600px) {",
  ".dashboard { width:96%; padding:15px; margin:15px auto; }",
  ".topbar { padding:14px; }",
  ".topbar h1 { font-size:17px; }",
  ".login-card { padding:24px; }",
  ".tabs { gap:5px; }",
  ".tab-btn { padding:8px 10px; font-size:13px; }",

  /* 手機版不再顯示橫向表格 */
  ".parent-score-desktop { display:none; }",
  ".parent-score-mobile { display:block; width:100%; }",
  ".parent-subject-card { padding:12px; }",

  ".student-management-table { min-width:650px; }",
  ".overview-table { min-width:1050px; }",
  ".exam-management-table { min-width:600px; }",
  ".export-panel { padding:14px; }",
  ".export-period-item { padding:12px; }",
  "}"
].join("\n");

document.head.appendChild(style);

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
  appRoot.innerHTML =
    "<div class='login-wrap'>" +
      "<div class='login-card'>" +
        "<h1>小象文教機構</h1>" +
        "<p>成績管理系統</p>" +
        "<div id='systemMessage' class='system-message'></div>" +
        "<form id='loginForm'>" +
          "<div class='field'><label for='email'>登入帳號</label>" +
            "<input id='email' type='email' placeholder='請輸入電子郵件' autocomplete='username' required>" +
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

  const email = $("email").value.trim();
  const password = $("password").value;
  const button = $("loginButton");

  button.disabled = true;
  button.textContent = "登入中……";

  try {
    const result = await db.auth.signInWithPassword({ email, password });
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
  studentsCache = [];
  examsCache = [];
  profilesCache = [];
  scoresCache = [];
  guardianLinksCache = [];

  loginPage();
}

async function loadCurrentProfile() {
  if (!currentUser) {
    loginPage();
    return;
  }

  const result = await db
    .from("profiles")
    .select("*")
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

  if (!["admin", "parent"].includes(currentProfile.role)) {
    await db.auth.signOut();
    loginPage();
    showMessage("此帳號沒有系統使用權限。", "error");
    return;
  }

  try {
    await db.from("login_events").insert({ user_id: currentUser.id });
  } catch (error) {
    console.warn("登入紀錄寫入失敗", error);
  }

  await renderDashboard();
}

// ==================================================
// 5. 重新讀取資料
// ==================================================

async function loadAdminData() {
  const results = await Promise.all([
    db.from("students").select("*").order("student_code"),
    db.from("exams").select("*").order("start_date", { ascending: false }),
    db.from("profiles").select("*").eq("role", "parent"),
    db.from("scores").select("*"),
    db.from("guardian_students").select("*")
  ]);

  const names = ["學生資料", "考試資料", "家長帳號", "成績資料", "家長綁定資料"];

  for (let i = 0; i < results.length; i++) {
    if (results[i].error) {
      throw new Error(names[i] + "讀取失敗：" + results[i].error.message);
    }
  }

  studentsCache = results[0].data || [];
  examsCache = results[1].data || [];
  profilesCache = results[2].data || [];
  scoresCache = results[3].data || [];
  guardianLinksCache = results[4].data || [];
}

async function renderDashboard() {
  showLoading("正在載入系統資料……");

  try {
    if (currentProfile.role === "admin") {
      await loadAdminData();
      renderAdminDashboard();
    } else {
      await renderParentDashboard();
    }
  } catch (error) {
    appRoot.innerHTML =
      "<div class='dashboard'><h2>系統資料載入失敗</h2>" +
      "<p>" + escapeHtml(error.message) + "</p>" +
      "<button class='btn' id='reloadButton'>重新載入</button></div>";

    $("reloadButton").addEventListener("click", renderDashboard);
  } finally {
    hideLoading();
  }
}

// ==================================================
// 6. 管理員主畫面
// ==================================================

function renderAdminDashboard() {
  appRoot.innerHTML =
    "<div class='topbar'>" +
      "<div><h1>小象文教機構｜成績管理系統</h1><small>管理員後台</small></div>" +
      "<div><span>" + escapeHtml(currentProfile.display_name || currentUser.email) + "</span>　" +
      "<button class='btn btn-secondary btn-small' id='logoutButton'>登出</button></div>" +
    "</div>" +
    "<main class='dashboard'>" +
      "<div id='systemMessage' class='system-message'></div>" +
      "<div class='tabs' id='adminTabs'>" +
        "<button class='tab-btn' data-tab='overview'>成績總覽</button>" +
        "<button class='tab-btn' data-tab='scores'>成績登錄</button>" +
        "<button class='tab-btn' data-tab='students'>學生管理</button>" +
        "<button class='tab-btn' data-tab='exams'>考試管理</button>" +
        "<button class='tab-btn' data-tab='guardians'>家長綁定</button>" +
        "<button class='tab-btn' data-tab='passwords'>家長密碼</button>" +
        "<button class='tab-btn' data-tab='logs'>登入紀錄</button>" +
        "<button class='tab-btn' data-tab='export'>成績匯出</button>" +
      "</div>" +
      "<section id='adminContent'></section>" +
    "</main>" +
    "<div class='footer'>© 小象文教機構</div>";

  $("logoutButton").addEventListener("click", handleLogout);

  $("adminTabs").addEventListener("click", function (event) {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    activeTab = button.dataset.tab;
    renderAdminTab();
  });

  renderAdminTab();
}

function renderAdminTab() {
  document.querySelectorAll(".tab-btn").forEach(function (button) {
    button.classList.toggle("active", button.dataset.tab === activeTab);
  });

  if (activeTab === "overview") renderOverview();
  if (activeTab === "scores") renderScoreEntry();
  if (activeTab === "students") renderStudents();
  if (activeTab === "exams") renderExams();
  if (activeTab === "guardians") renderGuardians();
  if (activeTab === "passwords") renderPasswords();
  if (activeTab === "logs") renderLoginLogs();
  if (activeTab === "export") renderExport();
}

// ==================================================
// 7. 成績總覽
// ==================================================

function renderOverview() {
  const content = $("adminContent");

  function getStudent(id) {
    return studentsCache.find(item => String(item.id) === String(id));
  }

  function getExam(id) {
    return examsCache.find(item => String(item.id) === String(id));
  }

  function buildOverviewRow(score) {
    const student = getStudent(score.student_id);
    const exam = getExam(score.exam_id);
    if (!student || !exam) return "";

    const grade3 = isGrade3Class(student.class_name);
    const grade3Math = isGrade3Math(student.class_name, score.subject);

    const resultText = grade3Math
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
        "<td>" + escapeHtml(formatDateRange(exam)) + "</td>" +
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

  content.innerHTML =
    "<h2 class='section-title'>成績總覽</h2>" +
    "<div class='toolbar'>" +
      "<input id='overviewSearch' placeholder='搜尋學生姓名或編號'>" +
      "<select id='overviewClass'><option value=''>全部班級</option>" +
        "<option>國一班</option><option>國二班</option><option>國三班</option>" +
      "</select>" +
      "<button class='btn btn-secondary' id='overviewRefresh'>重新整理</button>" +
    "</div>" +
    "<div class='table-wrap'><table class='overview-table'>" +
      "<thead><tr><th>考試區間</th><th>班級</th><th>編號</th><th>姓名</th><th>科目</th><th>考試範圍</th><th>成績</th><th>操作</th></tr></thead>" +
      "<tbody id='overviewRows'><tr><td colspan='8' class='empty'>資料載入中……</td></tr></tbody>" +
    "</table></div>";

  function filterRows() {
    const search = $("overviewSearch").value.trim().toLowerCase();
    const className = $("overviewClass").value;

    const filtered = scoresCache.filter(function (score) {
      const student = getStudent(score.student_id);

      return student &&
        (!className || student.class_name === className) &&
        (
          !search ||
          String(student.full_name || "").toLowerCase().includes(search) ||
          String(student.student_code || "").toLowerCase().includes(search)
        );
    });

    $("overviewRows").innerHTML =
      filtered.map(buildOverviewRow).join("") ||
      "<tr><td colspan='8' class='empty'>沒有符合的成績資料</td></tr>";
  }

  $("overviewSearch").addEventListener("input", filterRows);
  $("overviewClass").addEventListener("change", filterRows);

  $("overviewRefresh").addEventListener("click", async function () {
    try {
      await loadAdminData();
      renderOverview();
      showMessage("成績資料已更新。", "success");
    } catch (error) {
      showMessage("更新成績失敗：" + error.message, "error");
    }
  });

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-score]");
    const deleteButton = event.target.closest("[data-delete-score]");

    if (editButton) await editScore(editButton.dataset.editScore);
    if (deleteButton) await deleteScore(deleteButton.dataset.deleteScore);
  };

  filterRows();
}

// ==================================================
// 7-1. 修改既有成績
// ==================================================

async function editScore(scoreId) {
  const score = scoresCache.find(item => String(item.id) === String(scoreId));

  if (!score) {
    showMessage("找不到這筆成績資料，請重新整理。", "error");
    return;
  }

  const student = studentsCache.find(item => String(item.id) === String(score.student_id));

  if (!student) {
    showMessage("找不到學生資料，無法修改成績。", "error");
    return;
  }

  const grade3 = isGrade3Class(student.class_name);

  const subjectInput = prompt(
    "請輸入科目：國文、英文、數學、自然",
    score.subject || ""
  );

  if (subjectInput === null) return;

  const subject = subjectInput.trim();

  if (!SUBJECTS.includes(subject)) {
    showMessage("科目只能選擇：國文、英文、數學、自然。", "error");
    return;
  }

  const scopeInput = prompt("請輸入考試範圍：", score.scope || "");
  if (scopeInput === null) return;

  const scope = scopeInput.trim();

  if (!scope) {
    showMessage("考試範圍不可空白。", "error");
    return;
  }

  const grade3Math = isGrade3Math(student.class_name, subject);

  let scoreValue = null;
  let correctCount = null;
  let gradeLevel = null;

  if (grade3Math || grade3) {
    const grade = prompt(
      "請輸入模擬考等級（A++、A+、A、B++、B+、B、C、缺考）：",
      score.grade_level || ""
    );

    if (grade === null) return;

    gradeLevel = grade.trim();

    if (!GRADE_OPTIONS.includes(gradeLevel)) {
      showMessage("請輸入正確的模擬考等級。", "error");
      return;
    }

    if (gradeLevel !== "缺考") {
      if (grade3Math) {
        const value = prompt(
          "請輸入國三數學分數（0～100）：",
          score.score == null ? "" : String(score.score)
        );

        if (value === null) return;

        scoreValue = Number(value);

        if (value.trim() === "" || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
          showMessage("國三數學分數必須是 0～100。", "error");
          return;
        }

      } else {
        const value = prompt(
          "請輸入答對題數：",
          score.correct_count == null ? "" : String(score.correct_count)
        );

        if (value === null) return;

        correctCount = Number(value);

        if (value.trim() === "" || !Number.isInteger(correctCount) || correctCount < 0) {
          showMessage("答對題數必須是 0 或正整數。", "error");
          return;
        }
      }
    }

  } else {
    const value = prompt(
      "請輸入一般成績（0～100）：",
      score.score == null ? "" : String(score.score)
    );

    if (value === null) return;

    scoreValue = Number(value);

    if (value.trim() === "" || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
      showMessage("一般成績必須是 0～100。", "error");
      return;
    }
  }

  const confirmed = confirm(
    "確認修改這筆成績嗎？\n\n" +
    "學生：" + student.full_name + "\n" +
    "科目：" + subject + "\n" +
    "考試範圍：" + scope + "\n" +
    "成績：" + (gradeLevel === "缺考" ? "缺考" : "正常成績") + "\n" +
    "此操作會更新原有資料，不會新增另一筆成績。"
  );

  if (!confirmed) return;

  const payload = {
    subject: subject,
    scope: scope,
    score: scoreValue,
    correct_count: correctCount,
    grade_level: gradeLevel
  };

  try {
    const result = await db
      .from("scores")
      .update(payload)
      .eq("id", scoreId);

    if (result.error) throw result.error;

    await loadAdminData();
    renderOverview();

    showMessage("「" + student.full_name + "」的成績已修改成功。", "success");

  } catch (error) {
    showMessage("修改成績失敗：" + error.message, "error");
  }
}

// ==================================================
// 7-2. 刪除單筆成績
// ==================================================

async function deleteScore(scoreId) {
  const score = scoresCache.find(item => String(item.id) === String(scoreId));

  if (!score) {
    showMessage("找不到這筆成績資料，請重新整理。", "error");
    return;
  }

  const student = studentsCache.find(item => String(item.id) === String(score.student_id));
  const exam = examsCache.find(item => String(item.id) === String(score.exam_id));

  if (!student || !exam) {
    showMessage("無法確認學生或考試資料，請重新整理。", "error");
    return;
  }

  const resultText = score.grade_level === "缺考"
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

    await loadAdminData();
    renderOverview();

    showMessage("已成功刪除「" + student.full_name + "」的「" + score.subject + "」成績。", "success");

  } catch (error) {
    showMessage("刪除成績失敗：" + error.message, "error");
  }
}

// ==================================================
// 8. 成績登錄
// ==================================================

function renderScoreEntry() {
  const content = $("adminContent");

  const studentOptions = studentsCache.map(function (student) {
    return "<option value='" + escapeHtml(student.id) + "'>" +
      escapeHtml(student.class_name + "｜" + student.student_code + "｜" + student.full_name) +
      "</option>";
  }).join("");

  const examOptions = sortByDateDesc(examsCache, "start_date").map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) +
      "</option>";
  }).join("");

  const gradeOptionsHtml = GRADE_OPTIONS.map(function (grade) {
    return "<option value='" + escapeHtml(grade) + "'>" +
      escapeHtml(grade) +
      "</option>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>成績登錄</h2>" +
    "<div class='panel'><form id='scoreForm'>" +
      "<div class='form-grid'>" +
        "<div class='field'><label>學生</label><select id='scoreStudent' required><option value=''>請選擇學生</option>" + studentOptions + "</select></div>" +
        "<div class='field'><label>考試場次</label><select id='scoreExam' required><option value=''>請選擇考試</option>" + examOptions + "</select></div>" +
        "<div class='field'><label>科目</label><select id='scoreSubject' required><option value=''>請選擇科目</option>" +
          SUBJECTS.map(s => "<option>" + escapeHtml(s) + "</option>").join("") +
        "</select></div>" +
        "<div class='field'><label>考試範圍</label><input id='scoreScope' placeholder='例如：第 1～2 課' required></div>" +
      "</div>" +
      "<div id='normalScoreField' class='field'><label>一般成績</label><input id='scoreValue' type='number' min='0' max='100' step='0.1' placeholder='請輸入分數'></div>" +
      "<div id='grade3MathFields' class='form-grid hidden'>" +
        "<div class='field'><label>國三數學分數</label><input id='grade3MathScore' type='number' min='0' max='100' step='0.1'></div>" +
        "<div class='field'><label>模擬考等級</label><select id='grade3MathGrade'><option value=''>請選擇等級</option>" +
          gradeOptionsHtml +
        "</select></div>" +
      "</div>" +
      "<div id='grade3Fields' class='form-grid hidden'>" +
        "<div class='field'><label>答對題數</label><input id='correctCount' type='number' min='0' step='1'></div>" +
        "<div class='field'><label>模擬考等級</label><select id='gradeLevel'><option value=''>請選擇等級</option>" +
          gradeOptionsHtml +
        "</select></div>" +
      "</div>" +
      "<p id='absenceHint' class='muted hidden' style='color:#d32626;font-weight:800'>已選擇缺考，不需要輸入分數或答對題數。</p>" +
      "<button class='btn btn-success' type='submit'>儲存成績</button>" +
    "</form></div>" +
    "<p class='muted'>國三數學輸入分數及模擬考等級；國三其他科目輸入答對題數及模擬考等級。選擇「缺考」時不需輸入分數或答對題數。相同學生、考試、科目及範圍若已有成績，系統會先詢問是否覆蓋。</p>";

  $("scoreStudent").addEventListener("change", updateScoreMode);
  $("scoreSubject").addEventListener("change", updateScoreMode);

  $("grade3MathGrade").addEventListener("change", updateGrade3AbsenceMode);
  $("gradeLevel").addEventListener("change", updateGrade3AbsenceMode);

  $("scoreForm").addEventListener("submit", saveScore);
  updateScoreMode();
}

function updateScoreMode() {
  const student = studentsCache.find(item => item.id === $("scoreStudent").value);
  const subject = $("scoreSubject").value;

  const grade3 = student && isGrade3Class(student.class_name);
  const grade3Math = student && isGrade3Math(student.class_name, subject);
  const grade3Other = !!grade3 && !grade3Math;

  $("normalScoreField").classList.toggle("hidden", !!grade3);
  $("grade3MathFields").classList.toggle("hidden", !grade3Math);
  $("grade3Fields").classList.toggle("hidden", !grade3Other);

  $("scoreValue").required = !grade3;
  $("grade3MathScore").required = !!grade3Math;
  $("grade3MathGrade").required = !!grade3Math;
  $("correctCount").required = !!grade3Other;
  $("gradeLevel").required = !!grade3Other;

  updateGrade3AbsenceMode();
}

function updateGrade3AbsenceMode() {
  const mathGrade = $("grade3MathGrade");
  const otherGrade = $("gradeLevel");

  updateGradeSelectStyle(mathGrade);
  updateGradeSelectStyle(otherGrade);

  const student = $("scoreStudent")
    ? studentsCache.find(item => item.id === $("scoreStudent").value)
    : null;

  const subject = $("scoreSubject") ? $("scoreSubject").value : "";
  const grade3Math = student && isGrade3Math(student.class_name, subject);
  const grade3Other = student && isGrade3Class(student.class_name) && !grade3Math;

  const mathAbsent = grade3Math && mathGrade.value === "缺考";
  const otherAbsent = grade3Other && otherGrade.value === "缺考";
  const absent = mathAbsent || otherAbsent;

  $("grade3MathScore").required = !!grade3Math && !mathAbsent;
  $("correctCount").required = !!grade3Other && !otherAbsent;

  $("grade3MathScore").disabled = !!mathAbsent;
  $("correctCount").disabled = !!otherAbsent;

  if (mathAbsent) $("grade3MathScore").value = "";
  if (otherAbsent) $("correctCount").value = "";

  $("absenceHint").classList.toggle("hidden", !absent);
}

async function saveScore(event) {
  event.preventDefault();

  const studentId = $("scoreStudent").value;
  const examId = $("scoreExam").value;
  const subject = $("scoreSubject").value;
  const scope = $("scoreScope").value.trim();

  const student = studentsCache.find(item => item.id === studentId);

  if (!student || !examId || !subject || !scope) {
    showMessage("請完整填寫成績資料。", "error");
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
      showMessage("請選擇正確的模擬考等級。", "error");
      return;
    }

    if (gradeLevel !== "缺考") {
      scoreValue = Number($("grade3MathScore").value);

      if ($("grade3MathScore").value === "" || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
        showMessage("國三數學請輸入 0～100 分。", "error");
        return;
      }
    }

  } else if (grade3) {
    gradeLevel = $("gradeLevel").value;

    if (!GRADE_OPTIONS.includes(gradeLevel)) {
      showMessage("請選擇正確的模擬考等級。", "error");
      return;
    }

    if (gradeLevel !== "缺考") {
      correctCount = Number($("correctCount").value);

      if ($("correctCount").value === "" || !Number.isInteger(correctCount) || correctCount < 0) {
        showMessage("請輸入正確的答對題數。", "error");
        return;
      }
    }

  } else {
    scoreValue = Number($("scoreValue").value);

    if ($("scoreValue").value === "" || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 100) {
      showMessage("一般成績請輸入 0～100 分。", "error");
      return;
    }
  }

  const duplicate = scoresCache.find(function (item) {
    return item.student_id === studentId &&
      item.exam_id === examId &&
      item.subject === subject &&
      String(item.scope || "").trim() === scope;
  });

  if (duplicate && !confirm("這位學生已經登錄相同考試範圍的成績。\n\n是否覆蓋原有成績？")) {
    return;
  }

  const payload = {
    student_id: studentId,
    exam_id: examId,
    subject: subject,
    scope: scope,
    score: scoreValue,
    correct_count: correctCount,
    grade_level: gradeLevel
  };

  try {
    let result;

    if (duplicate) {
      result = await db.from("scores").update(payload).eq("id", duplicate.id);
    } else {
      result = await db.from("scores").insert(payload);
    }

    if (result.error) throw result.error;

    await loadAdminData();
    renderScoreEntry();

    showMessage(
      duplicate
        ? "原有成績已成功覆蓋。"
        : (gradeLevel === "缺考" ? "缺考資料已成功儲存。" : "成績已成功儲存。"),
      "success"
    );

  } catch (error) {
    showMessage("成績儲存失敗：" + error.message, "error");
  }
}

// ==================================================
// 9. 學生管理
// ==================================================

function renderStudents() {
  const content = $("adminContent");

  const rows = studentsCache.map(function (student) {
    return "<tr>" +
      "<td>" + escapeHtml(student.student_code) + "</td>" +
      "<td>" + escapeHtml(student.full_name) + "</td>" +
      "<td>" + escapeHtml(student.class_name) + "</td>" +
      "<td class='student-action-cell action-cell'><div class='action-buttons'>" +
        "<button class='btn btn-small' data-edit-student='" + escapeHtml(student.id) + "'>修改</button>" +
        "<button class='btn btn-danger btn-small' data-delete-student='" + escapeHtml(student.id) + "'>刪除</button>" +
      "</div></td></tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>學生管理</h2>" +
    "<div class='panel'><h3 id='studentFormTitle'>新增學生</h3>" +
      "<form id='studentForm'><input type='hidden' id='studentEditId'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>學生編號</label><input id='studentCode' required></div>" +
          "<div class='field'><label>學生姓名</label><input id='studentName' required></div>" +
          "<div class='field'><label>班級</label><select id='studentClass' required><option value=''>請選擇班級</option><option>國一班</option><option>國二班</option><option>國三班</option></select></div>" +
        "</div>" +
        "<button class='btn btn-success' type='submit'>儲存學生資料</button> " +
        "<button class='btn btn-secondary' type='button' id='studentCancel'>清除</button>" +
      "</form></div>" +
      "<div class='table-wrap'><table class='student-management-table'>" +
        "<thead><tr><th>學生編號</th><th>姓名</th><th>班級</th><th>操作</th></tr></thead>" +
        "<tbody>" + (rows || "<tr><td colspan='4' class='empty'>尚無學生資料</td></tr>") + "</tbody>" +
      "</table></div>";

  $("studentForm").addEventListener("submit", saveStudent);
  $("studentCancel").addEventListener("click", clearStudentForm);

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-student]");
    const deleteButton = event.target.closest("[data-delete-student]");

    if (editButton) editStudent(editButton.dataset.editStudent);
    if (deleteButton) await deleteStudent(deleteButton.dataset.deleteStudent);
  };
}

function clearStudentForm() {
  $("studentForm").reset();
  $("studentEditId").value = "";
  $("studentFormTitle").textContent = "新增學生";
}

function editStudent(id) {
  const student = studentsCache.find(item => item.id === id);
  if (!student) return;

  $("studentEditId").value = student.id;
  $("studentCode").value = student.student_code || "";
  $("studentName").value = student.full_name || "";
  $("studentClass").value = student.class_name || "";
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

  try {
    const result = id
      ? await db.from("students").update(payload).eq("id", id)
      : await db.from("students").insert(payload);

    if (result.error) throw result.error;

    await loadAdminData();
    renderStudents();
    showMessage(id ? "學生資料已更新。" : "學生已新增。", "success");

  } catch (error) {
    showMessage("學生資料儲存失敗：" + error.message, "error");
  }
}

async function deleteStudent(id) {
  const student = studentsCache.find(item => item.id === id);
  if (!student) return;

  if (!confirm("確定刪除學生「" + student.full_name + "」？\n\n若此學生仍有成績或家長綁定，資料庫可能會拒絕刪除。")) return;

  try {
    const result = await db.from("students").delete().eq("id", id);
    if (result.error) throw result.error;

    await loadAdminData();
    renderStudents();
    showMessage("學生資料已刪除。", "success");

  } catch (error) {
    showMessage("刪除失敗：" + error.message, "error");
  }
}

// ==================================================
// 10. 考試管理
// ==================================================

function renderExams() {
  const content = $("adminContent");

  const rows = sortByDateDesc(examsCache, "start_date").map(function (exam) {
    return "<tr>" +
      "<td>" + escapeHtml(formatDate(exam.start_date)) + "</td>" +
      "<td>" + escapeHtml(formatDate(exam.end_date)) + "</td>" +
      "<td class='action-cell'>" +
        "<div class='action-buttons'>" +
          "<button class='btn btn-small' data-edit-exam='" + escapeHtml(exam.id) + "'>修改</button>" +
          "<button class='btn btn-danger btn-small' data-delete-exam='" + escapeHtml(exam.id) + "'>刪除</button>" +
        "</div>" +
      "</td>" +
      "</tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>考試管理</h2>" +
    "<div class='panel'><h3 id='examFormTitle'>新增考試</h3>" +
      "<form id='examForm'><input type='hidden' id='examEditId'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>開始日期</label><input id='examStart' type='date' required></div>" +
          "<div class='field'><label>結束日期</label><input id='examEnd' type='date' required></div>" +
        "</div>" +
        "<button class='btn btn-success' type='submit'>儲存考試</button> " +
        "<button class='btn btn-secondary' type='button' id='examCancel'>清除</button>" +
      "</form></div>" +
      "<div class='table-wrap'><table class='exam-management-table'>" +
        "<thead><tr><th>開始日期</th><th>結束日期</th><th>操作</th></tr></thead>" +
        "<tbody>" + (rows || "<tr><td colspan='3' class='empty'>尚無考試資料</td></tr>") + "</tbody>" +
      "</table></div>";

  $("examForm").addEventListener("submit", saveExam);
  $("examCancel").addEventListener("click", clearExamForm);

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-exam]");
    const deleteButton = event.target.closest("[data-delete-exam]");

    if (editButton) editExam(editButton.dataset.editExam);
    if (deleteButton) await deleteExam(deleteButton.dataset.deleteExam);
  };
}

function clearExamForm() {
  $("examForm").reset();
  $("examEditId").value = "";
  $("examFormTitle").textContent = "新增考試";
}

function editExam(id) {
  const exam = examsCache.find(item => String(item.id) === String(id));
  if (!exam) return;

  $("examEditId").value = exam.id;
  $("examStart").value = exam.start_date || "";
  $("examEnd").value = exam.end_date || "";
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
    return;
  }

  const autoTitle = startDate === endDate
    ? startDate
    : startDate + "～" + endDate;

  const payload = {
    title: autoTitle,
    start_date: startDate,
    end_date: endDate
  };

  try {
    const result = id
      ? await db.from("exams").update(payload).eq("id", id)
      : await db.from("exams").insert(payload);

    if (result.error) throw result.error;

    await loadAdminData();
    renderExams();
    showMessage(id ? "考試日期已更新。" : "考試場次已新增。", "success");

  } catch (error) {
    showMessage("考試資料儲存失敗：" + error.message, "error");
  }
}

async function deleteExam(id) {
  const exam = examsCache.find(item => String(item.id) === String(id));
  if (!exam) return;

  if (!confirm(
    "確定刪除考試場次「" + formatDateRange(exam) + "」？\n\n" +
    "若已有成績資料，資料庫可能會拒絕刪除。"
  )) return;

  try {
    const result = await db.from("exams").delete().eq("id", id);
    if (result.error) throw result.error;

    await loadAdminData();
    renderExams();
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

  const parentOptions = profilesCache.map(function (profile) {
    return "<option value='" + escapeHtml(profile.id) + "'>" +
      escapeHtml((profile.display_name || profile.email) + "｜" + profile.email) +
      "</option>";
  }).join("");

  const studentOptions = studentsCache.map(function (student) {
    return "<option value='" + escapeHtml(student.id) + "'>" +
      escapeHtml(student.class_name + "｜" + student.student_code + "｜" + student.full_name) +
      "</option>";
  }).join("");

  function buildGuardianRows() {
    const selectedClass = $("guardianClass")
      ? $("guardianClass").value
      : "";

    const linkedParentIds = new Set(
      guardianLinksCache.map(link => String(link.guardian_id))
    );

    const rows = [];

    guardianLinksCache.forEach(function (link) {
      const parent = profilesCache.find(
        item => String(item.id) === String(link.guardian_id)
      );

      const student = studentsCache.find(
        item => String(item.id) === String(link.student_id)
      );

      if (!parent || !student) return;
      if (selectedClass && student.class_name !== selectedClass) return;

      rows.push(
        "<tr>" +
          "<td>" + escapeHtml(parent.display_name || parent.email) + "</td>" +
          "<td>" + escapeHtml(parent.email) + "</td>" +
          "<td>" + escapeHtml(student.class_name) + "</td>" +
          "<td>" + escapeHtml(student.full_name) + "</td>" +
          "<td class='action-cell'>" +
            "<div class='action-buttons'>" +
              "<button class='btn btn-small' data-edit-parent='" +
                escapeHtml(parent.id) + "'>修改家長資料</button>" +
              "<button class='btn btn-danger btn-small' data-unbind='" +
                escapeHtml(link.guardian_id) + "|" +
                escapeHtml(link.student_id) + "'>解除綁定</button>" +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    });

    profilesCache
      .filter(profile => !linkedParentIds.has(String(profile.id)))
      .forEach(function (parent) {
        rows.push(
          "<tr class='guardian-unbound-row'>" +
            "<td>" + escapeHtml(parent.display_name || "未設定姓名") + "</td>" +
            "<td>" + escapeHtml(parent.email || "—") + "</td>" +
            "<td><span class='guardian-status-unbound'>未綁定</span></td>" +
            "<td>—</td>" +
            "<td class='action-cell'>" +
              "<div class='action-buttons'>" +
                "<button class='btn btn-small' data-edit-parent='" +
                  escapeHtml(parent.id) + "'>修改家長資料</button>" +
                "<button class='btn btn-danger btn-small' data-delete-parent='" +
                  escapeHtml(parent.id) + "'>刪除帳號</button>" +
              "</div>" +
            "</td>" +
          "</tr>"
        );
      });

    return rows.join("");
  }

  content.innerHTML =
    "<h2 class='section-title'>家長綁定</h2>" +

    "<div class='panel'><h3>新增家長帳號</h3>" +
      "<p class='muted'>輸入家長姓名及 Email，選擇學生後，系統會自動建立家長登入帳號並完成學生綁定。</p>" +
      "<form id='createParentForm'><div class='form-grid'>" +
        "<div class='field'><label>家長姓名</label><input id='newParentName' type='text' placeholder='例如：王小明家長' required></div>" +
        "<div class='field'><label>家長 Email（登入帳號）</label><input id='newParentEmail' type='email' placeholder='請輸入家長 Email' autocomplete='off' required></div>" +
        "<div class='field'><label>綁定學生</label><select id='newParentStudent' required><option value=''>請選擇學生</option>" + studentOptions + "</select></div>" +
      "</div>" +
      "<p class='muted'>初始密碼：123456。家長首次登入後，請自行修改密碼。</p>" +
      "<button class='btn btn-success' type='submit' id='createParentButton'>建立家長帳號</button>" +
      "</form></div>" +

    "<div class='panel'><h3>既有家長帳號與學生綁定</h3>" +
      "<form id='guardianForm'><div class='form-grid'>" +
        "<div class='field'><label>家長帳號</label><select id='guardianParent' required><option value=''>請選擇家長</option>" + parentOptions + "</select></div>" +
        "<div class='field'><label>學生</label><select id='guardianStudent' required><option value=''>請選擇學生</option>" + studentOptions + "</select></div>" +
      "</div><button class='btn btn-success' type='submit'>建立綁定</button></form></div>" +

    "<div class='panel'>" +
      "<h3>既有家長帳號與學生綁定清單</h3>" +
      "<div class='toolbar'>" +
        "<label for='guardianClass'><strong>班級：</strong></label>" +
        "<select id='guardianClass'>" +
          "<option value=''>全部班級</option>" +
          "<option value='國一班'>國一班</option>" +
          "<option value='國二班'>國二班</option>" +
          "<option value='國三班'>國三班</option>" +
        "</select>" +
      "</div>" +
      "<div class='table-wrap'><table class='guardian-management-table'>" +
        "<thead><tr><th>家長姓名</th><th>家長帳號</th><th>班級</th><th>學生姓名</th><th>操作</th></tr></thead>" +
        "<tbody id='guardianRows'>" +
          (buildGuardianRows() || "<tr><td colspan='5' class='empty'>目前沒有家長帳號資料</td></tr>") +
        "</tbody>" +
      "</table></div>" +
    "</div>";

  $("createParentForm").addEventListener("submit", createParentAccount);
  $("guardianForm").addEventListener("submit", saveGuardianBinding);

  function refreshGuardianRows() {
    $("guardianRows").innerHTML =
      buildGuardianRows() ||
      "<tr><td colspan='5' class='empty'>目前沒有家長帳號資料</td></tr>";
  }

  $("guardianClass").addEventListener("change", refreshGuardianRows);

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-parent]");
    const unbindButton = event.target.closest("[data-unbind]");
    const deleteButton = event.target.closest("[data-delete-parent]");

    if (editButton) {
      await editParentAccount(editButton.dataset.editParent);
    }

    if (deleteButton) {
      await deleteUnboundParentAccount(deleteButton.dataset.deleteParent);
    }

    if (unbindButton) {
      const parts = unbindButton.dataset.unbind.split("|");
      await removeGuardianBinding(parts[0], parts[1]);
    }
  };
}

// ==================================================
// 11-1. 刪除尚未綁定學生的家長帳號
// ==================================================

async function deleteUnboundParentAccount(parentId) {
  const parent = profilesCache.find(
    item => String(item.id) === String(parentId)
  );

  if (!parent) {
    showMessage("找不到這位家長的帳號資料，請重新整理。", "error");
    return;
  }

  const hasBinding = guardianLinksCache.some(
    link => String(link.guardian_id) === String(parentId)
  );

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

    await loadAdminData();
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
  const parent = profilesCache.find(item => String(item.id) === String(parentId));

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

  const emailInput = prompt(
    "請輸入家長登入 Email：",
    parent.email || ""
  );

  if (emailInput === null) return;

  const email = emailInput.trim().toLowerCase();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (!confirm(
    "確認修改家長資料嗎？\n\n" +
    "原姓名：" + (parent.display_name || "—") + "\n" +
    "新姓名：" + displayName + "\n\n" +
    "原 Email：" + (parent.email || "—") + "\n" +
    "新 Email：" + email + "\n\n" +
    "家長密碼及學生綁定不會變更。"
  )) return;

  try {
    const result = await db.functions.invoke(
      "admin-update-parent-account",
      {
        body: {
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

    await loadAdminData();
    renderGuardians();

    showMessage(
      "家長資料已更新，登入 Email 已同步變更。",
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

  const displayName = $("newParentName").value.trim();
  const email = $("newParentEmail").value.trim().toLowerCase();
  const studentId = $("newParentStudent").value;
  const button = $("createParentButton");

  if (!displayName || !email || !studentId) {
    showMessage("請完整填寫家長姓名、Email 及綁定學生。", "error");
    return;
  }

  const student = studentsCache.find(item => String(item.id) === String(studentId));

  if (!student) {
    showMessage("找不到所選學生，請重新整理後再試。", "error");
    return;
  }

  if (!confirm(
    "請確認以下家長帳號資料：\n\n" +
    "家長姓名：" + displayName + "\n" +
    "登入帳號：" + email + "\n" +
    "綁定學生：" + student.full_name + "\n" +
    "班級：" + student.class_name + "\n" +
    "初始密碼：123456\n\n" +
    "確認建立家長帳號嗎？"
  )) return;

  button.disabled = true;
  button.textContent = "建立中……";

  try {
    const result = await db.functions.invoke(
      "admin-create-parent-account",
      {
        body: { email, displayName, studentId }
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
      "家長姓名：" + (data.displayName || displayName) + "\n" +
      "登入帳號：" + (data.email || email) + "\n" +
      "綁定學生：" + student.full_name + "\n" +
      "初始密碼：" + passwordText + "\n\n" +
      (copied
        ? "初始密碼已複製，可以直接貼到 LINE 傳給家長。"
        : "請記下初始密碼，並透過 LINE 提供給家長。")
    );

    showMessage(
      "家長帳號「" + displayName + "」已建立，並完成「" + student.full_name + "」的學生綁定。",
      "success"
    );

  } catch (error) {
    console.error("建立家長帳號失敗：", error);
    showMessage("建立家長帳號失敗：" + error.message, "error");

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

  const guardianId = $("guardianParent").value;
  const studentId = $("guardianStudent").value;

  const exists = guardianLinksCache.some(function (item) {
    return item.guardian_id === guardianId && item.student_id === studentId;
  });

  if (exists) {
    showMessage("這筆家長與學生綁定已存在。", "error");
    return;
  }

  try {
    const result = await db.from("guardian_students").insert({
      guardian_id: guardianId,
      student_id: studentId
    });

    if (result.error) throw result.error;

    await loadAdminData();
    renderGuardians();
    showMessage("家長與學生已成功綁定。", "success");

  } catch (error) {
    showMessage("建立綁定失敗：" + error.message, "error");
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

    await loadAdminData();
    renderGuardians();
    showMessage("已解除綁定。", "success");

  } catch (error) {
    showMessage("解除綁定失敗：" + error.message, "error");
  }
}

// ==================================================
// 12. 家長密碼管理
// ==================================================

function renderPasswords() {
  const content = $("adminContent");

  const rows = profilesCache.map(function (profile) {
    return "<tr>" +
      "<td>" + escapeHtml(profile.display_name || "—") + "</td>" +
      "<td>" + escapeHtml(profile.email) + "</td>" +
      "<td><button class='btn btn-small' data-reset-parent='" + escapeHtml(profile.id) + "'>重設家長密碼</button></td>" +
      "</tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>家長密碼管理</h2>" +
    "<p class='muted'>透過既有 Edge Function 重設家長帳號密碼。</p>" +
    "<div class='table-wrap'><table>" +
      "<thead><tr><th>家長姓名</th><th>登入帳號</th><th>操作</th></tr></thead>" +
      "<tbody>" + (rows || "<tr><td colspan='3' class='empty'>目前沒有家長帳號</td></tr>") + "</tbody>" +
    "</table></div>";

  content.onclick = async function (event) {
    const button = event.target.closest("[data-reset-parent]");
    if (button) await resetParentPassword(button.dataset.resetParent);
  };
}

async function resetParentPassword(parentUserId) {
  if (!confirm("確定要重設這位家長的登入密碼？")) return;

  try {
    const result = await db.functions.invoke(
      "admin-reset-parent-password",
      {
        body: { parentUserId: parentUserId }
      }
    );

    if (result.error) throw result.error;

    const data = result.data || {};

    if (!data.success || !data.temporaryPassword) {
      throw new Error(data.error || "重設成功，但沒有取得臨時密碼。");
    }

    const temporaryPassword = data.temporaryPassword;

    const copied = confirm(
      "家長臨時密碼已重設成功！\n\n" +
      "臨時密碼：\n" + temporaryPassword +
      "\n\n請先記下這組密碼，再透過 LINE 提供給家長。\n\n按「確定」複製臨時密碼。"
    );

    if (copied) {
      try {
        await navigator.clipboard.writeText(temporaryPassword);
        showMessage("臨時密碼已複製，可以貼到 LINE 傳給家長。", "success");
      } catch (copyError) {
        showMessage("臨時密碼：" + temporaryPassword, "success");
      }
    } else {
      showMessage("臨時密碼已產生，請記下剛才顯示的密碼。", "success");
    }

  } catch (error) {
    showMessage("密碼重設失敗：" + error.message, "error");
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
    const results = await Promise.all([
      db.from("login_events").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("profiles").select("id, role")
    ]);

    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;

    const logs = results[0].data || [];
    const allProfiles = results[1].data || [];

    const rows = logs.map(function (log) {
      const profile = allProfiles.find(item => String(item.id) === String(log.user_id));

      let loginIdentity = "未知帳號";

      if (profile && profile.role === "admin") {
        loginIdentity = "管理員";
      } else {
        const linkedStudents = guardianLinksCache
          .filter(link => String(link.guardian_id) === String(log.user_id))
          .map(function (link) {
            const student = studentsCache.find(item => String(item.id) === String(link.student_id));
            return student ? student.full_name : null;
          })
          .filter(Boolean);

        loginIdentity = Array.from(new Set(linkedStudents)).join("、") || "尚未綁定學生";
      }

      return "<tr><td>" + escapeHtml(loginIdentity) + "</td><td>" +
        escapeHtml(log.created_at ? new Date(log.created_at).toLocaleString("zh-TW") : "—") +
        "</td></tr>";
    }).join("");

    content.innerHTML =
      "<h2 class='section-title'>登入紀錄</h2>" +
      "<p class='muted'>最近 200 筆登入紀錄。</p>" +
      "<div class='table-wrap'><table><thead><tr><th>登入身分</th><th>登入時間</th></tr></thead>" +
      "<tbody>" + (rows || "<tr><td colspan='2' class='empty'>目前沒有登入紀錄</td></tr>") +
      "</tbody></table></div>";

  } catch (error) {
    content.innerHTML =
      "<h2 class='section-title'>登入紀錄</h2>" +
      "<p class='system-message error'>讀取失敗：" + escapeHtml(error.message) + "</p>";
  }
}

// ==================================================
// 14. 成績匯出
// ==================================================

function renderExport() {
  const content = $("adminContent");

  const examList = sortByDateDesc(examsCache, "start_date");

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
    const selectedCount = checkboxes.filter(function (checkbox) {
      return checkbox.checked;
    }).length;

    const totalCount = checkboxes.length;

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

  const selectedScores = scoresCache.filter(function (score) {
    return selectedIds.includes(String(score.exam_id));
  });

  selectedScores.forEach(function (score) {
    const student = studentsCache.find(function (item) {
      return String(item.id) === String(score.student_id);
    });

    const exam = examsCache.find(function (item) {
      return String(item.id) === String(score.exam_id);
    });

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
    selectedScores.length +
    " 筆成績資料。",
    "success"
  );
}

// ==================================================
// 15. 家長端畫面
// ==================================================

async function renderParentDashboard() {
  const content = $("appRoot");

  const profileResult = await db
    .from("guardian_students")
    .select("student_id")
    .eq("guardian_id", currentUser.id);

  if (profileResult.error) {
    throw new Error("讀取家長學生綁定失敗：" + profileResult.error.message);
  }

  const studentIds = (profileResult.data || []).map(function (item) {
    return item.student_id;
  });

  // 尚未綁定學生的家長畫面
  if (studentIds.length === 0) {
    content.innerHTML =
      "<div class='topbar'>" +
        "<div><h1>小象文教機構｜成績查詢</h1><small>家長專區</small></div>" +
        "<div>" +
          "<button class='parent-action-btn parent-password-btn' id='changePasswordButton' type='button' title='修改登入密碼' aria-label='修改登入密碼'>" +
            "<svg class='parent-action-icon' viewBox='0 0 24 24' aria-hidden='true'><path d='M7 10V7a5 5 0 0 1 10 0v3'/><rect x='4' y='10' width='16' height='11' rx='2'/><path d='M12 14v3'/></svg>" +
            "<span>修改密碼</span></button> " +
          "<button class='parent-action-btn parent-logout-btn' id='logoutButton' type='button' title='登出系統' aria-label='登出系統'>" +
            "<svg class='parent-action-icon' viewBox='0 0 24 24' aria-hidden='true'><path d='M10 17l5-5-5-5'/><path d='M15 12H3'/><path d='M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6'/></svg>" +
            "<span>登出</span></button>" +
        "</div>" +
      "</div>" +
      "<main class='dashboard'>" +
        "<div class='system-message'>目前尚未綁定學生，請聯絡管理員協助處理。</div>" +
      "</main>";

    $("changePasswordButton").addEventListener("click", changeOwnPassword);
    $("logoutButton").addEventListener("click", handleLogout);
    return;
  }

  const studentsResult = await db
    .from("students")
    .select("*")
    .in("id", studentIds)
    .order("student_code");

  if (studentsResult.error) {
    throw new Error("讀取學生資料失敗：" + studentsResult.error.message);
  }

  const parentStudents = studentsResult.data || [];

  const scoresResult = await db
    .from("scores")
    .select("*")
    .in("student_id", studentIds);

  if (scoresResult.error) {
    throw new Error("讀取成績資料失敗：" + scoresResult.error.message);
  }

  const parentScores = scoresResult.data || [];

  const examsResult = await db
    .from("exams")
    .select("*")
    .order("start_date", { ascending: false });

  if (examsResult.error) {
    throw new Error("讀取考試資料失敗：" + examsResult.error.message);
  }

  const parentExams = examsResult.data || [];

  function getTaiwanDateTime() {
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

    return result;
  }

  function isExamReleased(exam) {
    if (!exam || !exam.end_date) return false;

    const taiwan = getTaiwanDateTime();

    const today =
      taiwan.year + "-" + taiwan.month + "-" + taiwan.day;

    const endDate = new Date(exam.end_date + "T12:00:00+08:00");

    const weekday = endDate.getDay();

    const daysUntilSaturday = (6 - weekday + 7) % 7;

    endDate.setDate(endDate.getDate() + daysUntilSaturday);

    const releaseDate =
      endDate.getFullYear() + "-" +
      String(endDate.getMonth() + 1).padStart(2, "0") + "-" +
      String(endDate.getDate()).padStart(2, "0");

    if (today > releaseDate) return true;
    if (today < releaseDate) return false;

    return Number(taiwan.hour) > 20 ||
      (
        Number(taiwan.hour) === 20 &&
        Number(taiwan.minute) >= 0
      );
  }

  function getStudentScores(student, exam) {
    return parentScores.filter(function (score) {
      return String(score.student_id) === String(student.id) &&
        String(score.exam_id) === String(exam.id);
    });
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

    const desktopRows = [];
    const mobileCards = [];

    scores.forEach(function (score) {
      const grade3 = isGrade3Class(student.class_name);
      const grade3Math = isGrade3Math(student.class_name, score.subject);

      let resultText = "";

      if (score.grade_level === "缺考") {
        resultText = gradeTag("缺考");

      } else if (grade3Math) {
        resultText =
          "<span class='" +
          scoreClass(score.score, student.class_name, score.subject) +
          "'>" +
          escapeHtml(score.score == null ? "—" : score.score) +
          " 分</span>　" +
          gradeTag(score.grade_level);

      } else if (grade3) {
        resultText =
          escapeHtml(score.correct_count == null ? "—" : score.correct_count) +
          " 題　" +
          gradeTag(score.grade_level);

      } else {
        resultText =
          "<span class='" +
          scoreClass(score.score, student.class_name, score.subject) +
          "'>" +
          escapeHtml(score.score == null ? "—" : score.score) +
          " 分</span>";
      }

      // 電腦版表格資料
      desktopRows.push(
        "<tr>" +
          "<td>" + escapeHtml(score.subject) + "</td>" +
          "<td>" + escapeHtml(score.scope || "—") + "</td>" +
          "<td>" + resultText + "</td>" +
        "</tr>"
      );

      // 手機版直式卡片資料
      mobileCards.push(
        "<div class='parent-subject-card'>" +
          "<div class='parent-subject-name'>" +
            escapeHtml(score.subject) +
          "</div>" +
          "<div class='parent-subject-scope'>" +
            "<div class='parent-subject-scope-label'>考試範圍</div>" +
            escapeHtml(score.scope || "—") +
          "</div>" +
          "<div class='parent-subject-result'>" +
            "成績：" + resultText +
          "</div>" +
        "</div>"
      );
    });

    return (
      // 電腦版：原本三欄表格
      "<div class='parent-score-desktop'>" +
        "<div class='table-wrap'>" +
          "<table class='parent-score-table'>" +
            "<thead><tr><th>科目</th><th>考試範圍</th><th>成績</th></tr></thead>" +
            "<tbody>" + desktopRows.join("") + "</tbody>" +
          "</table>" +
        "</div>" +
      "</div>" +

      // 手機版：直式成績卡片
      "<div class='parent-score-mobile'>" +
        mobileCards.join("") +
      "</div>"
    );
  }

  const sortedExams = sortByDateDesc(parentExams, "start_date");

  const latestThreeExams = sortedExams.slice(0, 3);

  const studentCards = parentStudents.map(function (student) {
    const examCards = latestThreeExams.map(function (exam) {
      const released = isExamReleased(exam);

      return (
        "<div class='panel'>" +
          "<h3>" + escapeHtml(formatDateRange(exam)) + "</h3>" +
          (
            released
              ? buildParentScoreTable(student, exam)
              : "<div class='empty'>本次考試成績將於週六 20:00 開放查詢。</div>"
          ) +
        "</div>"
      );
    }).join("");

    return (
      "<div class='student-card'>" +
        "<h3>" +
          escapeHtml(student.full_name) +
          "　<span class='muted'>" +
          escapeHtml(student.class_name) +
          "</span>" +
        "</h3>" +
        examCards +
      "</div>"
    );
  }).join("");

  content.innerHTML =
    "<div class='topbar'>" +
      "<div><h1>小象文教機構｜成績查詢</h1><small>家長專區</small></div>" +
      "<div><span>" +
        escapeHtml(currentProfile.display_name || currentUser.email) +
      "</span>　" +
      "<button class='parent-action-btn parent-password-btn' id='changePasswordButton' type='button' title='修改登入密碼' aria-label='修改登入密碼'>" +
        "<svg class='parent-action-icon' viewBox='0 0 24 24' aria-hidden='true'><path d='M7 10V7a5 5 0 0 1 10 0v3'/><rect x='4' y='10' width='16' height='11' rx='2'/><path d='M12 14v3'/></svg>" +
        "<span>修改密碼</span></button> " +
      "<button class='parent-action-btn parent-logout-btn' id='logoutButton' type='button' title='登出系統' aria-label='登出系統'>" +
        "<svg class='parent-action-icon' viewBox='0 0 24 24' aria-hidden='true'><path d='M10 17l5-5-5-5'/><path d='M15 12H3'/><path d='M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6'/></svg>" +
        "<span>登出</span></button></div>" +
    "</div>" +
    "<main class='dashboard'>" +
      "<h2 class='section-title'>學生考試成績</h2>" +
      studentCards +
    "</main>" +
    "<div class='footer'>© 小象文教機構</div>";

  $("changePasswordButton").addEventListener("click", changeOwnPassword);
  $("logoutButton").addEventListener("click", handleLogout);
}

// ==================================================
// 16. 修改自己的登入密碼
// ==================================================

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
