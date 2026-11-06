
/* ==================================================
   小象文教機構｜七堵校區成績管理系統
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

   scores 唯一索引：
   student_id, exam_id, subject, scope

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
const GRADE_OPTIONS = ["A++", "A+", "A", "B++", "B+", "B", "C"];

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
    return exam.title || "未命名考試";
  }

  if (start === end || !exam.end_date) return start;
  return start + "～" + end;
}

function isGrade3Class(className) {
  return String(className || "").includes("國三");
}

function scoreClass(score, className) {
  if (isGrade3Class(className)) return "";
  if (score !== null && score !== undefined && Number(score) < 60) {
    return "low-score";
  }
  return "";
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

function makeSelectOptions(items, valueField, labelField, selectedValue) {
  return items.map(function (item) {
    const value = item[valueField];
    const label = item[labelField];

    return (
      "<option value='" + escapeHtml(value) + "'" +
      (String(value) === String(selectedValue) ? " selected" : "") +
      ">" + escapeHtml(label) + "</option>"
    );
  }).join("");
}

// ==================================================
// 2. 畫面樣式
//    使用一般字串，不使用反引號模板字串
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
  ".btn-small { padding:6px 10px; font-size:13px; margin:2px; }",
  ".login-card .btn { width:100%; padding:13px; }",
  ".system-message { display:none; padding:12px 15px; border-radius:8px; margin-bottom:16px; background:#fff3cd; color:#765b13; }",
  ".system-message.error { background:#fde8e8; color:#a32626; }",
  ".system-message.success { background:#e3f5e9; color:#20683d; }",
  ".topbar { background:#23466b; color:#fff; padding:16px 24px; display:flex; justify-content:space-between; align-items:center; gap:15px; flex-wrap:wrap; }",
  ".topbar h1 { font-size:20px; margin:0; }",
  ".topbar small { color:#dce7f2; }",
  ".dashboard { width:min(1200px,94%); margin:30px auto; background:#fff; padding:28px; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,.08); }",
  ".tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px; border-bottom:1px solid #e4e9ef; padding-bottom:15px; }",
  ".tab-btn { border:0; padding:10px 14px; border-radius:8px; background:#edf1f5; color:#34475b; font-weight:700; }",
  ".tab-btn.active { background:#315d86; color:#fff; }",
  ".section-title { font-size:21px; margin:0 0 18px; color:#23466b; }",
  ".toolbar { display:flex; gap:10px; flex-wrap:wrap; margin:15px 0; align-items:center; }",
  ".toolbar input,.toolbar select { padding:9px; border:1px solid #ccd4df; border-radius:7px; }",
  ".form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; }",
  ".panel { border:1px solid #e2e8ef; border-radius:12px; padding:18px; margin-bottom:18px; }",
  ".panel h3 { margin:0 0 15px; color:#315d86; }",
  ".table-wrap { overflow-x:auto; width:100%; }",
  "table { border-collapse:collapse; width:100%; min-width:650px; }",
  "th,td { border-bottom:1px solid #e7ebf0; padding:11px 10px; text-align:left; vertical-align:middle; }",
  "th { background:#f3f6f9; color:#40566d; white-space:nowrap; }",
  "tr:hover td { background:#fafbfd; }",
  ".low-score { color:#d32626; font-weight:800; }",
  ".grade-tag { display:inline-block; padding:4px 9px; border-radius:6px; background:#e8eff8; color:#315d86; font-weight:800; }",
  ".muted { color:#778494; font-size:13px; }",
  ".empty { padding:25px; text-align:center; color:#8491a0; }",
  ".loading-message { position:fixed; top:15px; right:15px; z-index:9999; background:#23466b; color:#fff; padding:12px 18px; border-radius:8px; box-shadow:0 3px 12px rgba(0,0,0,.2); }",
  ".student-card { border:1px solid #e2e8ef; border-radius:12px; padding:18px; margin:15px 0; }",
  ".student-card h3 { margin-top:0; color:#23466b; }",
  ".footer { text-align:center; color:#8995a2; padding:25px; font-size:13px; }",
  ".hidden { display:none !important; }",
  "@media(max-width:600px) { .dashboard { width:96%; padding:15px; margin:15px auto; } .topbar { padding:14px; } .topbar h1 { font-size:17px; } .login-card { padding:24px; } .tabs { gap:5px; } .tab-btn { padding:8px 10px; font-size:13px; } }"
].join("\n");

document.head.appendChild(style);

// ==================================================
// 3. 建立系統根畫面
// ==================================================

function createRoot() {
  let root = document.createElement("div");
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
        "<p>七堵校區｜成績管理系統</p>" +
        "<div id='systemMessage' class='system-message'></div>" +
        "<form id='loginForm'>" +
          "<div class='field'>" +
            "<label for='email'>登入帳號</label>" +
            "<input id='email' type='email' placeholder='請輸入電子郵件' autocomplete='username' required>" +
          "</div>" +
          "<div class='field'>" +
            "<label for='password'>登入密碼</label>" +
            "<input id='password' type='password' placeholder='請輸入密碼' autocomplete='current-password' required>" +
          "</div>" +
          "<button class='btn' type='submit' id='loginButton'>登入系統</button>" +
        "</form>" +
      "</div>" +
    "</div>" +
    "<div class='footer'>© 小象文教機構 七堵校區</div>";

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
    const result = await db.auth.signInWithPassword({
      email: email,
      password: password
    });

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

  if (
    currentProfile.role !== "admin" &&
    currentProfile.role !== "parent"
  ) {
    await db.auth.signOut();
    loginPage();
    showMessage("此帳號沒有系統使用權限。", "error");
    return;
  }

  try {
    await db.from("login_events").insert({
      user_id: currentUser.id
    });
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

  const names = [
    "學生資料",
    "考試資料",
    "家長帳號",
    "成績資料",
    "家長綁定資料"
  ];

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
      "<div class='dashboard'>" +
        "<h2>系統資料載入失敗</h2>" +
        "<p>" + escapeHtml(error.message) + "</p>" +
        "<button class='btn' id='reloadButton'>重新載入</button>" +
      "</div>";

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
      "<div>" +
        "<span>" + escapeHtml(currentProfile.display_name || currentUser.email) + "</span>　" +
        "<button class='btn btn-secondary btn-small' id='logoutButton'>登出</button>" +
      "</div>" +
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
    "<div class='footer'>© 小象文教機構 七堵校區</div>";

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
    button.classList.toggle(
      "active",
      button.dataset.tab === activeTab
    );
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

  const rows = scoresCache.map(function (score) {
    const student = studentsCache.find(function (item) {
      return item.id === score.student_id;
    });

    const exam = examsCache.find(function (item) {
      return item.id === score.exam_id;
    });

    if (!student || !exam) return "";

    const grade3 = isGrade3Class(student.class_name);

    const resultText = grade3
      ? (
          "答對 " + escapeHtml(score.correct_count == null ? "—" : score.correct_count) +
          " 題　" +
          "<span class='grade-tag'>" + escapeHtml(score.grade_level || "—") + "</span>"
        )
      : (
          "<span class='" + scoreClass(score.score, student.class_name) + "'>" +
          escapeHtml(score.score == null ? "—" : score.score) +
          "</span>"
        );

    return (
      "<tr>" +
        "<td>" + escapeHtml(formatDateRange(exam)) + "</td>" +
        "<td>" + escapeHtml(student.class_name) + "</td>" +
        "<td>" + escapeHtml(student.student_code) + "</td>" +
        "<td>" + escapeHtml(student.full_name) + "</td>" +
        "<td>" + escapeHtml(score.subject) + "</td>" +
        "<td>" + escapeHtml(score.scope || "—") + "</td>" +
        "<td>" + resultText + "</td>" +
      "</tr>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>成績總覽</h2>" +
    "<div class='toolbar'>" +
      "<input id='overviewSearch' placeholder='搜尋學生姓名或編號'>" +
      "<select id='overviewClass'>" +
        "<option value=''>全部班級</option>" +
        "<option>國一班</option><option>國二班</option><option>國三班</option>" +
      "</select>" +
      "<button class='btn btn-secondary' id='overviewRefresh'>重新整理</button>" +
    "</div>" +
    "<div class='table-wrap'>" +
      "<table>" +
        "<thead><tr><th>考試區間</th><th>班級</th><th>編號</th><th>姓名</th><th>科目</th><th>考試範圍</th><th>成績</th></tr></thead>" +
        "<tbody id='overviewRows'>" + rows + "</tbody>" +
      "</table>" +
    "</div>";

  function filterRows() {
    const search = $("overviewSearch").value.trim().toLowerCase();
    const className = $("overviewClass").value;

    const filtered = scoresCache.filter(function (score) {
      const student = studentsCache.find(function (item) {
        return item.id === score.student_id;
      });

      return student &&
        (!className || student.class_name === className) &&
        (
          !search ||
          String(student.full_name || "").toLowerCase().includes(search) ||
          String(student.student_code || "").toLowerCase().includes(search)
        );
    });

    $("overviewRows").innerHTML = filtered.map(function (score) {
      const student = studentsCache.find(function (item) {
        return item.id === score.student_id;
      });

      const exam = examsCache.find(function (item) {
        return item.id === score.exam_id;
      });

      const grade3 = isGrade3Class(student.class_name);
      const resultText = grade3
        ? "答對 " + escapeHtml(score.correct_count == null ? "—" : score.correct_count) +
          " 題　" + escapeHtml(score.grade_level || "—")
        : escapeHtml(score.score == null ? "—" : score.score);

      return (
        "<tr>" +
          "<td>" + escapeHtml(formatDateRange(exam)) + "</td>" +
          "<td>" + escapeHtml(student.class_name) + "</td>" +
          "<td>" + escapeHtml(student.student_code) + "</td>" +
          "<td>" + escapeHtml(student.full_name) + "</td>" +
          "<td>" + escapeHtml(score.subject) + "</td>" +
          "<td>" + escapeHtml(score.scope || "—") + "</td>" +
          "<td class='" + scoreClass(score.score, student.class_name) + "'>" + resultText + "</td>" +
        "</tr>"
      );
    }).join("") || "<tr><td colspan='7' class='empty'>沒有符合的成績資料</td></tr>";
  }

  $("overviewSearch").addEventListener("input", filterRows);
  $("overviewClass").addEventListener("change", filterRows);

  $("overviewRefresh").addEventListener("click", async function () {
    await loadAdminData();
    renderOverview();
    showMessage("成績資料已更新。", "success");
  });
}

// ==================================================
// 8. 成績登錄
// ==================================================

function renderScoreEntry() {
  const content = $("adminContent");

  const studentOptions = studentsCache.map(function (student) {
    return (
      "<option value='" + escapeHtml(student.id) + "'>" +
      escapeHtml(student.class_name + "｜" + student.student_code + "｜" + student.full_name) +
      "</option>"
    );
  }).join("");

  const examOptions = sortByDateDesc(examsCache, "start_date").map(function (exam) {
    return (
      "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam) + "｜" + exam.title) +
      "</option>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>成績登錄</h2>" +
    "<div class='panel'>" +
      "<form id='scoreForm'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>學生</label><select id='scoreStudent' required>" +
            "<option value=''>請選擇學生</option>" + studentOptions +
          "</select></div>" +
          "<div class='field'><label>考試場次</label><select id='scoreExam' required>" +
            "<option value=''>請選擇考試</option>" + examOptions +
          "</select></div>" +
          "<div class='field'><label>科目</label><select id='scoreSubject' required>" +
            "<option value=''>請選擇科目</option>" +
            SUBJECTS.map(function (s) {
              return "<option>" + escapeHtml(s) + "</option>";
            }).join("") +
          "</select></div>" +
          "<div class='field'><label>考試範圍</label><input id='scoreScope' name='scope' placeholder='例如：第 1～2 課' required></div>" +
        "</div>" +
        "<div id='normalScoreField' class='field'>" +
          "<label>一般成績</label><input id='scoreValue' type='number' min='0' max='100' step='0.1' placeholder='請輸入分數'>" +
        "</div>" +
        "<div id='grade3Fields' class='form-grid hidden'>" +
          "<div class='field'><label>答對題數</label><input id='correctCount' type='number' min='0' step='1' placeholder='請輸入答對題數'></div>" +
          "<div class='field'><label>模擬考等級</label><select id='gradeLevel'>" +
            "<option value=''>請選擇等級</option>" +
            GRADE_OPTIONS.map(function (g) {
              return "<option>" + g + "</option>";
            }).join("") +
          "</select></div>" +
        "</div>" +
        "<button class='btn btn-success' type='submit'>儲存成績</button>" +
      "</form>" +
    "</div>" +
    "<p class='muted'>同一位學生、同一場考試、同一科目及相同考試範圍若已有成績，系統會先詢問是否覆蓋。</p>";

  $("scoreStudent").addEventListener("change", updateScoreMode);
  $("scoreForm").addEventListener("submit", saveScore);
  updateScoreMode();
}

function updateScoreMode() {
  const student = studentsCache.find(function (item) {
    return item.id === $("scoreStudent").value;
  });

  const grade3 = student && isGrade3Class(student.class_name);

  $("normalScoreField").classList.toggle("hidden", !!grade3);
  $("grade3Fields").classList.toggle("hidden", !grade3);

  $("scoreValue").required = !grade3;
  $("correctCount").required = !!grade3;
  $("gradeLevel").required = !!grade3;
}

async function saveScore(event) {
  event.preventDefault();

  const studentId = $("scoreStudent").value;
  const examId = $("scoreExam").value;
  const subject = $("scoreSubject").value;
  const scope = $("scoreScope").value.trim();

  const student = studentsCache.find(function (item) {
    return item.id === studentId;
  });

  if (!student || !examId || !subject || !scope) {
    showMessage("請完整填寫成績資料。", "error");
    return;
  }

  const grade3 = isGrade3Class(student.class_name);

  let scoreValue = null;
  let correctCount = null;
  let gradeLevel = null;

  if (grade3) {
    correctCount = Number($("correctCount").value);
    gradeLevel = $("gradeLevel").value;

    if (
      $("correctCount").value === "" ||
      !Number.isInteger(correctCount) ||
      correctCount < 0 ||
      !gradeLevel
    ) {
      showMessage("請輸入正確的答對題數及模擬考等級。", "error");
      return;
    }
  } else {
    scoreValue = Number($("scoreValue").value);

    if (
      $("scoreValue").value === "" ||
      !Number.isFinite(scoreValue) ||
      scoreValue < 0 ||
      scoreValue > 100
    ) {
      showMessage("一般成績請輸入 0～100 分。", "error");
      return;
    }
  }

  const duplicate = scoresCache.find(function (item) {
    return (
      item.student_id === studentId &&
      item.exam_id === examId &&
      item.subject === subject &&
      String(item.scope || "").trim() === scope
    );
  });

  if (duplicate) {
    const confirmed = confirm(
      "這位學生已經登錄相同考試範圍的成績。\n\n是否覆蓋原有成績？"
    );

    if (!confirmed) return;
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
      result = await db
        .from("scores")
        .update(payload)
        .eq("id", duplicate.id);
    } else {
      result = await db.from("scores").insert(payload);
    }

    if (result.error) throw result.error;

    await loadAdminData();
    renderScoreEntry();

    showMessage(
      duplicate ? "原有成績已成功覆蓋。" : "成績已成功儲存。",
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
    return (
      "<tr>" +
        "<td>" + escapeHtml(student.student_code) + "</td>" +
        "<td>" + escapeHtml(student.full_name) + "</td>" +
        "<td>" + escapeHtml(student.class_name) + "</td>" +
        "<td>" +
          "<button class='btn btn-small' data-edit-student='" + escapeHtml(student.id) + "'>修改</button>" +
          "<button class='btn btn-danger btn-small' data-delete-student='" + escapeHtml(student.id) + "'>刪除</button>" +
        "</td>" +
      "</tr>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>學生管理</h2>" +
    "<div class='panel'>" +
      "<h3 id='studentFormTitle'>新增學生</h3>" +
      "<form id='studentForm'>" +
        "<input type='hidden' id='studentEditId'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>學生編號</label><input id='studentCode' required></div>" +
          "<div class='field'><label>學生姓名</label><input id='studentName' required></div>" +
          "<div class='field'><label>班級</label><select id='studentClass' required>" +
            "<option value=''>請選擇班級</option>" +
            "<option>國一班</option><option>國二班</option><option>國三班</option>" +
          "</select></div>" +
        "</div>" +
        "<button class='btn btn-success' type='submit'>儲存學生資料</button> " +
        "<button class='btn btn-secondary' type='button' id='studentCancel'>清除</button>" +
      "</form>" +
    "</div>" +
    "<div class='table-wrap'><table>" +
      "<thead><tr><th>學生編號</th><th>姓名</th><th>班級</th><th>操作</th></tr></thead>" +
      "<tbody>" + (rows || "<tr><td colspan='4' class='empty'>尚無學生資料</td></tr>") + "</tbody>" +
    "</table></div>";

  $("studentForm").addEventListener("submit", saveStudent);
  $("studentCancel").addEventListener("click", clearStudentForm);

  content.addEventListener("click", async function (event) {
    const editButton = event.target.closest("[data-edit-student]");
    const deleteButton = event.target.closest("[data-delete-student]");

    if (editButton) editStudent(editButton.dataset.editStudent);

    if (deleteButton) {
      await deleteStudent(deleteButton.dataset.deleteStudent);
    }
  });
}

function clearStudentForm() {
  $("studentForm").reset();
  $("studentEditId").value = "";
  $("studentFormTitle").textContent = "新增學生";
}

function editStudent(id) {
  const student = studentsCache.find(function (item) {
    return item.id === id;
  });

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
    let result;

    if (id) {
      result = await db.from("students").update(payload).eq("id", id);
    } else {
      result = await db.from("students").insert(payload);
    }

    if (result.error) throw result.error;

    await loadAdminData();
    renderStudents();

    showMessage(id ? "學生資料已更新。" : "學生已新增。", "success");

  } catch (error) {
    showMessage("學生資料儲存失敗：" + error.message, "error");
  }
}

async function deleteStudent(id) {
  const student = studentsCache.find(function (item) {
    return item.id === id;
  });

  if (!student) return;

  if (!confirm("確定刪除學生「" + student.full_name + "」？\n\n請注意：若此學生仍有成績或家長綁定，資料庫可能會拒絕刪除。")) {
    return;
  }

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
    return (
      "<tr>" +
        "<td>" + escapeHtml(exam.title) + "</td>" +
        "<td>" + escapeHtml(formatDate(exam.start_date)) + "</td>" +
        "<td>" + escapeHtml(formatDate(exam.end_date)) + "</td>" +
        "<td>" +
          "<button class='btn btn-small' data-edit-exam='" + escapeHtml(exam.id) + "'>修改</button>" +
          "<button class='btn btn-danger btn-small' data-delete-exam='" + escapeHtml(exam.id) + "'>刪除</button>" +
        "</td>" +
      "</tr>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>考試管理</h2>" +
    "<div class='panel'>" +
      "<h3 id='examFormTitle'>新增考試</h3>" +
      "<form id='examForm'>" +
        "<input type='hidden' id='examEditId'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>考試名稱</label><input id='examTitle' placeholder='例如：第 1 次週考' required></div>" +
          "<div class='field'><label>開始日期</label><input id='examStart' type='date' required></div>" +
          "<div class='field'><label>結束日期</label><input id='examEnd' type='date' required></div>" +
        "</div>" +
        "<button class='btn btn-success' type='submit'>儲存考試</button> " +
        "<button class='btn btn-secondary' type='button' id='examCancel'>清除</button>" +
      "</form>" +
    "</div>" +
    "<div class='table-wrap'><table>" +
      "<thead><tr><th>考試名稱</th><th>開始日期</th><th>結束日期</th><th>操作</th></tr></thead>" +
      "<tbody>" + (rows || "<tr><td colspan='4' class='empty'>尚無考試資料</td></tr>") + "</tbody>" +
    "</table></div>";

  $("examForm").addEventListener("submit", saveExam);
  $("examCancel").addEventListener("click", clearExamForm);

  content.addEventListener("click", async function (event) {
    const editButton = event.target.closest("[data-edit-exam]");
    const deleteButton = event.target.closest("[data-delete-exam]");

    if (editButton) editExam(editButton.dataset.editExam);

    if (deleteButton) {
      await deleteExam(deleteButton.dataset.deleteExam);
    }
  });
}

function clearExamForm() {
  $("examForm").reset();
  $("examEditId").value = "";
  $("examFormTitle").textContent = "新增考試";
}

function editExam(id) {
  const exam = examsCache.find(function (item) {
    return item.id === id;
  });

  if (!exam) return;

  $("examEditId").value = exam.id;
  $("examTitle").value = exam.title || "";
  $("examStart").value = exam.start_date || "";
  $("examEnd").value = exam.end_date || "";
  $("examFormTitle").textContent = "修改考試資料";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveExam(event) {
  event.preventDefault();

  const id = $("examEditId").value;
  const startDate = $("examStart").value;
  const endDate = $("examEnd").value;

  if (endDate < startDate) {
    showMessage("結束日期不可早於開始日期。", "error");
    return;
  }

  const payload = {
    title: $("examTitle").value.trim(),
    start_date: startDate,
    end_date: endDate
  };

  try {
    let result;

    if (id) {
      result = await db.from("exams").update(payload).eq("id", id);
    } else {
      result = await db.from("exams").insert(payload);
    }

    if (result.error) throw result.error;

    await loadAdminData();
    renderExams();

    showMessage(id ? "考試資料已更新。" : "考試場次已新增。", "success");

  } catch (error) {
    showMessage("考試資料儲存失敗：" + error.message, "error");
  }
}

async function deleteExam(id) {
  const exam = examsCache.find(function (item) {
    return item.id === id;
  });

  if (!exam) return;

  if (!confirm("確定刪除考試「" + exam.title + "」？\n若已有成績資料，資料庫可能會拒絕刪除。")) {
    return;
  }

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
// 11. 家長及學生綁定
// ==================================================

function renderGuardians() {
  const content = $("adminContent");

  const parentOptions = profilesCache.map(function (profile) {
    return (
      "<option value='" + escapeHtml(profile.id) + "'>" +
      escapeHtml((profile.display_name || profile.email) + "｜" + profile.email) +
      "</option>"
    );
  }).join("");

  const studentOptions = studentsCache.map(function (student) {
    return (
      "<option value='" + escapeHtml(student.id) + "'>" +
      escapeHtml(student.class_name + "｜" + student.student_code + "｜" + student.full_name) +
      "</option>"
    );
  }).join("");

  const rows = guardianLinksCache.map(function (link) {
    const parent = profilesCache.find(function (item) {
      return item.id === link.guardian_id;
    });

    const student = studentsCache.find(function (item) {
      return item.id === link.student_id;
    });

    if (!parent || !student) return "";

    return (
      "<tr>" +
        "<td>" + escapeHtml(parent.display_name || parent.email) + "</td>" +
        "<td>" + escapeHtml(parent.email) + "</td>" +
        "<td>" + escapeHtml(student.class_name) + "</td>" +
        "<td>" + escapeHtml(student.full_name) + "</td>" +
        "<td><button class='btn btn-danger btn-small' data-unbind='" + escapeHtml(link.guardian_id) + "|" + escapeHtml(link.student_id) + "'>解除綁定</button></td>" +
      "</tr>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>家長綁定</h2>" +
    "<div class='panel'>" +
      "<h3>新增家長與學生綁定</h3>" +
      "<form id='guardianForm'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>家長帳號</label><select id='guardianParent' required>" +
            "<option value=''>請選擇家長</option>" + parentOptions +
          "</select></div>" +
          "<div class='field'><label>學生</label><select id='guardianStudent' required>" +
            "<option value=''>請選擇學生</option>" + studentOptions +
          "</select></div>" +
        "</div>" +
        "<button class='btn btn-success' type='submit'>建立綁定</button>" +
      "</form>" +
    "</div>" +
    "<div class='table-wrap'><table>" +
      "<thead><tr><th>家長姓名</th><th>家長帳號</th><th>班級</th><th>學生姓名</th><th>操作</th></tr></thead>" +
      "<tbody>" + (rows || "<tr><td colspan='5' class='empty'>目前沒有綁定資料</td></tr>") + "</tbody>" +
    "</table></div>";

  $("guardianForm").addEventListener("submit", saveGuardianBinding);

  content.addEventListener("click", async function (event) {
    const button = event.target.closest("[data-unbind]");
    if (!button) return;

    const parts = button.dataset.unbind.split("|");
    await removeGuardianBinding(parts[0], parts[1]);
  });
}

async function saveGuardianBinding(event) {
  event.preventDefault();

  const guardianId = $("guardianParent").value;
  const studentId = $("guardianStudent").value;

  const exists = guardianLinksCache.some(function (item) {
    return item.guardian_id === guardianId &&
      item.student_id === studentId;
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
    return (
      "<tr>" +
        "<td>" + escapeHtml(profile.display_name || "—") + "</td>" +
        "<td>" + escapeHtml(profile.email) + "</td>" +
        "<td><button class='btn btn-small' data-reset-parent='" + escapeHtml(profile.id) + "'>重設家長密碼</button></td>" +
      "</tr>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>家長密碼管理</h2>" +
    "<p class='muted'>透過既有 Edge Function 重設家長帳號密碼。</p>" +
    "<div class='table-wrap'><table>" +
      "<thead><tr><th>家長姓名</th><th>登入帳號</th><th>操作</th></tr></thead>" +
      "<tbody>" + (rows || "<tr><td colspan='3' class='empty'>目前沒有家長帳號</td></tr>") + "</tbody>" +
    "</table></div>";

  content.addEventListener("click", async function (event) {
    const button = event.target.closest("[data-reset-parent]");
    if (!button) return;

    await resetParentPassword(button.dataset.resetParent);
  });
}

async function resetParentPassword(parentUserId) {
  if (!confirm("確定要重設這位家長的登入密碼？")) return;

  try {
    const result = await db.functions.invoke(
      "admin-reset-parent-password",
      {
        body: {
          parentUserId: parentUserId
        }
      }
    );

    if (result.error) throw result.error;

    const message =
      result.data && result.data.message
        ? result.data.message
        : "已送出密碼重設要求。";

    showMessage(message, "success");

  } catch (error) {
    showMessage("密碼重設失敗：" + error.message, "error");
  }
}

// ==================================================
// 13. 家長登入紀錄
// ==================================================

async function renderLoginLogs() {
  const content = $("adminContent");

  content.innerHTML =
    "<h2 class='section-title'>家長登入紀錄</h2>" +
    "<div class='empty'>正在讀取登入紀錄……</div>";

  try {
    const result = await db
      .from("login_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (result.error) throw result.error;

    const logs = result.data || [];

    const rows = logs.map(function (log) {
      const profile = profilesCache.find(function (item) {
        return item.id === log.user_id;
      });

      return (
        "<tr>" +
          "<td>" + escapeHtml(profile ? (profile.display_name || profile.email) : "未知帳號") + "</td>" +
          "<td>" + escapeHtml(profile ? profile.email : log.user_id) + "</td>" +
          "<td>" + escapeHtml(log.created_at ? new Date(log.created_at).toLocaleString("zh-TW") : "—") + "</td>" +
        "</tr>"
      );
    }).join("");

    content.innerHTML =
      "<h2 class='section-title'>家長登入紀錄</h2>" +
      "<p class='muted'>最近 200 筆登入紀錄。</p>" +
      "<div class='table-wrap'><table>" +
        "<thead><tr><th>姓名</th><th>帳號</th><th>登入時間</th></tr></thead>" +
        "<tbody>" + (rows || "<tr><td colspan='3' class='empty'>目前沒有登入紀錄</td></tr>") + "</tbody>" +
      "</table></div>";

  } catch (error) {
    content.innerHTML =
      "<h2 class='section-title'>家長登入紀錄</h2>" +
      "<p class='system-message error'>讀取失敗：" + escapeHtml(error.message) + "</p>";
  }
}

// ==================================================
// 14. CSV 多場次成績匯出
// ==================================================

function renderExport() {
  const content = $("adminContent");

  const examOptions = sortByDateDesc(examsCache, "start_date").map(function (exam) {
    return (
      "<label style='display:block;margin:8px 0'>" +
        "<input type='checkbox' class='exportExam' value='" + escapeHtml(exam.id) + "'>" +
        " " + escapeHtml(formatDateRange(exam) + "｜" + exam.title) +
      "</label>"
    );
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>成績匯出</h2>" +
    "<div class='panel'>" +
      "<h3>選擇要匯出的考試場次</h3>" +
      "<div style='margin-bottom:12px'>" +
        "<button class='btn btn-secondary btn-small' id='selectAllExams'>全選</button> " +
        "<button class='btn btn-secondary btn-small' id='clearAllExams'>取消全選</button>" +
      "</div>" +
      "<div id='exportExamList'>" +
        (examOptions || "<p class='empty'>目前沒有考試場次</p>") +
      "</div>" +
      "<button class='btn btn-success' id='downloadCsv'>下載 CSV 成績表</button>" +
    "</div>" +
    "<p class='muted'>匯出欄位：週考區間、班級、學生編號、學生姓名、科目、考試範圍、一般成績、答對題數、模擬考等級。</p>";

  $("selectAllExams").addEventListener("click", function () {
    document.querySelectorAll(".exportExam").forEach(function (item) {
      item.checked = true;
    });
  });

  $("clearAllExams").addEventListener("click", function () {
    document.querySelectorAll(".exportExam").forEach(function (item) {
      item.checked = false;
    });
  });

  $("downloadCsv").addEventListener("click", exportCsv);
}

function exportCsv() {
  const selectedIds = Array.from(
    document.querySelectorAll(".exportExam:checked")
  ).map(function (item) {
    return item.value;
  });

  if (selectedIds.length === 0) {
    showMessage("請至少選擇一個考試場次。", "error");
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

  const rows = [headers.map(csvCell).join(",")];

  scoresCache.forEach(function (score) {
    if (!selectedIds.includes(score.exam_id)) return;

    const student = studentsCache.find(function (item) {
      return item.id === score.student_id;
    });

    const exam = examsCache.find(function (item) {
      return item.id === score.exam_id;
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

  downloadText(
    "小象成績資料_" + new Date().toISOString().slice(0, 10) + ".csv",
    rows.join("\r\n"),
    "text/csv;charset=utf-8"
  );

  showMessage("CSV 成績表已產生。", "success");
}

// ==================================================
// 15. 家長主畫面
// ==================================================

async function renderParentDashboard() {
  const contentResult = await db
    .from("guardian_students")
    .select("student_id")
    .eq("guardian_id", currentUser.id);

  if (contentResult.error) throw contentResult.error;

  const studentIds = (contentResult.data || []).map(function (item) {
    return item.student_id;
  });

  let children = [];

  if (studentIds.length > 0) {
    const studentResult = await db
      .from("students")
      .select("*")
      .in("id", studentIds)
      .order("student_code");

    if (studentResult.error) throw studentResult.error;

    children = studentResult.data || [];
  }

  appRoot.innerHTML =
    "<div class='topbar'>" +
      "<div><h1>小象文教機構｜家長成績查詢</h1><small>七堵校區</small></div>" +
      "<div>" +
        "<span>親愛的家長，您好！</span>　" +
        "<button class='btn btn-secondary btn-small' id='changePasswordButton'>修改密碼</button> " +
        "<button class='btn btn-secondary btn-small' id='logoutButton'>登出</button>" +
      "</div>" +
    "</div>" +
    "<main class='dashboard'>" +
      "<div id='systemMessage' class='system-message'></div>" +
      "<h2 class='section-title'>孩子的最近三次週考成績</h2>" +
      "<div id='parentScores'></div>" +
    "</main>" +
    "<div class='footer'>© 小象文教機構 七堵校區</div>";

  $("logoutButton").addEventListener("click", handleLogout);
  $("changePasswordButton").addEventListener("click", changeOwnPassword);

  if (children.length === 0) {
    $("parentScores").innerHTML =
      "<div class='empty'>目前尚未綁定學生資料，請聯絡班級管理員。</div>";
    return;
  }

  const examResult = await db
    .from("exams")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(3);

  if (examResult.error) throw examResult.error;

  const recentExams = examResult.data || [];
  const examIds = recentExams.map(function (item) {
    return item.id;
  });

  let scores = [];

  if (examIds.length > 0) {
    const scoreResult = await db
      .from("scores")
      .select("*")
      .in("student_id", studentIds)
      .in("exam_id", examIds);

    if (scoreResult.error) throw scoreResult.error;

    scores = scoreResult.data || [];
  }

  $("parentScores").innerHTML = children.map(function (student) {
    const studentScores = scores.filter(function (score) {
      return score.student_id === student.id;
    });

    const examBlocks = recentExams.map(function (exam) {
      const examScores = studentScores.filter(function (score) {
        return score.exam_id === exam.id;
      });

      const scoreRows = examScores.map(function (score) {
        const grade3 = isGrade3Class(student.class_name);

        const resultText = grade3
          ? (
              "答對 " + escapeHtml(score.correct_count == null ? "—" : score.correct_count) +
              " 題　" +
              "<span class='grade-tag'>" + escapeHtml(score.grade_level || "—") + "</span>"
            )
          : (
              "<span class='" + scoreClass(score.score, student.class_name) + "'>" +
              escapeHtml(score.score == null ? "—" : score.score) +
              "</span>"
            );

        return (
          "<tr>" +
            "<td>" + escapeHtml(score.subject) + "</td>" +
            "<td>" + escapeHtml(score.scope || "—") + "</td>" +
            "<td>" + resultText + "</td>" +
          "</tr>"
        );
      }).join("");

      return (
        "<div class='panel'>" +
          "<h3>" + escapeHtml(formatDateRange(exam)) + "｜" + escapeHtml(exam.title) + "</h3>" +
          "<div class='table-wrap'><table>" +
            "<thead><tr><th>科目</th><th>考試範圍</th><th>成績</th></tr></thead>" +
            "<tbody>" +
              (scoreRows || "<tr><td colspan='3' class='empty'>本次尚無成績資料</td></tr>") +
            "</tbody>" +
          "</table></div>" +
        "</div>"
      );
    }).join("");

    return (
      "<div class='student-card'>" +
        "<h3>" + escapeHtml(student.full_name) + "</h3>" +
        "<p class='muted'>" + escapeHtml(student.class_name) + "｜學生編號：" + escapeHtml(student.student_code) + "</p>" +
        (examBlocks || "<p class='empty'>目前沒有考試資料。</p>") +
      "</div>"
    );
  }).join("");
}

// ==================================================
// 16. 家長自行修改密碼
// ==================================================

async function changeOwnPassword() {
  const newPassword = prompt("請輸入新的密碼（至少 6 個字元）：");

  if (newPassword === null) return;

  if (newPassword.length < 6) {
    showMessage("新密碼至少需要 6 個字元。", "error");
    return;
  }

  const confirmPassword = prompt("請再次輸入新密碼確認：");

  if (confirmPassword === null) return;

  if (newPassword !== confirmPassword) {
    showMessage("兩次輸入的密碼不一致。", "error");
    return;
  }

  try {
    const result = await db.auth.updateUser({
      password: newPassword
    });

    if (result.error) throw result.error;

    showMessage("密碼修改成功。", "success");

  } catch (error) {
    showMessage("密碼修改失敗：" + error.message, "error");
  }
}

// ==================================================
// 17. 系統初始化
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
}

initializeApp();
