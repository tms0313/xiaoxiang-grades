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

const GRADE_OPTIONS = ["A++", "A+", "A", "B++", "B+", "B", "C", "缺考", "請假"];

let currentUser = null;
let currentProfile = null;
let currentHasTeacher = false;
let currentMode = "";
let profileRolesCache = [];
let studentsCache = [];
let examsCache = [];
let profilesCache = [];
let scoresCache = [];
let missingExclusionsCache = [];
let guardianLinksCache = [];
let studentSubjectsCache = [];
let teacherProfilesCache = [];
let teacherAssignmentsCache = [];
let teacherStudentsCache = [];
let teacherExamsCache = [];
let teacherScoresCache = [];
let teacherStudentSubjectsCache = [];
let teacherSelectedExamId = "";
let teacherSelectedClassName = "";
let scoreEntrySavedCount = 0;
let activeTab = "overview";
let overviewAutoRefreshTimer = null;
let overviewAutoRefreshBusy = false;

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

function showMessage(message, type, keepScrollPosition) {
  const box = $("systemMessage");

  if (!box) {
    alert(message);
    return;
  }

  box.textContent = message;
  box.className = "system-message " + (type || "");
  box.style.display = "block";
  if (!keepScrollPosition) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
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

  if (gradeLevel === "請假") {
    return "<span class='grade-tag grade-leave'>請假</span>";
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
  selectElement.classList.toggle(
    "grade-select-leave",
    selectElement.value === "請假"
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

// 手機家長使用內部 Email 別名登入，不使用 Supabase Phone Auth 或 SMS
function normalizeTaiwanMobile(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  if (/^09\d{8}$/.test(compact)) return "+886" + compact.slice(1);
  if (/^8869\d{8}$/.test(compact)) return "+" + compact;
  if (/^\+8869\d{8}$/.test(compact)) return compact;
  throw new Error("請輸入有效的台灣手機號碼，例如 0912345678。");
}

function phoneLoginEmail(value) {
  const phone = normalizeTaiwanMobile(value);
  return phone.replace(/^\+/, "") + "@phone-login.invalid";
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
  ".login-card h1 { text-align:center; font-size:29px; margin:0 0 8px; color:#23466b; }",
  ".login-card p { text-align:center; color:#315d86; font-size:19px; font-weight:750; margin-bottom:25px; }",

  ".field { margin-bottom:16px; }",
  ".field label { display:block; font-weight:700; margin-bottom:7px; }",
  ".field input,.field select { width:100%; padding:12px; border:1px solid #ccd4df; border-radius:8px; background:#fff; }",
  ".student-subject-field > label { display:block; margin-bottom:9px; }",
  ".student-subject-options { display:flex; align-items:center; flex-wrap:nowrap; gap:26px; }",
  ".student-subject-option { display:inline-flex !important; align-items:center; gap:7px; margin:0 !important; font-size:16px; font-weight:700 !important; white-space:nowrap; cursor:pointer; }",
  ".student-subject-option input[type=checkbox] { appearance:auto; -webkit-appearance:checkbox; width:16px !important; height:16px !important; min-width:16px; margin:0; padding:0; accent-color:#315d86; cursor:pointer; }",
  "@media(max-width:600px) { .student-subject-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:18px; row-gap:10px; justify-items:start; } .student-subject-option { font-size:16px; font-weight:700 !important; } }",

  ".btn { border:0; border-radius:8px; padding:10px 16px; background:#315d86; color:#fff; font-weight:700; }",
  ".btn:hover { filter:brightness(.94); }",
  ".btn-secondary { background:#64748b; }",
  ".btn-danger { background:#bd4242; }",
  ".btn-success { background:#27845b; }",
  "#scorePrevStudent { background:#27845b; }",
  "#scoreNextStudent { background:#64748b; }",
  "#scorePrevStudent:disabled, #scoreNextStudent:disabled { opacity:1; }",
  ".btn-small { padding:5px 9px; font-size:12px; margin:0; white-space:nowrap; }",
  ".login-card .btn { width:100%; padding:13px; }",
  ".btn:disabled { opacity:.6; cursor:not-allowed; }",

  ".forgot-password { margin-top:18px; padding:13px; border-radius:8px; background:#f1f5f9; color:#526477; font-size:14px; line-height:1.8; text-align:center; }",
  ".system-message { display:none; padding:12px 15px; border-radius:8px; margin-bottom:16px; background:#fff3cd; color:#765b13; }",
  ".system-message.error { background:#fde8e8; color:#a32626; }",
  ".system-message.success { background:#e3f5e9; color:#20683d; }",
  ".score-edit-overlay { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(20,34,50,.58); overflow-y:auto; }",
  ".score-edit-dialog { width:min(480px,100%); max-height:calc(100vh - 36px); overflow-y:auto; background:#fff; border-radius:16px; padding:22px; box-shadow:0 18px 55px rgba(0,0,0,.24); }",
  ".score-edit-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:18px; }",
  ".score-edit-header h3 { margin:0 0 6px; color:#23466b; font-size:20px; }",
  ".score-edit-header p { margin:0; color:#64748b; font-size:13px; line-height:1.6; }",
  ".score-edit-close { border:0; background:#eef2f6; color:#475569; border-radius:8px; width:34px; height:34px; font-size:24px; line-height:1; }",
  ".score-edit-dialog .field input,.score-edit-dialog .field select { min-height:44px; }",
  ".score-edit-note { margin:4px 0 16px; color:#64748b; font-size:13px; line-height:1.6; }",
  ".score-edit-actions { display:flex; gap:10px; justify-content:flex-end; }",
  ".score-edit-actions .btn { min-width:104px; }",
  "@media(max-width:600px) { .score-edit-overlay { align-items:flex-end; padding:10px; } .score-edit-dialog { max-height:88vh; padding:18px; border-radius:16px 16px 12px 12px; } .score-edit-actions { position:sticky; bottom:-18px; background:#fff; padding:12px 0 2px; } .score-edit-actions .btn { flex:1; } }",

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
  ".parent-bottom-nav { position:fixed; left:0; right:0; bottom:0; z-index:1000; display:flex; width:100%; padding:8px 10px calc(8px + env(safe-area-inset-bottom)); background:rgba(255,255,255,.98); border-top:1px solid #dce4ed; box-shadow:0 -4px 18px rgba(31,55,82,.12); }",
  ".teacher-bottom-nav { position:fixed; left:0; right:0; bottom:0; z-index:1000; display:flex !important; align-items:center; justify-content:center; width:100%; padding:7px 10px calc(7px + env(safe-area-inset-bottom)); background:rgba(255,255,255,.98); border-top:1px solid #dce4ed; box-shadow:0 -4px 18px rgba(31,55,82,.12); }",
  ".teacher-bottom-nav .parent-action-btn { flex:0 0 64px; width:64px; min-width:64px; min-height:52px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:0; border-radius:10px; color:#fff; font-size:11px; font-weight:750; padding:5px 6px; background:#a83e45; }",
  ".teacher-bottom-nav .parent-action-icon { width:19px; height:19px; flex:0 0 19px; stroke-width:1.9; }",
  ".teacher-page { padding-bottom:88px; }",
  ".parent-page { padding-bottom:94px; }",

  ".dashboard { width:min(1200px,94%); margin:30px auto; background:#fff; padding:28px; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,.08); }",
  ".tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px; border-bottom:1px solid #e4e9ef; padding-bottom:15px; }",
  ".tab-btn { border:0; padding:10px 14px; border-radius:8px; background:#edf1f5; color:#34475b; font-weight:700; }",
  ".tab-btn:hover { background:#315d86; color:#fff; }",
  ".tab-btn.active { background:#315d86; color:#fff; }",

  ".section-title { font-size:21px; margin:0 0 18px; color:#23466b; }",
  ".toolbar { display:flex; gap:10px; flex-wrap:wrap; margin:15px 0; align-items:center; }",
  ".toolbar input,.toolbar select { padding:9px; border:1px solid #ccd4df; border-radius:7px; }",
  ".teacher-toolbar { display:flex; flex-direction:column; align-items:stretch; gap:10px; }",
  ".teacher-filter-group { display:flex; flex-direction:column; align-items:stretch; gap:6px; width:100%; }",
  ".teacher-filter-group label { margin:0; }",
  ".teacher-filter-group select { width:100%; box-sizing:border-box; }",
  ".teacher-toolbar #teacherRefreshButton { align-self:flex-start; }",
  ".form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; }",
  ".alumni-score-form { background:#f7f9fc; border:1px solid #dfe7ef; border-radius:12px; padding:18px; margin-bottom:20px; }",
  ".alumni-score-basic-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); column-gap:12px; row-gap:5px; }",
  ".alumni-score-subject-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); column-gap:12px; row-gap:5px; align-items:end; margin-top:5px; }",
  ".alumni-score-form .field { margin-bottom:2px; min-width:0; }",
  ".alumni-score-form .field input,.alumni-score-form .field select { box-sizing:border-box; min-width:0; }",
  ".alumni-score-total { display:flex; flex-direction:column; justify-content:center; align-items:center; gap:6px; min-height:70px; box-sizing:border-box; padding:10px 8px; background:#eaf2f9; border-radius:8px; color:#23466b; font-weight:800; text-align:center; }",
  ".alumni-score-total strong { font-size:20px; }",
  ".alumni-score-table { min-width:920px; }",
  ".alumni-score-table td,.alumni-score-table th { text-align:center; white-space:nowrap; }",
  ".alumni-score-table th { padding:8px 9px; }",
  ".alumni-score-table td { padding:5px 9px; line-height:1.25; }",
  ".alumni-filter-row { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); align-items:stretch; gap:8px; margin:0 0 14px; width:100%; }",
  ".alumni-filter-row select,.alumni-filter-row input { box-sizing:border-box; display:block; width:100%; min-width:0; max-width:none; height:40px; min-height:40px; margin:0; padding:9px 8px; border:1px solid #ccd4df; border-radius:8px; background:#fff; font-size:13px; line-height:20px; }",
  "@media(max-width:900px) { .alumni-filter-row { grid-template-columns:repeat(3,minmax(0,1fr)); } }",
  "@media(max-width:600px) { .alumni-filter-row { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; } .alumni-filter-row select,.alumni-filter-row input { padding:9px 7px; font-size:13px; } }",
  ".alumni-score-table td:nth-child(2),.alumni-score-table th:nth-child(2),.alumni-score-table td:nth-child(3),.alumni-score-table th:nth-child(3) { text-align:left; }",
  ".alumni-score-actions { display:flex; gap:3px; justify-content:center; }",
  ".alumni-score-actions .btn { flex:0 0 auto !important; width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size:14px !important; font-weight:800 !important; line-height:30px !important; border-radius:6px !important; white-space:nowrap; }",
  "@media(max-width:760px) { .alumni-score-basic-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .alumni-score-subject-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }",
  "@media(max-width:600px) { .alumni-score-form { padding:13px; } .alumni-score-basic-grid { grid-template-columns:1fr; } .alumni-score-subject-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }",
  ".score-entry-fields-wrap { width:100%; overflow-x:auto; padding-bottom:4px; }",
  ".score-entry-fields { display:grid; grid-template-columns:repeat(6,minmax(130px,1fr)); gap:12px; min-width:852px; }",
  ".score-entry-fields .field { margin-bottom:0; }",
  ".panel { border:1px solid #e2e8ef; border-radius:12px; padding:18px; margin-bottom:18px; }",
  ".parent-page .panel { padding:20px 22px; margin:0 0 18px; border-radius:13px; }",
  ".parent-page .panel h3 { margin:0 0 17px; color:#315d86; font-size:19px; font-weight:850; line-height:1.45; }",

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
  ".overview-table .action-cell { min-width:100px; }",
  ".overview-table .action-buttons { gap:3px; }",
  ".overview-table .action-buttons .btn { padding:2.5px 4.5px; font-size:6px; line-height:1.35; border-radius:5px; }",
  ".overview-table .action-buttons .btn { width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size:14px !important; line-height:30px !important; border-radius:6px !important; }",
  ".teacher-account-table .action-buttons { display:inline-flex; align-items:center; flex-wrap:nowrap; gap:4px; white-space:nowrap; }",
  ".teacher-account-table .action-buttons .btn { flex:0 0 auto !important; width:auto !important; min-width:0 !important; height:27px !important; min-height:27px !important; padding:0 7px !important; font-size:11px !important; font-weight:700 !important; line-height:27px !important; border-radius:5px !important; white-space:nowrap; }",
  ".teacher-assignment-table td:last-child { white-space:nowrap; }",
  ".teacher-assignment-table td:last-child .btn { flex:0 0 auto !important; width:auto !important; min-width:0 !important; height:27px !important; min-height:27px !important; padding:0 7px !important; font-size:11px !important; font-weight:700 !important; line-height:27px !important; border-radius:5px !important; white-space:nowrap; }",

  ".action-cell { min-width:155px; white-space:nowrap; }",
  ".action-buttons { display:flex; align-items:center; justify-content:flex-start; flex-wrap:nowrap; gap:5px; white-space:nowrap; }",
  ".action-buttons .btn { flex:0 0 auto; margin:0; }",

  /* 家長成績：電腦與手機統一採用科目卡片式呈現 */
  ".parent-page .dashboard { max-width:1000px; padding:22px 24px; }",
  ".parent-brand { display:flex; flex:1 1 100%; flex-direction:row; align-items:center; justify-content:center; text-align:center; }",
  ".parent-brand h1 { width:100%; margin:0; color:#fff; text-align:center; font-size:25px; line-height:1.4; letter-spacing:.3px; font-weight:850; }",
  ".teacher-dashboard { max-width:1050px; }",
  ".teacher-class-panel { margin-bottom:10px; padding:12px 15px; }",
  ".teacher-class-heading { margin:0 0 9px; padding-bottom:7px; border-bottom:2px solid #dce7f1; color:#23466b; font-size:20px; }",
  ".teacher-subject-section { margin:8px 0 10px; }",
  ".teacher-subject-heading { margin:0 0 5px; color:#315d86; font-size:17px; }",
  ".teacher-scope-group { margin:0 0 7px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }",
  ".teacher-scope-heading { padding:7px 10px; background:#edf5f0; color:#267447; font-size:19px; font-weight:800; line-height:1.45; }",
  ".teacher-score-rows { padding:0 9px; }",
  ".teacher-score-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; column-gap:14px; min-height:48px; padding:7px 4px; border-bottom:1px solid #edf0f3; }",
  ".teacher-score-row:last-child { border-bottom:0; }",
  ".teacher-score-student { display:flex; align-items:baseline; gap:7px; min-width:0; color:#263445; font-size:20px; font-weight:700; }",
  ".teacher-score-student small { color:#8a96a5; font-size:13px; font-weight:500; white-space:nowrap; }",
  ".teacher-score-value { display:flex; flex-direction:row; align-items:center; justify-content:flex-start; justify-self:end; flex-wrap:nowrap; gap:6px; width:150px; min-width:150px; max-width:none; flex-shrink:0; padding-left:14px; border-left:1px solid #e8edf3; text-align:left; white-space:nowrap; font-size:20px; font-weight:900; }",
  ".teacher-score-value .parent-score-number { font-size:23px; font-weight:900; }",
  ".teacher-score-value .grade-tag { padding:4px 10px; font-size:17px !important; }",
  ".teacher-score-value .grade-missing { padding:4px 10px; font-size:16px; }",
  "@media(max-width:600px) { .teacher-class-panel { padding:10px; } .teacher-score-row { min-height:46px; column-gap:10px; padding:6px 2px; } .teacher-score-student { font-size:19px; } .teacher-scope-heading { font-size:18px; } .teacher-score-student small { font-size:12px; } .teacher-score-value { justify-self:end; justify-content:flex-start; width:136px; min-width:136px; margin-left:auto; padding-left:10px; text-align:left; font-size:18px; } .teacher-score-value .parent-score-number { font-size:21px; } .teacher-score-value .grade-tag { font-size:15px !important; } .teacher-score-value .grade-missing { font-size:15px; } }",
  ".teacher-student-panel { margin-bottom:14px; }",
  ".teacher-student-panel h3 { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:12px; }",
  ".teacher-student-panel h3 small { color:#718096; font-size:13px; font-weight:600; }",
  ".teacher-subject-card { max-width:780px; margin:8px auto; }",
  ".grade-missing { display:inline-block; padding:5px 9px; border-radius:7px; background:#fff4df; color:#a35b08; font-size:14px; font-weight:800; white-space:nowrap; }",
  ".parent-score-list { display:flex; flex-direction:column; gap:6px; width:100%; max-width:820px; margin:0 auto; }",
  ".parent-subject-card { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:16px; border:1px solid #dfe7ef; border-radius:13px; padding:16px 18px; margin:0; background:#fff; }",
  ".parent-subject-info { min-width:0; }",
  ".parent-subject-name { font-size:19px; font-weight:900; color:#23466b; margin-bottom:8px; line-height:1.4; }",
  ".parent-subject-scope { display:block; font-size:15px; line-height:1.65; overflow-wrap:anywhere; word-break:break-word; }",
  ".parent-subject-scope-label { color:#8491a0; font-size:11px; font-weight:800; }",
  ".parent-page .parent-subject-card .parent-subject-scope-text { display:inline-block !important; min-width:0; max-width:100%; padding:5px 11px !important; border:1px solid #c8ebd3 !important; border-radius:8px !important; background:#eaf8ef !important; color:#267447 !important; font-size:15px !important; font-weight:700 !important; line-height:1.55; box-decoration-break:clone; -webkit-box-decoration-break:clone; }",
  ".parent-subject-result { min-width:104px; max-width:48%; text-align:center; padding-left:17px; border-left:1px solid #e8edf3; color:#263445; }",
  ".parent-subject-result-label { color:#8491a0; font-size:13px; font-weight:800; margin-bottom:5px; }",
  ".parent-subject-result-value { font-size:25px; font-weight:900; line-height:1.4; color:#173f68; overflow-wrap:anywhere; }",
  ".parent-subject-result-value .parent-score-number { font-size:27px; font-weight:900; white-space:nowrap; }",
  ".parent-subject-result-value .grade-tag { display:inline-block; margin-top:3px; padding:4px 10px; font-size:15px !important; line-height:1.4; vertical-align:middle; }",
  ".parent-subject-result-value .grade-absent { font-size:16px; }",

  ".student-management-table { width:100%; min-width:650px; table-layout:fixed; }",
  ".student-management-table th:nth-child(1),.student-management-table td:nth-child(1) { width:20%; }",
  ".student-management-table th:nth-child(2),.student-management-table td:nth-child(2) { width:19%; }",
  ".student-management-table th:nth-child(3),.student-management-table td:nth-child(3) { width:15%; }",
  ".student-management-table th:nth-child(4),.student-management-table td:nth-child(4) { width:16%; }",
  ".student-management-table th:nth-child(5),.student-management-table td:nth-child(5) { width:30%; min-width:150px; }",
  ".student-status-active,.student-status-inactive { display:inline-block; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:800; white-space:nowrap; }",
  ".student-status-action { display:inline-flex; align-items:center; justify-content:center; gap:3px; min-width:42px; }",
  ".student-status-enable-icon { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; font-size:12px; font-weight:800; line-height:1; }",
  ".student-status-active { background:#e7f6ec; color:#237344; }",
  ".student-status-inactive { background:#f1f3f5; color:#697586; }",
  ".student-management-table .action-buttons { display:inline-flex; align-items:center; gap:9px; }",
  ".student-management-table .action-buttons .btn { padding:3px 6px; font-size:12px; line-height:1.3; border-radius:6px; }",
  ".student-management-table .action-buttons .btn { width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size:12px !important; line-height:30px !important; border-radius:6px !important; }",
  ".student-management-table td.student-action-cell { min-width:112px; white-space:nowrap; }",

  ".exam-management-table { min-width:600px; table-layout:fixed; }",
  ".exam-management-table th:nth-child(1),.exam-management-table td:nth-child(1) { width:30%; }",
  ".exam-management-table th:nth-child(2),.exam-management-table td:nth-child(2) { width:30%; }",
  ".exam-management-table th:nth-child(3),.exam-management-table td:nth-child(3) { width:40%; }",
  ".exam-management-table .action-cell { min-width:100px; }",
  ".exam-management-table .action-buttons { gap:3px; }",
  ".exam-management-table .action-buttons .btn { padding:2px 3px; font-size:8px; line-height:1.3; border-radius:5px; }",
  ".exam-management-table .action-buttons .btn { width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size:14px !important; line-height:30px !important; border-radius:6px !important; }",

  ".guardian-management-table { min-width:760px; table-layout:fixed; }",
  ".guardian-management-table th:nth-child(1),.guardian-management-table td:nth-child(1) { width:15%; }",
  ".guardian-management-table th:nth-child(2),.guardian-management-table td:nth-child(2) { width:20%; }",
  ".guardian-management-table th:nth-child(3),.guardian-management-table td:nth-child(3) { width:25%; }",
  ".guardian-management-table th:nth-child(4),.guardian-management-table td:nth-child(4) { width:17%; }",
  ".guardian-management-table th:nth-child(5),.guardian-management-table td:nth-child(5) { width:23%; }",
  ".guardian-management-table .action-cell { min-width:0; }",
  ".guardian-management-table .action-buttons { gap:3px; }",
  ".guardian-management-table .action-buttons .btn { padding:2.5px 4px; font-size:8px; line-height:1.3; border-radius:5px; }",
  ".guardian-management-table .action-buttons .btn { height:22px !important; min-height:22px !important; padding:0 5px !important; font-size:8px !important; line-height:22px !important; border-radius:4px !important; }",
  ".guardian-unbound-row td { background:#fffaf0; }",
  ".password-table-wrap { max-width:820px; }",
  ".password-management-table { width:100%; min-width:0; max-width:820px; table-layout:fixed; }",
  ".password-management-table th:nth-child(1),.password-management-table td:nth-child(1) { width:24%; }",
  ".password-management-table th:nth-child(2),.password-management-table td:nth-child(2) { width:48%; }",
  ".password-management-table th:nth-child(3),.password-management-table td:nth-child(3) { width:28%; }",
  ".password-management-table .action-buttons { display:flex; align-items:center; flex-wrap:nowrap; gap:4px; }",
  ".password-management-table .action-buttons .btn { flex:0 0 auto !important; width:auto !important; min-width:0 !important; height:27px !important; min-height:27px !important; padding:0 7px !important; font-size:11px !important; line-height:27px !important; border-radius:5px !important; white-space:nowrap; }",
  ".guardian-status-unbound { display:inline-block; padding:4px 8px; border-radius:6px; background:#fff0cf; color:#8a5a00; font-weight:800; white-space:nowrap; }",

  ".low-score { color:#d32626; font-weight:800; }",
  ".grade-tag { display:inline-block; padding:4px 9px; border-radius:6px; background:#e8eff8; color:#315d86; font-weight:800; white-space:nowrap; }",
  ".grade-absent { color:#d32626 !important; background:#fde8e8 !important; font-weight:900 !important; }",
  ".grade-leave { color:#8a5a00 !important; background:#fff0cf !important; font-weight:900 !important; }",
  ".grade-select-absent { color:#d32626 !important; font-weight:900 !important; }",
  ".grade-select-leave { color:#8a5a00 !important; font-weight:900 !important; }",
  "option[value='缺考'] { color:#d32626; font-weight:900; }",
  "option[value='請假'] { color:#8a5a00; font-weight:900; }",

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
  ".overview-table .action-buttons .btn,.student-management-table .action-buttons .btn,.exam-management-table .action-buttons .btn { font-size:14px !important; font-weight:800 !important; }",
  ".guardian-management-table .action-buttons .btn { font-size:13px !important; font-weight:800 !important; padding:0 5px !important; }",
  ".export-panel-title,.export-select-all span,.export-period-date { font-size:16px !important; font-weight:700 !important; line-height:1.5; }",
  ".export-period-list { gap:3px !important; }",
  ".export-period-item { padding:7px 12px !important; gap:10px !important; min-height:0; }",
  ".export-period-item input { width:19px; height:19px; }",
  ".export-summary { padding:9px 2px; }",
  ".login-card .field label { font-size:20px !important; font-weight:800 !important; }",
  ".guardian-management-table .action-buttons .btn { width:42px !important; min-width:42px !important; height:30px !important; min-height:30px !important; padding:0 !important; font-size:14px !important; font-weight:800 !important; line-height:30px !important; border-radius:6px !important; }",
  "@media(max-width:600px) { .export-panel-title,.export-select-all span,.export-period-date { font-size:16px !important; font-weight:700 !important; } .export-period-item { padding:6px 10px !important; } }",

  ".muted { color:#778494; font-size:13px; }",
  ".empty { padding:25px; text-align:center; color:#8491a0; }",
  ".loading-message { position:fixed; top:15px; right:15px; z-index:9999; background:#23466b; color:#fff; padding:12px 18px; border-radius:8px; box-shadow:0 3px 12px rgba(0,0,0,.2); }",
  ".student-card { max-width:920px; border:1px solid #dce5ee; border-radius:15px; padding:25px 26px; margin:22px auto; background:#fff; box-shadow:0 4px 16px rgba(35,70,107,.045); }",
  ".student-card .student-heading { display:flex; align-items:center; flex-wrap:wrap; gap:10px 14px; margin:0 0 20px; padding:0 0 16px; border-bottom:1px solid #e6edf4; color:#23466b; line-height:1.4; }",
  ".student-card .student-name { font-size:27px; font-weight:850; letter-spacing:.4px; color:#1e4165; }",
  ".student-card .student-class { display:inline-flex; align-items:center; min-height:31px; padding:5px 13px; border-radius:8px; background:#edf4fa; color:#315d86; font-size:15px; font-weight:800; }",
  ".student-card .student-name { font-size:25px; font-weight:850; letter-spacing:.3px; color:#1e4165; }",
  ".student-card .student-class { display:inline-flex; align-items:center; min-height:28px; padding:4px 11px; border-radius:7px; background:#edf4fa; color:#315d86; font-size:14px; font-weight:800; }",
  ".footer { text-align:center; color:#8995a2; padding:25px; font-size:13px; }",
  ".hidden { display:none !important; }",

  "@media(max-width:600px) {",
  ".dashboard { width:96%; padding:15px; margin:15px auto; }",
  ".parent-page .dashboard { max-width:none; padding:14px 12px; }",
  ".student-card { padding:18px 15px; margin:16px 0; border-radius:13px; }",
  ".student-card .student-heading { gap:8px 10px; margin-bottom:16px; padding-bottom:13px; }",
  ".student-card .student-name { font-size:23px; }",
  ".student-card .student-class { min-height:29px; padding:4px 11px; font-size:14px; }",
  ".parent-score-list { max-width:none; gap:6px; }",
  ".parent-page .panel { padding:16px 13px; margin-bottom:14px; }",
  ".parent-page .panel h3 { margin-bottom:14px; font-size:17px; }",
  ".topbar { padding:14px; }",
  ".topbar h1 { font-size:17px; }",
  ".parent-brand h1 { font-size:23px; }",
  ".student-card .student-heading { align-items:center; }",
  ".student-card .student-name { font-size:22px; }",
  ".student-card .student-class { font-size:13px; }",
  ".login-card { padding:24px; }",
  ".tabs { gap:5px; }",
  ".tab-btn { padding:8px 10px; font-size:13px; }",

  /* 手機版維持科目左、成績右，縮小間距 */
  ".parent-subject-card { grid-template-columns:minmax(0,1fr) auto; gap:10px; padding:14px 12px; border-radius:11px; }",
  ".parent-subject-name { font-size:17px; margin-bottom:7px; }",
  ".parent-subject-scope { font-size:14px; line-height:1.6; }",
  ".parent-page .parent-subject-card .parent-subject-scope-text { padding:4px 9px !important; font-size:13px !important; }",
  ".parent-subject-result-value .grade-tag { padding:3px 8px; font-size:14px !important; }",
  ".parent-subject-result { min-width:82px; max-width:45%; padding-left:10px; }",
  ".parent-subject-result-label { font-size:12px; }",
  ".parent-subject-result-value { font-size:22px; line-height:1.35; }",
  ".parent-subject-result-value .parent-score-number { font-size:24px; }",
  ".student-card .student-heading { gap:0 9px; margin-bottom:14px; }",
  ".student-card .student-name { font-size:23px; }",
  ".student-card .student-class { font-size:17px; }",
  ".parent-page .parent-top-actions { display:flex !important; flex:0 0 100%; justify-content:center; }",
  ".parent-bottom-nav { position:fixed; left:0; right:0; bottom:0; z-index:1000; display:flex; width:100%; padding:8px 10px calc(8px + env(safe-area-inset-bottom)); background:rgba(255,255,255,.98); border-top:1px solid #dce4ed; box-shadow:0 -4px 18px rgba(31,55,82,.12); }",
  ".parent-bottom-nav .parent-action-btn { flex:1 1 50%; min-width:0; min-height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:0; border-radius:9px; color:#fff; font-size:12px; font-weight:750; padding:5px 8px; }",
  ".parent-bottom-nav .parent-action-icon { width:19px; height:19px; flex:0 0 19px; stroke-width:1.9; }",
  ".parent-bottom-nav .parent-password-btn { background:#315f8b; }",
  ".parent-bottom-nav .parent-logout-btn { background:#a83e45; }",
  ".parent-bottom-nav .parent-action-btn:hover { transform:none; box-shadow:none; }",
  ".teacher-bottom-nav .parent-action-btn { flex:1 1 100%; }",
  ".teacher-page { padding-bottom:88px; }",

  ".student-management-table { min-width:650px; }",
  ".overview-table { min-width:1050px; }",
  ".exam-management-table { min-width:600px; }",
  ".export-panel { padding:14px; }",
  ".export-period-item { padding:12px; }",
  ".teacher-bottom-nav { position:fixed; left:0; right:0; bottom:0; z-index:1000; display:flex !important; width:100%; padding:8px 10px calc(8px + env(safe-area-inset-bottom)); background:rgba(255,255,255,.98); border-top:1px solid #dce4ed; box-shadow:0 -4px 18px rgba(31,55,82,.12); }",
  ".teacher-bottom-nav .parent-action-btn { flex:1 1 50%; min-width:0; min-height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:0; border-radius:9px; color:#fff; font-size:12px; font-weight:750; padding:5px 8px; }",
  ".teacher-bottom-nav .parent-action-icon { width:19px; height:19px; flex:0 0 19px; stroke-width:1.9; }",
  ".teacher-bottom-nav .parent-password-btn { background:#315f8b; }",
  ".teacher-bottom-nav .parent-logout-btn { background:#a83e45; }",
  ".teacher-bottom-nav .parent-action-btn:hover { transform:none; box-shadow:none; }",
  ".teacher-page { padding-bottom:94px; }",
  "}"
].join("\n");

style.textContent += "\n" +
  ".parent-review-action { display:flex; justify-content:flex-end; margin-top:6px; padding-top:0; border-top:0; }" +
  ".parent-review-btn { width:100%; max-width:320px; min-height:44px; border:0; border-radius:9px; padding:10px 14px; background:#27845b; color:#fff; font-size:15px; font-weight:800; }" +
  ".parent-review-btn:disabled { background:#e2e7ec; color:#64748b; border:1px solid #d2d9e1; opacity:1; cursor:not-allowed; box-shadow:none; }" +
  "@media(max-width:600px) { .parent-review-action { margin-top:5px; } .parent-review-btn { max-width:none; min-height:46px; font-size:15px; } }";

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
  currentHasTeacher = false;
  currentMode = "";
  profileRolesCache = [];
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

  const extraRoleResult = await db
    .from("profile_roles")
    .select("role")
    .eq("user_id", currentUser.id)
    .eq("role", "teacher")
    .maybeSingle();

  if (extraRoleResult.error) {
    showMessage("讀取額外身分失敗：" + extraRoleResult.error.message, "error");
    return;
  }

  currentHasTeacher = currentProfile.role === "teacher" || !!extraRoleResult.data;

  if (currentProfile.role === "teacher" && currentUser.app_metadata && currentUser.app_metadata.must_change_password === true) {
    renderTeacherFirstLoginPasswordChange();
    return;
  }

  if (!["admin", "parent", "teacher"].includes(currentProfile.role)) {
    await db.auth.signOut();
    loginPage();
    showMessage("此帳號沒有系統使用權限。", "error");
    return;
  }

  if (currentProfile.role === "parent" && currentHasTeacher) {
    currentMode = "";
    renderModeChooser();
  } else {
    currentMode = currentProfile.role === "teacher" ? "teacher" : currentProfile.role;
    await recordSuccessfulLogin();
  }

  if (currentProfile.role === "parent" && currentHasTeacher) return;

  await renderDashboard();
}

async function recordSuccessfulLogin() {
  try {
    await db.from("login_events").insert({ user_id: currentUser.id });
  } catch (error) {
    console.warn("登入紀錄寫入失敗", error);
  }
}

function renderModeChooser() {
  document.body.classList.remove("parent-page", "teacher-page");
  appRoot.innerHTML =
    "<div class='topbar'><div><h1>小象文教機構</h1><small>請選擇登入模式</small></div>" +
    "<button class='tab-btn' id='modeLogoutButton'>登出</button></div>" +
    "<main class='dashboard' style='max-width:560px'>" +
      "<div class='panel'><h2>選擇使用身分</h2>" +
        "<p class='muted'>此帳號同時具有家長及教師身分，請選擇本次要使用的功能。</p>" +
        "<div class='form-grid'>" +
          "<button class='btn btn-success' id='chooseParentMode' type='button'>家長查詢</button>" +
          "<button class='btn' id='chooseTeacherMode' type='button'>教師查詢</button>" +
        "</div>" +
      "</div>" +
    "</main><div class='footer'>© 小象文教機構</div>";

  $("modeLogoutButton").addEventListener("click", handleLogout);
  $("chooseParentMode").addEventListener("click", async function () {
    currentMode = "parent";
    await recordSuccessfulLogin();
    await renderDashboard();
  });
  $("chooseTeacherMode").addEventListener("click", async function () {
    currentMode = "teacher";
    await recordSuccessfulLogin();
    await renderDashboard();
  });
}

function switchAccountMode() {
  if (!currentHasTeacher || currentProfile.role !== "parent") return;
  currentMode = currentMode === "teacher" ? "parent" : "teacher";
  renderDashboard();
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
      (Number(now.hour) > 20 ||
        (Number(now.hour) === 20 && Number(now.minute) >= 0)));
}

async function cleanupPreviousWeekExclusions() {
  const datedExams = sortByDateDesc(
    examsCache.filter(exam => exam.start_date || exam.end_date),
    "start_date"
  );

  // 必須有本週與上一週兩筆考試，且本週成績已到週六 20:00 開放時間。
  if (datedExams.length < 2 || !hasLatestExamReachedReleaseTime(datedExams[0])) {
    return;
  }

  const previousExamId = datedExams[1].id;
  const result = await db.from("score_missing_exclusions")
    .delete()
    .eq("exam_id", previousExamId);

  if (result.error) throw result.error;

  // 同步更新前端快取，避免本次畫面仍顯示已清除的名單。
  missingExclusionsCache = missingExclusionsCache.filter(
    item => String(item.exam_id) !== String(previousExamId)
  );
}

async function loadAdminData() {
  const results = await Promise.all([
    db.from("students").select("*").order("student_code"),
    db.from("exams").select("*").order("start_date", { ascending: false }),
    db.from("profiles").select("*").eq("role", "parent"),
    db.from("scores").select("*"),
    db.from("guardian_students").select("*"),
    db.from("student_subjects").select("*"),
    db.from("profiles").select("*").eq("role", "teacher"),
    db.from("teacher_assignments").select("*"),
    db.from("profiles").select("*"),
    db.from("profile_roles").select("user_id, role").eq("role", "teacher"),
    db.from("score_missing_exclusions").select("*")
  ]);

  const names = ["學生資料", "考試資料", "家長帳號", "成績資料", "家長綁定資料", "學生修課資料", "教師帳號", "教師授課權限", "全部帳號", "額外身分資料", "未登錄排除資料"];

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
  studentSubjectsCache = results[5].data || [];
  teacherAssignmentsCache = results[7].data || [];
  profileRolesCache = results[9].data || [];
  missingExclusionsCache = results[10].data || [];

  // 新一週成績於週六 20:00 開放時，自動清除上一週的已排除提醒名單。
  try {
    await cleanupPreviousWeekExclusions();
  } catch (error) {
    console.error("清除上一週已排除提醒失敗：", error);
  }

  const additionalTeacherIds = new Set(profileRolesCache.map(item => String(item.user_id)));
  const allProfiles = results[8].data || [];
  const teacherMap = new Map();
  (results[6].data || []).forEach(profile => teacherMap.set(String(profile.id), {
    ...profile,
    isAdditionalTeacherRole: false
  }));
  allProfiles.filter(profile => additionalTeacherIds.has(String(profile.id))).forEach(profile => {
    teacherMap.set(String(profile.id), {
      ...profile,
      isAdditionalTeacherRole: true
    });
  });
  teacherProfilesCache = Array.from(teacherMap.values());
}

async function renderDashboard() {
  showLoading("正在載入系統資料……");

  try {
    if (currentProfile.role === "admin") {
      await loadAdminData();
      renderAdminDashboard();
    } else if (currentProfile.role === "teacher" || currentMode === "teacher") {
      await renderTeacherDashboard();
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
      "<div><button class='tab-btn' id='logoutButton'>登出</button></div>" +
    "</div>" +
    "<main class='dashboard'>" +
      "<div id='systemMessage' class='system-message'></div>" +
      "<div class='tabs' id='adminTabs'>" +
        "<button class='tab-btn' data-tab='overview'>成績總覽</button>" +
        "<button class='tab-btn' data-tab='reviews'>週考檢閱紀錄</button>" +
        "<button class='tab-btn' data-tab='scores'>成績登錄</button>" +
        "<button class='tab-btn' data-tab='students'>學生管理</button>" +
        
        "<button class='tab-btn' data-tab='guardians'>家長綁定</button>" +
        "<button class='tab-btn' data-tab='teachers'>教師管理</button>" +
        "<button class='tab-btn' data-tab='passwords'>家長帳號管理</button>" +
        "<button class='tab-btn' data-tab='logs'>登入紀錄</button>" +
        "<button class='tab-btn' data-tab='export'>成績匯出</button>" +
        "<button class='tab-btn' data-tab='alumni'>歷屆模考成績</button>" +
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

  document.querySelectorAll(".tab-btn").forEach(function (button) {
    button.classList.toggle("active", button.dataset.tab === activeTab);
  });

  if (activeTab === "overview") renderOverview();
  if (activeTab === "scores") renderScoreEntry();
  if (activeTab === "students") renderStudents();
  if (activeTab === "guardians") renderGuardians();
  if (activeTab === "teachers") renderTeacherManagement();
  if (activeTab === "passwords") renderPasswords();
  if (activeTab === "logs") renderLoginLogs();
  if (activeTab === "reviews") renderStudentReviewRecords();
  if (activeTab === "export") renderExport();
  if (activeTab === "alumni") renderAlumniMockScores();
}

// ==================================================
// 7. 成績總覽
// ==================================================

function renderOverview(preservedFilters, keepExcludedPanelOpen) {
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

    const resultText = score.grade_level === "請假"
      ? gradeTag("請假")
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

  function buildMissingOverviewRow(student, exam, subject, scope) {
    return (
      "<tr class='overview-missing-row'>" +
        "<td>" + escapeHtml(formatDateRange(exam)) + "</td>" +
        "<td>" + escapeHtml(student.class_name) + "</td>" +
        "<td>" + escapeHtml(student.student_code) + "</td>" +
        "<td>" + escapeHtml(student.full_name) + "</td>" +
        "<td>" + escapeHtml(subject) + "</td>" +
        "<td>" + escapeHtml(scope || "—") + "</td>" +
        "<td><span class='grade-missing'>未登錄</span></td>" +
        "<td class='action-cell'><div class='action-buttons'>" +
          "<button class='btn btn-danger btn-small' data-exclude-missing='1' data-exam-id='" + escapeHtml(exam.id) +
          "' data-student-id='" + escapeHtml(student.id) + "' data-subject='" + escapeHtml(subject) +
          "' data-scope='" + escapeHtml(scope || "") + "'>刪除</button>" +
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

  const examOptions = sortByDateDesc(examsCache, "start_date").map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>成績總覽</h2>" +
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
      "<span class='muted' style='font-size:13px;white-space:nowrap'>每 60 秒自動更新</span>" +
    "</div>" +
    "<p id='overviewFilterHint' class='muted' style='margin:0 0 10px'>選擇考試週期及科目後，系統會依已登錄的科目範圍比對同班修課學生。</p>" +
    "<div id='excludedRemindersPanel' class='panel' style='display:none;margin-top:18px'>" +
      "<h3>已排除的未登錄提醒</h3>" +
      "<p class='muted'>這裡只管理已排除的提醒；按下「恢復提醒」後，該筆資料會重新列入未登錄清單。</p>" +
      "<div class='table-wrap'><table><thead><tr><th>考試區間</th><th>班級</th><th>編號</th><th>姓名</th><th>科目</th><th>考試範圍</th><th>操作</th></tr></thead>" +
      "<tbody id='excludedReminderRows'>" + (buildExcludedReminderRows() || "<tr><td colspan='7' class='empty'>目前沒有已排除的提醒</td></tr>") + "</tbody></table></div>" +
    "</div>" +
    "<div class='table-wrap'><table class='overview-table'>" +
      "<thead><tr><th>考試區間</th><th>班級</th><th>編號</th><th>姓名</th><th>科目</th><th>考試範圍</th><th>成績／狀態</th><th>操作</th></tr></thead>" +
      "<tbody id='overviewRows'><tr><td colspan='8' class='empty'>資料載入中……</td></tr></tbody>" +
    "</table></div>";

  function filterRows() {
    const search = $("overviewSearch").value.trim().toLowerCase();
    const examId = $("overviewExam").value;
    const className = $("overviewClass").value;
    const subject = $("overviewSubject").value;
    const status = $("overviewStatus").value;

    const matchesStudent = function (student) {
      return student &&
        (!className || student.class_name === className) &&
        (
          !search ||
          String(student.full_name || "").toLowerCase().includes(search) ||
          String(student.student_code || "").toLowerCase().includes(search)
        );
    };

    const rows = scoresCache.filter(function (score) {
      const student = getStudent(score.student_id);
      return matchesStudent(student) &&
        (!examId || String(score.exam_id) === String(examId)) &&
        (!subject || score.subject === subject);
    }).map(function (score) {
      return { score: score, student: getStudent(score.student_id), exam: getExam(score.exam_id) };
    }).filter(item => item.exam);

    // 未選考試週期時，逐一檢查所有考試；選定週期時只檢查該次考試。
    // 每個考試、班級、科目及範圍獨立比對，至少一位學生有非請假紀錄才啟動提示。
    const examsToCheck = examId
      ? [getExam(examId)].filter(Boolean)
      : sortByDateDesc(examsCache, "start_date");

    examsToCheck.forEach(function (selectedExam) {
      const currentExamId = String(selectedExam.id);
      const classNames = Array.from(new Set(
        studentsCache.filter(student => student.is_active !== false && matchesStudent(student))
          .map(student => student.class_name)
      ));
      const targetSubjects = subject ? [subject] : SUBJECTS;

      classNames.forEach(function (targetClass) {
        targetSubjects.forEach(function (targetSubject) {
          const enrolledStudents = studentsCache.filter(function (student) {
            return student.is_active !== false &&
              student.class_name === targetClass &&
              matchesStudent(student) &&
              studentSubjectsCache.some(function (item) {
                return String(item.student_id) === String(student.id) &&
                  item.subject === targetSubject &&
                  item.is_active === true;
              });
          });

          const classScopeScores = scoresCache.filter(function (score) {
            const student = getStudent(score.student_id);
            return String(score.exam_id) === currentExamId &&
              score.subject === targetSubject &&
              score.grade_level !== "請假" &&
              student &&
              student.class_name === targetClass &&
              String(score.scope || "").trim() !== "";
          });

          const registeredScopes = Array.from(new Set(
            classScopeScores.map(score => String(score.scope).trim())
          ));

          registeredScopes.forEach(function (scope) {
            const studentsWithThisScope = new Set(
              classScopeScores
                .filter(score => String(score.scope).trim() === scope)
                .map(score => String(score.student_id))
            );

            if (studentsWithThisScope.size === 0) return;

            enrolledStudents.forEach(function (student) {
              const matchingRecord = scoresCache.find(function (score) {
                return String(score.exam_id) === currentExamId &&
                  String(score.student_id) === String(student.id) &&
                  score.subject === targetSubject &&
                  String(score.scope || "").trim() === scope;
              });

              const exclusionExists = missingExclusionsCache.some(function (item) {
                return String(item.exam_id) === currentExamId &&
                  String(item.student_id) === String(student.id) &&
                  item.subject === targetSubject &&
                  String(item.scope || "").trim() === scope;
              });

              if (!matchingRecord && !exclusionExists) {
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
    });

    const filteredRows = rows.filter(function (item) {
      if (status === "all") return true;
      if (status === "missing") return !!item.missing;
      if (item.missing || !item.score) return false;
      if (status === "leave") return item.score.grade_level === "請假";
      if (status === "absent") return item.score.grade_level === "缺考";
      if (status === "low") return item.score.grade_level !== "請假" && item.score.grade_level !== "缺考" &&
        scoreClass(item.score.score, item.student.class_name, item.score.subject) === "low-score";
      return true;
    });

    rows.length = 0;
    rows.push.apply(rows, filteredRows);

    rows.sort(function (a, b) {
      const dateA = String((a.exam && (a.exam.end_date || a.exam.start_date)) || "");
      const dateB = String((b.exam && (b.exam.end_date || b.exam.start_date)) || "");
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      const classCompare = String(a.student.class_name || "").localeCompare(String(b.student.class_name || ""), "zh-Hant");
      if (classCompare !== 0) return classCompare;
      if (!!a.missing !== !!b.missing) return a.missing ? 1 : -1;
      const codeCompare = String(a.student.student_code || "").localeCompare(
        String(b.student.student_code || ""), undefined, { numeric: true }
      );
      if (codeCompare !== 0) return codeCompare;
      return String(a.scope || (a.score && a.score.scope) || "").localeCompare(
        String(b.scope || (b.score && b.score.scope) || ""), "zh-Hant"
      );
    });

    const missingCount = rows.filter(item => item.missing).length;
    const hint = $("overviewFilterHint");
    if (hint) {
      hint.textContent = examId
        ? "目前篩選：" + formatDateRange(getExam(examId)) + "／" + (className || "全部班級") + "／" + (subject || "全部科目") +
          "；依各班、各科目已登錄的範圍比對修課學生，尚有 " + missingCount + " 筆未登錄提醒；已標記請假的學生不會列入。"
        : "目前顯示全部考試週期；系統會依各次考試、班級及科目已登錄的範圍，自動比對修課學生並提示未登錄。";
    }

    $("overviewRows").innerHTML =
      rows.map(function (item) {
        return item.missing
          ? buildMissingOverviewRow(item.student, item.exam, item.subject, item.scope)
          : buildOverviewRow(item.score);
      }).join("") ||
      "<tr><td colspan='8' class='empty'>沒有符合的成績資料</td></tr>";
  }

  if (preservedFilters) {
    $("overviewSearch").value = preservedFilters.search || "";
    $("overviewExam").value = preservedFilters.examId || "";
    $("overviewClass").value = preservedFilters.className || "";
    $("overviewSubject").value = preservedFilters.subject || "";
    $("overviewStatus").value = preservedFilters.status || "all";
  }

  $("overviewSearch").addEventListener("input", filterRows);
  $("overviewExam").addEventListener("change", filterRows);
  $("overviewClass").addEventListener("change", filterRows);
  $("overviewSubject").addEventListener("change", filterRows);
  $("overviewStatus").addEventListener("change", filterRows);

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
    const deleteButton = event.target.closest("[data-delete-score]");
    const excludeButton = event.target.closest("[data-exclude-missing]");
    const restoreButton = event.target.closest("[data-restore-missing]");

    if (editButton) await editScore(editButton.dataset.editScore);
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
    if (activeTab !== "overview" || overviewAutoRefreshBusy || !$("overviewRows")) return;

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
      await loadAdminData();
      if (activeTab === "overview" && $("overviewRows")) {
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
// 7-0. 排除單筆未登錄提醒
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
  const student = studentsCache.find(row => String(row.id) === String(item.studentId));
  const exam = examsCache.find(row => String(row.id) === String(item.examId));
  if (!student || !exam) {
    showMessage("找不到學生或考試資料，請重新整理。", "error");
    return;
  }

  const confirmed = confirm(
    "確定要刪除此筆未登錄提醒嗎？\n\n" +
    "學生：" + student.full_name + "\n" +
    "班級：" + student.class_name + "\n" +
    "考試：" + formatDateRange(exam) + "\n" +
    "科目：" + item.subject + "\n" +
    "考試範圍：" + (item.scope || "—") + "\n\n" +
    "只會排除此學生本次考試、此科目及範圍的提醒，不會刪除學生或成績資料。"
  );
  if (!confirmed) return;

  try {
    const result = await db.from("score_missing_exclusions").upsert({
      exam_id: item.examId,
      student_id: item.studentId,
      subject: item.subject,
      scope: item.scope || ""
    }, { onConflict: "exam_id,student_id,subject,scope" }).select("*").single();

    if (result.error) throw result.error;
    missingExclusionsCache = missingExclusionsCache.filter(function (row) {
      return !(
        String(row.exam_id) === String(item.examId) &&
        String(row.student_id) === String(item.studentId) &&
        row.subject === item.subject &&
        String(row.scope || "") === String(item.scope || "")
      );
    });
    missingExclusionsCache.push(result.data);
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

  const student = studentsCache.find(item => String(item.id) === String(exclusion.student_id));
  const exam = examsCache.find(item => String(item.id) === String(exclusion.exam_id));
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

async function editScore(scoreId) {
  const overviewScrollY = window.scrollY;
  const overviewFilters = {
    search: $("overviewSearch") ? $("overviewSearch").value : "",
    examId: $("overviewExam") ? $("overviewExam").value : "",
    className: $("overviewClass") ? $("overviewClass").value : "",
    subject: $("overviewSubject") ? $("overviewSubject").value : "",
    status: $("overviewStatus") ? $("overviewStatus").value : "all"
  };
  const score = scoresCache.find(item => String(item.id) === String(scoreId));
  if (!score) {
    showMessage("找不到這筆成績資料，請重新整理。", "error");
    return;
  }
  const student = studentsCache.find(item => String(item.id) === String(score.student_id));
  const exam = examsCache.find(item => String(item.id) === String(score.exam_id));
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
      "<div class='score-edit-header'><div><h3 id='scoreEditTitle'>修改成績</h3><p>" +
        escapeHtml(student.full_name) + "｜" + escapeHtml(student.class_name) + "｜" + escapeHtml(formatDateRange(exam)) +
      "</p></div><button type='button' class='score-edit-close' id='scoreEditClose' aria-label='關閉'>×</button></div>" +
      "<form id='scoreEditForm'>" +
        "<p id='scoreEditError' class='system-message error' style='display:none'></p>" +
        "<div class='field'><label for='scoreEditSubject'>科目</label><select id='scoreEditSubject' required>" + subjectOptions + "</select></div>" +
        "<div class='field'><label for='scoreEditScope'>考試範圍</label><input id='scoreEditScope' type='text' maxlength='120' required value='" + escapeHtml(score.scope || "") + "'></div>" +
        "<div id='scoreEditValueFields'></div>" +
        "<p class='score-edit-note'>修改後會更新原有紀錄，不會新增另一筆成績。</p>" +
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
    if (!confirm("確認修改這筆成績嗎？\n\n學生：" + student.full_name +
      "\n科目：" + subject + "\n考試範圍：" + scope + "\n成績：" + resultLabel +
      "\n\n此操作會更新原有資料，不會新增另一筆成績。")) return;

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
      const result = await db.from("scores")
        .update(payload)
        .eq("id", scoreId)
        .select("*")
        .single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("資料已送出，但未取得更新後的成績內容，請重新整理確認。");

      // 直接以資料庫回傳的最新資料更新前端快取，確保畫面立即反映修改結果。
      scoresCache = scoresCache.map(function (item) {
        return String(item.id) === String(scoreId) ? result.data : item;
      });

      closeScoreEditModal();
      renderOverview(overviewFilters);
      showMessage("「" + student.full_name + "」的成績已修改成功。", "success", true);
      window.scrollTo({ top: overviewScrollY, behavior: "auto" });
    } catch (error) {
      saveButton.disabled = false;
      saveButton.textContent = "儲存修改";
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

    await loadAdminData();
    renderOverview(overviewFilters);

    // 成績總覽刪除後保留原篩選條件與捲動位置，不顯示系統通知。
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

function setDefaultExamDates() {
  const dates = getCurrentWeekExamDates();
  if ($("examStart")) $("examStart").value = dates.start;
  if ($("examEnd")) $("examEnd").value = dates.end;
}

function renderScoreEntry() {
  const content = $("adminContent");
  const examOptions = sortByDateDesc(examsCache, "start_date").map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" + escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");
  const gradeOptionsHtml = GRADE_OPTIONS.map(function (grade) {
    return "<option value='" + escapeHtml(grade) + "'>" + escapeHtml(grade) + "</option>";
  }).join("");

  const examRows = sortByDateDesc(examsCache, "start_date").map(function (exam) {
    return "<tr>" +
      "<td>" + escapeHtml(formatDate(exam.start_date)) + "</td>" +
      "<td>" + escapeHtml(formatDate(exam.end_date)) + "</td>" +
      "<td class='action-cell'><div class='action-buttons'>" +
        "<button class='btn btn-small' data-edit-exam='" + escapeHtml(exam.id) + "'>修改</button>" +
        "<button class='btn btn-danger btn-small' data-delete-exam='" + escapeHtml(exam.id) + "'>刪除</button>" +
      "</div></td></tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>成績登錄</h2>" +
    "<div class='panel'><h3 id='examFormTitle'>新增考試</h3>" +
      "<form id='examForm'><input type='hidden' id='examEditId'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>開始日期</label><input id='examStart' type='date' style='width:100%;max-width:180px;box-sizing:border-box' required></div>" +
          "<div class='field'><label>結束日期</label><input id='examEnd' type='date' style='width:100%;max-width:180px;box-sizing:border-box' required></div>" +
        "</div>" +
        "<div class='toolbar' style='display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:nowrap;margin-top:12px'>" +
          "<button class='btn btn-success' type='submit'>儲存考試</button>" +
          "<button class='btn btn-secondary' type='button' id='examCancel'>清除</button>" +
        "</div>" +
      "</form></div>" +
    "<div class='table-wrap'><table class='exam-management-table'>" +
      "<thead><tr><th>開始日期</th><th>結束日期</th><th>操作</th></tr></thead>" +
      "<tbody>" + (examRows || "<tr><td colspan='3' class='empty'>尚無考試資料</td></tr>") + "</tbody>" +
    "</table></div>" +
    "<div class='panel'><h3>成績登錄</h3><form id='scoreForm'><div class='score-entry-fields-wrap'><div class='score-entry-fields'>" +
    "<div class='field'><label>考試週期</label><select id='scoreExam' required><option value=''>請先選擇考試週期</option>" + examOptions + "</select></div>" +
    "<div class='field'><label>班級篩選</label><select id='scoreClass'><option value=''>全部班級</option><option value='國一班'>國一班</option><option value='國二班'>國二班</option><option value='國三班'>國三班</option></select></div>" +
    "<div class='field'><label>學生</label><select id='scoreStudent' required><option value=''>請選擇學生</option></select></div>" +
    "<div id='generalAttendanceField' class='field'><label>出席狀態</label><select id='generalAttendance'><option value='normal'>正常出席</option><option value='請假'>請假</option></select></div>" +
    "<div class='field'><label>科目</label><select id='scoreSubject' required><option value=''>請選擇科目</option>" +
    SUBJECTS.map(s => "<option>" + escapeHtml(s) + "</option>").join("") +
    "</select></div>" +
    "<div class='field'><label>考試範圍</label><input id='scoreScope' placeholder='例如：第 1～2 課' required></div></div></div>" +
    "<div class='toolbar' style='display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:4px 0 16px'>" +
    "<div style='display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:nowrap;width:100%'>" +
    "<button class='btn btn-success' style='flex:1' type='button' id='scorePrevStudent'>上一位學生</button>" +
    "<button class='btn btn-secondary' style='flex:1' type='button' id='scoreNextStudent'>下一位學生</button></div>" +
    "</div>" +

    "<div id='normalScoreField' class='field'><label>一般成績</label><input id='scoreValue' type='number' min='0' max='100' step='0.1' placeholder='請輸入分數'></div>" +
    "<div id='grade3MathFields' class='form-grid hidden'><div class='field'><label>國三數學分數</label><input id='grade3MathScore' type='number' min='0' max='100' step='0.1'></div>" +
    "<div class='field'><label>模擬考等級</label><select id='grade3MathGrade'><option value=''>請選擇等級</option>" + gradeOptionsHtml + "</select></div></div>" +
    "<div id='grade3Fields' class='form-grid hidden'><div class='field'><label>答對題數</label><input id='correctCount' type='number' min='0' step='1'></div>" +
    "<div class='field'><label>模擬考等級</label><select id='gradeLevel'><option value=''>請選擇等級</option>" + gradeOptionsHtml + "</select></div></div>" +
    "<p id='absenceHint' class='muted hidden' style='color:#8a5a00;font-weight:800'>已選擇特殊狀態，不需要輸入分數或答對題數。</p>" +
    "<button class='btn btn-success' type='submit' id='saveScoreButton'>儲存成績</button></form></div>" +
    "<p class='muted'>請先選擇考試週期，再依班級篩選學生。儲存後會保留考試、班級、學生、科目及範圍，方便連續登錄；可使用上一位／下一位學生快速切換。遇到重複資料時，系統會顯示原有與新成績供確認。</p>";

  const scoreMessage = $("systemMessage");
  const scoreSaveButton = $("saveScoreButton");
  if (scoreMessage && scoreSaveButton && scoreSaveButton.parentNode) {
    scoreSaveButton.parentNode.insertBefore(scoreMessage, scoreSaveButton.nextSibling);
    scoreMessage.style.margin = "12px 0 0";
    scoreMessage.style.scrollMarginTop = "16px";
  }

  setDefaultExamDates();

  $("scoreExam").addEventListener("change", saveScoreEntryProgress);
  $("scoreClass").addEventListener("change", function () {
    updateScoreStudentOptions(false);
    updateScoreMode();
    saveScoreEntryProgress();
  });
  $("scoreStudent").addEventListener("change", function () { updateScoreMode(); saveScoreEntryProgress(); });
  $("scoreSubject").addEventListener("change", function () { updateScoreMode(); saveScoreEntryProgress(); });
  $("scoreScope").addEventListener("input", saveScoreEntryProgress);
  ["scoreValue", "grade3MathScore", "grade3MathGrade", "correctCount", "gradeLevel"].forEach(function (id) {
    $(id).addEventListener("input", saveScoreEntryProgress);
    $(id).addEventListener("change", function () {
      updateGrade3AbsenceMode();
      saveScoreEntryProgress();
    });
  });
  $("generalAttendance").addEventListener("change", function () {
    updateGrade3AbsenceMode();
    saveScoreEntryProgress();
  });
  $("scorePrevStudent").addEventListener("click", function () { moveScoreStudent(-1); saveScoreEntryProgress(); });
  $("scoreNextStudent").addEventListener("click", function () { moveScoreStudent(1); saveScoreEntryProgress(); });
  $("scoreForm").addEventListener("submit", saveScore);
  $("examForm").addEventListener("submit", saveExam);
  $("examCancel").addEventListener("click", clearExamForm);
  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-exam]");
    const deleteButton = event.target.closest("[data-delete-exam]");
    if (editButton) editExam(editButton.dataset.editExam);
    if (deleteButton) await deleteExam(deleteButton.dataset.deleteExam);
  };
  updateScoreStudentOptions(false);
  updateScoreMode();
  restoreScoreEntryProgress();
}

function getScoreEntryStudents() {
  const className = $("scoreClass") ? $("scoreClass").value : "";
  return studentsCache.filter(student =>
    student.is_active !== false &&
    (!className || student.class_name === className)
  );
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
  if (previousId && students.some(item => String(item.id) === String(previousId))) select.value = previousId;
  const count = $("scoreStudentCount");
  if (count) count.textContent = "目前 " + students.length + " 位學生";
  const index = students.findIndex(item => String(item.id) === String(select.value));
  if ($("scorePrevStudent")) $("scorePrevStudent").disabled = index <= 0;
  if ($("scoreNextStudent")) $("scoreNextStudent").disabled = index < 0 || index >= students.length - 1;
}

function moveScoreStudent(offset) {
  const students = getScoreEntryStudents();
  const index = students.findIndex(item => String(item.id) === String($("scoreStudent").value));
  const next = index < 0 ? 0 : index + offset;
  if (next < 0 || next >= students.length) return;
  $("scoreStudent").value = students[next].id;
  updateScoreStudentOptions(true);
  updateScoreMode();
  saveScoreEntryProgress();
}

function updateScoreMode() {
  const student = studentsCache.find(item => String(item.id) === String($("scoreStudent").value));
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
  updateScoreStudentOptions(true);
  updateGrade3AbsenceMode();
}

function updateGrade3AbsenceMode() {
  const mathGrade = $("grade3MathGrade");
  const otherGrade = $("gradeLevel");
  updateGradeSelectStyle(mathGrade);
  updateGradeSelectStyle(otherGrade);
  const student = $("scoreStudent") ? studentsCache.find(item => String(item.id) === String($("scoreStudent").value)) : null;
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
  const student = studentsCache.find(item => String(item.id) === String(studentId));
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

  const duplicate = scoresCache.find(item =>
    String(item.student_id) === String(studentId) &&
    String(item.exam_id) === String(examId) &&
    item.subject === subject &&
    String(item.scope || "").trim() === scope
  );

  if (duplicate) {
    const oldResult = duplicate.grade_level === "缺考" || duplicate.grade_level === "請假" ? duplicate.grade_level :
      grade3Math ? (duplicate.score == null ? "—" : duplicate.score) + " 分／" + (duplicate.grade_level || "未設定等級") :
      grade3 ? (duplicate.correct_count == null ? "—" : duplicate.correct_count) + " 題／" + (duplicate.grade_level || "未設定等級") :
      (duplicate.score == null ? "—" : duplicate.score) + " 分";
    const newResult = gradeLevel === "缺考" || gradeLevel === "請假" ? gradeLevel :
      grade3Math ? scoreValue + " 分／" + gradeLevel :
      grade3 ? correctCount + " 題／" + gradeLevel : scoreValue + " 分";
    const exam = examsCache.find(item => String(item.id) === String(examId));
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
      ? await db.from("scores").update(payload).eq("id", duplicate.id)
      : await db.from("scores").insert(payload);
    if (result.error) throw result.error;
    await loadAdminData();
    scoreEntrySavedCount += 1;
    clearScoreEntryDraft();
    updateScoreStudentOptions(true);
    updateScoreMode();
    const counter = $("scoreEntryCounter");
    if (counter) counter.textContent = "本次頁面已成功登錄 " + scoreEntrySavedCount + " 筆";
    const savedExam = examsCache.find(item => String(item.id) === String(examId));
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

  const matchingStudents = studentsCache.filter(function (student) {
    const active = student.is_active !== false;
    const statusMatch = filter === "active" ? active : !active;
    const classMatch = classFilter === "all" || student.class_name === classFilter;
    return statusMatch && classMatch;
  });

  const enrolledStudents = matchingStudents.filter(function (student) {
    return subjectFilter === "all" || studentSubjectsCache.some(function (item) {
      return String(item.student_id) === String(student.id) &&
        item.subject === subjectFilter &&
        item.is_active === true;
    });
  });

  const visibleStudents = enrolledStudents;

  const rows = visibleStudents.map(function (student) {
    const active = student.is_active !== false;
    return "<tr>" +
      "<td>" + escapeHtml(student.student_code) + "</td>" +
      "<td>" + escapeHtml(student.full_name) + "</td>" +
      "<td>" + escapeHtml(student.class_name) + "</td>" +
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
      "<div class='toolbar'>" +
        "<label for='studentStatusFilter'><strong>學生狀態：</strong></label>" +
        "<select id='studentStatusFilter'><option value='active'>在學學生</option><option value='inactive'>離班學生</option></select>" +
        "<label for='studentClassFilter'><strong>班級：</strong></label>" +
        "<select id='studentClassFilter'><option value='all'>全部學生</option><option value='國一班'>國一班</option><option value='國二班'>國二班</option><option value='國三班'>國三班</option></select>" +
        "<label for='studentSubjectFilter'><strong>修課科目：</strong></label>" +
        "<select id='studentSubjectFilter'><option value='all'>全部科目</option>" +
          SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") +
        "</select>" +
        "<span id='studentSubjectCount' style='display:inline-flex; align-items:center; gap:4px; white-space:nowrap; padding:4px 10px; border-radius:6px; background:#e4f7e8; color:#176b35; font-weight:700; font-size:inherit; line-height:1.4;'>目前修課人數 <strong style='color:#d62828; font-size:1.35em; line-height:1;'> " + enrolledStudents.length + "</strong> 人</span>" +
      "</div>" +
      "<div class='table-wrap'><table class='student-management-table'>" +
        "<thead><tr><th>學生編號</th><th>姓名</th><th>班級</th><th>狀態</th><th>操作</th></tr></thead>" +
        "<tbody>" + (rows || "<tr><td colspan='5' class='empty'>目前沒有符合條件的學生</td></tr>") + "</tbody>" +
      "</table></div>";

  $("studentStatusFilter").value = filter;
  $("studentClassFilter").value = classFilter;
  $("studentSubjectFilter").value = subjectFilter;
  $("studentStatusFilter").addEventListener("change", renderStudents);
  $("studentClassFilter").addEventListener("change", renderStudents);
  $("studentSubjectFilter").addEventListener("change", renderStudents);
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
  const student = studentsCache.find(item => item.id === id);
  if (!student) return;

  $("studentEditId").value = student.id;
  $("studentCode").readOnly = false;
  $("studentCode").value = student.student_code || "";
  $("studentName").value = student.full_name || "";
  $("studentClass").value = student.class_name || "";
  document.querySelectorAll("input[name='studentSubject']").forEach(function (checkbox) {
    checkbox.checked = studentSubjectsCache.some(function (item) {
      return String(item.student_id) === String(student.id) &&
        item.subject === checkbox.value && item.is_active === true;
    });
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

  try {
    let studentId = id;
    if (id) {
      const result = await db.from("students").update(payload).eq("id", id);
      if (result.error) throw result.error;
    } else {
      const result = await db.from("students")
        .insert(Object.assign({ is_active: true }, payload))
        .select("id")
        .single();
      if (result.error) throw result.error;
      studentId = result.data.id;
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

    await loadAdminData();
    renderStudents();
    showMessage(id ? "學生資料及修課科目已更新。" : "學生及修課科目已新增。", "success");

  } catch (error) {
    showMessage("學生資料儲存失敗：" + error.message, "error");
  }
}

async function toggleStudentStatus(id) {
  const student = studentsCache.find(item => String(item.id) === String(id));
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

    await loadAdminData();
    renderStudents();
    showMessage("學生「" + student.full_name + "」已" + action + "。", "success");
  } catch (error) {
    showMessage(action + "學生失敗：" + error.message, "error");
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


function clearExamForm() {
  $("examForm").reset();
  $("examEditId").value = "";
  $("examFormTitle").textContent = "新增考試";
  setDefaultExamDates();
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
    renderScoreEntry();
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

  const parentOptions = profilesCache.map(function (profile) {
    const loginIdentity = profile.email || profile.phone || "未設定登入帳號";
    return "<option value='" + escapeHtml(profile.id) + "'>" +
      escapeHtml((profile.display_name || loginIdentity) + "｜" + loginIdentity) +
      "</option>";
  }).join("");

  const activeStudents = studentsCache.filter(student => student.is_active !== false);
  const studentOptions = activeStudents.map(function (student) {
    return "<option value='" + escapeHtml(student.id) + "'>" +
      escapeHtml(student.class_name + "｜" + student.student_code + "｜" + student.full_name) +
      "</option>";
  }).join("");

  function buildGuardianRows() {
    const selectedClass = $("guardianClass")
      ? $("guardianClass").value
      : "";

    const linkedStudentIds = new Set(
      guardianLinksCache.map(link => String(link.student_id))
    );

    const rows = [];

    guardianLinksCache.forEach(function (link) {
      const parent = profilesCache.find(
        item => String(item.id) === String(link.guardian_id)
      );
      const student = studentsCache.find(
        item => String(item.id) === String(link.student_id)
      );

      if (!student) return;
      if (selectedClass && student.class_name !== selectedClass) return;

      rows.push(
        "<tr>" +
          "<td>" + escapeHtml(student.class_name) + "</td>" +
          "<td>" + escapeHtml(student.full_name) + "</td>" +
          "<td>" + escapeHtml(parent ? (parent.email || parent.phone || "—") : "—") + "</td>" +
          "<td><span class='guardian-status-bound'>已綁定</span></td>" +
          "<td class='action-cell'>" +
            "<div class='action-buttons'>" +
              (parent ? "<button class='btn btn-small' data-edit-parent='" + escapeHtml(parent.id) + "'>修改</button>" : "") +
              "<button class='btn btn-danger btn-small' data-unbind='" +
                escapeHtml(link.guardian_id) + "|" +
                escapeHtml(link.student_id) + "'>解除</button>" +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    });

    studentsCache
      .filter(student => student.is_active !== false)
      .filter(student => !linkedStudentIds.has(String(student.id)))
      .filter(student => !selectedClass || student.class_name === selectedClass)
      .forEach(function (student) {
        rows.push(
          "<tr class='guardian-unbound-row'>" +
            "<td>" + escapeHtml(student.class_name) + "</td>" +
            "<td>" + escapeHtml(student.full_name) + "</td>" +
            "<td>—</td>" +
            "<td><span class='guardian-status-unbound'>尚未綁定家長</span></td>" +
            "<td class='action-cell'>請建立家長帳號並完成綁定</td>" +
          "</tr>"
        );
      });

    return rows.join("");
  }

  content.innerHTML =
    "<h2 class='section-title'>家長綁定</h2>" +

    "<div class='panel'><h3>新增家長帳號</h3>" +
      "<p class='muted'>可選擇使用 Email 或手機號碼建立家長帳號。手機帳號不需要簡訊驗證。</p>" +
      "<form id='createParentForm'><div class='form-grid'>" +
        "<div class='field'><label>帳號類型</label><select id='newParentAccountType'><option value='email'>Email 登入</option><option value='phone'>手機號碼登入</option></select></div>" +
        "<div class='field'><label>家長 Email／手機號碼</label><input id='newParentAccount' type='text' placeholder='請輸入 Email 或 0912345678' autocomplete='off' required></div>" +
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
        "<thead><tr><th>班級</th><th>學生姓名</th><th>家長帳號</th><th>綁定狀態</th><th>操作</th></tr></thead>" +
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
    "確認修改家長資料嗎？\\n\\n" +
    "原姓名：" + (parent.display_name || "—") + "\\n" +
    "新姓名：" + displayName + "\\n\\n" +
    "原" + accountLabel + "：" + oldAccount + "\\n" +
    "新" + accountLabel + "：" + newAccount + "\\n\\n" +
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

    await loadAdminData();
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
  if (!studentId) {
    showMessage("請選擇要綁定的學生。", "error");
    return;
  }

  const student = studentsCache.find(item => String(item.id) === String(studentId));
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
    "初始密碼：123456\n\n" +
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
// 11-5. 教師帳號與授課權限管理
// ==================================================

function renderTeacherManagement() {
  const content = $("adminContent");
  const teacherOptions = teacherProfilesCache.map(function (profile) {
    return "<option value='" + escapeHtml(profile.id) + "'>" +
      escapeHtml(profile.email || profile.display_name || profile.id) +
      "</option>";
  }).join("");

  const selectedTeacherId = $("teacherAccountSelect")
    ? $("teacherAccountSelect").value
    : "";

  const assignmentRows = teacherAssignmentsCache
    .filter(item => !selectedTeacherId || String(item.teacher_id) === String(selectedTeacherId))
    .map(function (item) {
      const teacher = teacherProfilesCache.find(
        profile => String(profile.id) === String(item.teacher_id)
      );
      return "<tr data-teacher-assignment-row='" + escapeHtml(item.id) + "'>" +
        "<td>" + escapeHtml(teacher ? teacher.email : "教師帳號") + "</td>" +
        "<td>" + escapeHtml(item.class_name) + "</td>" +
        "<td>" + escapeHtml(item.subject) + "</td>" +
        "<td><button class='btn btn-danger btn-small' data-delete-teacher-assignment='" + escapeHtml(item.id) + "'>移除綁定</button></td>" +
      "</tr>";
    }).join("");

  const eligibleParents = profilesCache.filter(profile =>
    !profileRolesCache.some(item => String(item.user_id) === String(profile.id) && item.role === "teacher")
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
          "</div><button class='btn btn-success' type='submit'>新增授課權限</button></form>"
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
    const rows = teacherAssignmentsCache
      .filter(item => !selected || String(item.teacher_id) === String(selected))
      .map(function (item) {
        const teacher = teacherProfilesCache.find(profile => String(profile.id) === String(item.teacher_id));
        return "<tr data-teacher-assignment-row='" + escapeHtml(item.id) + "'><td>" + escapeHtml(teacher ? teacher.email : "教師帳號") + "</td>" +
          "<td>" + escapeHtml(item.class_name) + "</td><td>" + escapeHtml(item.subject) + "</td>" +
          "<td><button class='btn btn-danger btn-small' data-delete-teacher-assignment='" + escapeHtml(item.id) + "'>移除綁定</button></td></tr>";
      }).join("");
    $("teacherAssignmentRows").innerHTML = rows || "<tr><td colspan='4' class='empty'>目前沒有授課權限設定</td></tr>";
  }

  content.onclick = async function (event) {
    const resetButton = event.target.closest("[data-reset-teacher]");
    if (resetButton) {
      const profile = teacherProfilesCache.find(item => String(item.id) === String(resetButton.dataset.resetTeacher));
      if (profile) await manageTeacherAccount("reset_password", profile.id, profile.email || "");
      return;
    }

    const deleteButton = event.target.closest("[data-delete-teacher]");
    if (deleteButton) {
      const profile = teacherProfilesCache.find(item => String(item.id) === String(deleteButton.dataset.deleteTeacher));
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
  const profile = profilesCache.find(item => String(item.id) === String(userId));
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
  const profile = teacherProfilesCache.find(item =>
    String(item.id) === String(userId) && item.isAdditionalTeacherRole
  );
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

  try {
    const result = await db.from("teacher_assignments").insert({
      teacher_id: teacherId,
      class_name: className,
      subject: subject
    });
    if (result.error) {
      if (result.error.code === "23505") throw new Error("這位教師已經有相同的授課權限。");
      throw result.error;
    }
    await loadAdminData();
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
    await loadAdminData();
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

  const rows = profilesCache.map(function (profile) {
    const loginAccount = profile.email || profile.phone || "—";
    return "<tr>" +
      "<td>" + escapeHtml(profile.display_name || "—") + "</td>" +
      "<td>" + escapeHtml(loginAccount) + "</td>" +
      "<td><div class='action-buttons'>" +
        "<button class='btn btn-small' data-reset-parent='" + escapeHtml(profile.id) + "'>重設密碼</button>" +
        "<button class='btn btn-danger btn-small' data-delete-parent='" + escapeHtml(profile.id) + "'>刪除帳號</button>" +
      "</div></td>" +
      "</tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>家長帳號管理</h2>" +
    "<p class='muted'>可重設家長登入密碼，或刪除不再使用的家長帳號。刪除帳號後，該家長將無法再登入，且會解除其學生綁定；學生資料及成績不會刪除。</p>" +
    "<div class='table-wrap password-table-wrap'><table class='password-management-table'>" +
      "<thead><tr><th>家長姓名</th><th>登入帳號（Email／手機）</th><th>操作</th></tr></thead>" +
      "<tbody>" + (rows || "<tr><td colspan='3' class='empty'>目前沒有家長帳號</td></tr>") + "</tbody>" +
    "</table></div>";

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

async function deleteParentAccount(parentUserId) {
  const parent = profilesCache.find(function (profile) {
    return String(profile.id) === String(parentUserId);
  });

  if (!parent) {
    showMessage("找不到這筆家長帳號資料，請重新整理後再試。", "error");
    return;
  }

  const loginAccount = parent.email || parent.phone || "未設定";
  const confirmed = confirm(
    "確定要永久刪除以下家長帳號？\n\n" +
    "家長姓名：" + (parent.display_name || "未命名") + "\n" +
    "登入帳號：" + loginAccount + "\n\n" +
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

    await loadAdminData();
    renderPasswords();
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
    const results = await Promise.all([
      db.from("login_events").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("profiles").select("id, role, email")
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
      } else if (profile && profile.role === "teacher") {
        const teacherNames = {
          "black951165@gmail.com": "王炫老師",
          "tingning1995120@gmail.com": "溫老師",
          "nice0220@hotmail.com": "林一老師"
        };
        const teacherEmail = String(profile.email || "").trim().toLowerCase();
        loginIdentity = teacherNames[teacherEmail] || profile.email || "教師帳號";
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
      "<div class='toolbar' style='display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap'>" +
        "<p class='muted' style='margin:0'>最近 200 筆登入紀錄（包含管理員、家長及教師）。</p>" +
        "<button class='btn btn-danger btn-small' type='button' id='clearLoginLogsButton'>清除全部登入紀錄</button>" +
      "</div>" +
      "<div class='table-wrap'><table><thead><tr><th>登入身分</th><th>登入時間</th></tr></thead>" +
      "<tbody>" + (rows || "<tr><td colspan='2' class='empty'>目前沒有登入紀錄</td></tr>") +
      "</tbody></table></div>";

    const clearButton = $("clearLoginLogsButton");
    if (clearButton) clearButton.addEventListener("click", clearAllLoginLogs);

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
  const examList = sortByDateDesc(examsCache, "start_date");
  const activeStudents = studentsCache.filter(student => student.is_active === true);
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

  async function loadRecords() {
    recordContent.innerHTML = "<div class='empty'>正在讀取檢閱紀錄……</div>";
    refreshButton.disabled = true;

    try {
      const result = await db
        .from("score_review_records")
        .select("student_id, reviewed_at")
        .eq("exam_id", examSelect.value);

      if (result.error) throw result.error;

      const reviewMap = new Map(
        (result.data || []).map(record => [String(record.student_id), record])
      );
      const selectedClass = classSelect.value;
      const visibleStudents = activeStudents.filter(function(student) {
        return !selectedClass || student.class_name === selectedClass;
      });

      const reviewedCount = visibleStudents.filter(student =>
        reviewMap.has(String(student.id))
      ).length;
      const pendingCount = visibleStudents.length - reviewedCount;
      const completionRate = visibleStudents.length
        ? Math.round(reviewedCount / visibleStudents.length * 100)
        : 0;

      const rows = visibleStudents.map(function(student) {
        const record = reviewMap.get(String(student.id));
        const status = record
          ? "<span style='display:inline-block;padding:5px 10px;border-radius:20px;background:#e3f5e9;color:#20683d;font-weight:800'>已檢閱</span>"
          : "<span style='display:inline-block;padding:5px 10px;border-radius:20px;background:#fde8e8;color:#a32626;font-weight:800'>未檢閱</span>";
        const reviewedAt = record && record.reviewed_at
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

        return "<tr>" +
          "<td>" + escapeHtml(student.class_name || "—") + "</td>" +
          "<td>" + escapeHtml(student.student_code || "—") + "</td>" +
          "<td>" + escapeHtml(student.full_name || "—") + "</td>" +
          "<td>" + status + "</td>" +
          "<td>" + escapeHtml(reviewedAt) + "</td>" +
        "</tr>";
      }).join("");

      recordContent.innerHTML =
        "<div class='grid' style='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:8px 0 18px'>" +
          "<div class='panel' style='margin:0;padding:14px;text-align:center'><div class='muted'>已檢閱</div><div style='font-size:26px;font-weight:900;color:#27845b'>" + reviewedCount + "</div></div>" +
          "<div class='panel' style='margin:0;padding:14px;text-align:center'><div class='muted'>未檢閱</div><div style='font-size:26px;font-weight:900;color:#bd4242'>" + pendingCount + "</div></div>" +
          "<div class='panel' style='margin:0;padding:14px;text-align:center'><div class='muted'>完成率</div><div style='font-size:26px;font-weight:900;color:#315d86'>" + completionRate + "%</div></div>" +
        "</div>" +
        "<p class='muted'>統計範圍：目前在學學生，共 " + visibleStudents.length + " 人。</p>" +
        "<div class='table-wrap'><table style='min-width:620px'><thead><tr>" +
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

  examSelect.addEventListener("change", loadRecords);
  classSelect.addEventListener("change", loadRecords);
  refreshButton.addEventListener("click", loadRecords);
  await loadRecords();
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

// 家長端固定底部功能列：僅保留修改密碼與登出
function buildParentBottomNav() {
  return (
    "<nav class='parent-bottom-nav' aria-label='家長功能'>" +
      "<button class='parent-action-btn parent-password-btn parent-change-password' type='button' title='修改登入密碼' aria-label='修改登入密碼'>" +
        "<svg class='parent-action-icon' viewBox='0 0 24 24' aria-hidden='true'><path d='M7 10V7a5 5 0 0 1 10 0v3'/><rect x='4' y='10' width='16' height='11' rx='2'/><path d='M12 14v3'/></svg>" +
        "<span>修改密碼</span>" +
      "</button>" +
      "<button class='parent-action-btn parent-logout-btn parent-logout' type='button' title='登出系統' aria-label='登出系統'>" +
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
// 歷屆畢業學生模考成績管理（獨立資料表）
// ==================================================

async function renderAlumniMockScores() {
  const content = $("adminContent");
  content.innerHTML =
    "<h2 class='section-title'>歷屆模考成績</h2>" +
    "<p class='muted'>此區資料獨立保存，不會影響目前在籍學生、家長查詢或教師查詢。</p>" +
    "<div class='alumni-score-form'>" +
      "<h3 id='alumniFormTitle' style='margin:0 0 7px;color:#23466b'>新增歷屆模考成績</h3>" +
      "<form id='alumniScoreForm'>" +
        "<div class='alumni-score-basic-grid'>" +
          "<div class='field'><label for='alumniAcademicYear'>學年度（新增後會保留，可自行更改）</label><input id='alumniAcademicYear' type='text' placeholder='例如：114學年度' maxlength='30' required></div>" +
          "<div class='field'><label for='alumniStudentName'>學生姓名</label><input id='alumniStudentName' type='text' maxlength='50' required></div>" +
          "<div class='field'><label for='alumniExamScope'>新增類型（新增後會保留，可自行更改）</label><select id='alumniExamScope' required><option value=''>請選擇類型</option><option value='班內模考'>班內模考</option><option value='正式模考'>正式模考</option><option value='會考'>會考</option></select></div>" +
          "<div class='field'><label for='alumniExamRange'>考試範圍</label><input id='alumniExamRange' type='text' maxlength='100' placeholder='例如：第一次模擬考全範圍' required></div>" +
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
          "<div class='alumni-score-total'><span>五科總級分</span><strong id='alumniTotalPreview'>0 / 35</strong></div>" +
        "</div>" +
        "<div class='toolbar' style='margin-bottom:0'>" +
          "<button class='btn btn-success' id='alumniSaveButton' type='submit'>新增成績</button>" +
          "<button class='btn btn-secondary' id='alumniCancelEdit' type='button' style='display:none'>取消修改</button>" +
        "</div>" +
      "</form>" +
    "</div>" +
    "<h3 style='color:#23466b;margin:0 0 10px'>歷屆成績資料</h3>" +
    "<div class='alumni-filter-row'>" +
      "<select id='alumniYearFilter' aria-label='依學年度查詢'><option value=''>全部學年度</option></select>" +
      "<input id='alumniNameFilter' type='text' placeholder='搜尋學生姓名' aria-label='搜尋學生姓名'>" +
      "<select id='alumniTypeFilter' aria-label='依類型篩選'><option value=''>全部類型</option><option value='班內模考'>班內模考</option><option value='正式模考'>正式模考</option><option value='會考'>會考</option></select>" +
      "<select id='alumniRangeFilter' aria-label='依考試範圍篩選'><option value=''>全部考試範圍</option></select>" +
      "<select id='alumniSubjectFilter' aria-label='依考試科目篩選'><option value=''>全部考試科目</option><option value='chinese'>國文</option><option value='math'>數學</option><option value='english'>英文</option><option value='social_studies'>社會</option><option value='natural_science'>自然</option></select>" +
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
    $("alumniTotalPreview").textContent = (Number.isInteger(total) ? total : total.toFixed(1)) + (includesComposition ? " / 36.2" : " / 35");
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
    $("alumniFormTitle").textContent = "新增歷屆模考成績";
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
    $("alumniFormTitle").textContent = "修改歷屆模考成績";
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
        (!rangeQuery || String(record.exam_range || "") === rangeQuery);
    });
    if (!filtered.length) {
      $("alumniScoreTableArea").innerHTML = "<div class='empty'>" +
        (records.length ? "沒有符合查詢條件的資料。" : "目前尚無歷屆模考成績。") + "</div>";
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
        return "<td>" + escapeHtml(record[item[0]]) + "</td>";
      }).join("");
      return "<tr>" +
        "<td>" + escapeHtml(record.academic_year) + "</td>" +
        "<td>" + escapeHtml(record.student_name) + "</td>" +
        "<td>" + escapeHtml(record.exam_scope) + "</td>" +
        "<td>" + escapeHtml(record.exam_range || "") + "</td>" +
        "<td>" + (record.exam_scope === "正式模考" && record.district_gender_rank != null ? escapeHtml(record.district_gender_rank) : "—") + "</td>" +
        "<td>" + (record.exam_scope === "正式模考" && record.district_rank != null ? escapeHtml(record.district_rank) : "—") + "</td>" +
        "<td>" + (record.composition_score != null && (record.exam_scope === "正式模考" || record.exam_scope === "會考") ? escapeHtml(record.composition_score) : "—") + "</td>" +
        "<td>" + (record.exam_scope === "會考" ? escapeHtml(record.admission_school || "—") : "—") + "</td>" +
        subjectCells +
        "<td><strong>" + escapeHtml(record.total_grade) + ((record.exam_scope === "正式模考" || record.exam_scope === "會考") ? " / 36.2" : " / 35") + "</strong></td>" +
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
        "<thead><tr><th>學年度</th><th>學生姓名</th><th>模考類型</th><th>考試範圍</th><th>區（男／女）排名</th><th>區排名</th><th>作文</th><th>錄取學校</th>" + subjectHeaders + "<th>總級分</th><th>操作</th></tr></thead>" +
        "<tbody>" + rows + "</tbody></table></div>" +
      "<p class='muted'>共 " + filtered.length + " 筆資料</p>";
  }

  async function loadRecords() {
    const result = await db.from("alumni_mock_scores").select("*")
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
      const yearOrder = String(b.academic_year || "").localeCompare(
        String(a.academic_year || ""), "zh-Hant", { numeric: true }
      );
      if (yearOrder) return yearOrder;
      const typeOrder = String(a.exam_scope || "").localeCompare(
        String(b.exam_scope || ""), "zh-Hant", { numeric: true }
      );
      if (typeOrder) return typeOrder;
      const rangeOrder = compareExamRange(a.exam_range, b.exam_range);
      if (rangeOrder) return rangeOrder;
      const scoreOrder = Number(b.total_grade || 0) - Number(a.total_grade || 0);
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
    const ranges = Array.from(new Set(records.map(function (record) {
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
  $("alumniCancelEdit").addEventListener("click", resetForm);
  $("alumniExamScope").addEventListener("change", function () { updateRankFields(); updateTotalPreview(); });
  updateRankFields();

  $("alumniScoreForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const payload = {
      academic_year: $("alumniAcademicYear").value.trim(),
      student_name: $("alumniStudentName").value.trim(),
      exam_scope: $("alumniExamScope").value.trim(),
      exam_range: $("alumniExamRange").value.trim(),
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
    if (!payload.academic_year || !payload.student_name || !payload.exam_scope || !payload.exam_range) {
      alert("學年度、學生姓名、模考類型及考試範圍都必須填寫。");
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
      showMessage(wasEditing ? "歷屆模考成績已修改。" : "歷屆模考成績已新增。", "success", true);
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
    if (deleteButton) {
      const record = records.find(item => String(item.id) === String(deleteButton.dataset.alumniDelete));
      if (!record) return;
      if (!confirm("確定要刪除「" + record.student_name + "」的「" + record.exam_scope + "」成績嗎？此動作無法復原。")) return;
      deleteButton.disabled = true;
      const result = await db.from("alumni_mock_scores").delete().eq("id", record.id);
      if (result.error) {
        alert("刪除歷屆成績失敗：" + result.error.message);
        deleteButton.disabled = false;
        return;
      }
      if (editingId === String(record.id)) resetForm();
      await loadRecords();
      showMessage("歷屆模考成績已刪除。", "success", true);
    }
  });

  updateTotalPreview();
  await loadRecords();
}

// ==================================================
// 歷屆模考成績管理結束
// ==================================================

// ==================================================
// 15. 家長端畫面
// ==================================================

async function renderParentDashboard() {
  document.body.classList.add("parent-page");
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
        "<div class='parent-brand'><h1>小象文教機構 成績查詢系統</h1></div>" +
        "<div class='parent-top-actions'>" +
          (currentHasTeacher ? "<button class='tab-btn' id='switchAccountModeButton' type='button'>切換教師模式</button>" : "") +
        "</div>" +
      "</div>" +
      "<main class='dashboard'>" +
        "<div class='system-message'>目前尚未綁定學生，請聯絡管理員協助處理。</div>" +
      "</main>" +
      buildParentBottomNav();

    bindParentActionButtons();
    if ($("switchAccountModeButton")) $("switchAccountModeButton").addEventListener("click", switchAccountMode);
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

  const sortedExams = sortByDateDesc(parentExams, "start_date");
  const latestThreeExams = sortedExams.slice(0, 3);
  const reviewExamIds = latestThreeExams.map(function (exam) {
    return exam.id;
  });

  let parentReviewRecords = [];
  if (reviewExamIds.length > 0 && studentIds.length > 0) {
    const reviewResult = await db
      .from("score_review_records")
      .select("exam_id, student_id, guardian_id, reviewed_at")
      .in("exam_id", reviewExamIds)
      .in("student_id", studentIds);

    if (reviewResult.error) {
      throw new Error("讀取成績檢閱紀錄失敗：" + reviewResult.error.message);
    }

    parentReviewRecords = reviewResult.data || [];
  }

  function findReviewRecord(student, exam) {
    return parentReviewRecords.find(function (record) {
      return String(record.student_id) === String(student.id) &&
        String(record.exam_id) === String(exam.id);
    });
  }

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
    return (
      "<div class='parent-score-list'>" +
      scores.map(function (score) {
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
              : "<div class='empty'>本次考試成績將於週六 20:00 開放查詢。</div>"
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
        examCards +
      "</div>"
    );
  }).join("");

  content.innerHTML =
    "<div class='topbar'>" +
      "<div class='parent-brand'><h1>小象文教機構 成績查詢系統</h1></div>" +
      "<div class='parent-top-actions'>" +
        (currentHasTeacher ? "<button class='tab-btn' id='switchAccountModeButton' type='button'>切換教師模式</button>" : "") +
      "</div>" +
    "</div>" +
    "<main class='dashboard'>" +
      studentCards +
    "</main>" +
    "<div class='footer'>© 小象文教機構</div>" +
    buildParentBottomNav();

  bindParentActionButtons();
  if ($("switchAccountModeButton")) $("switchAccountModeButton").addEventListener("click", switchAccountMode);

  content.querySelectorAll(".parent-review-btn").forEach(function (button) {
    button.addEventListener("click", async function () {
      if (button.disabled) return;

      const studentId = button.dataset.reviewStudent;
      const examId = button.dataset.reviewExam;
      if (!studentId || !examId) return;

      button.disabled = true;
      button.textContent = "正在儲存……";

      const result = await db
        .from("score_review_records")
        .insert({
          exam_id: examId,
          student_id: studentId,
          guardian_id: currentUser.id
        });

      if (result.error && result.error.code !== "23505") {
        button.disabled = false;
        button.textContent = "我已查閱本週成績";
        alert("儲存檢閱紀錄失敗：" + result.error.message);
        return;
      }

      button.textContent = "已完成本週成績查閱";
      button.disabled = true;
    });
  });
}

// ==================================================
// 教師端：僅查詢授權範圍內的最新成績
// ==================================================

async function renderTeacherDashboard() {
  document.body.classList.remove("parent-page");
  document.body.classList.add("teacher-page");
  showLoading("正在載入教師授課資料……");

  const results = await Promise.all([
    db.from("teacher_assignments").select("*"),
    db.from("students").select("*").eq("is_active", true).order("student_code"),
    db.from("exams").select("*"),
    db.from("student_subjects").select("*").eq("is_active", true),
    db.from("scores").select("*")
  ]);

  const labels = ["授課權限", "學生資料", "考試資料", "學生修課資料", "成績資料"];
  for (let i = 0; i < results.length; i++) {
    if (results[i].error) {
      throw new Error(labels[i] + "讀取失敗：" + results[i].error.message);
    }
  }

  teacherAssignmentsCache = results[0].data || [];
  teacherStudentsCache = results[1].data || [];
  teacherExamsCache = (results[2].data || []).sort(function (a, b) {
    return String(b.end_date || b.start_date || "").localeCompare(String(a.end_date || a.start_date || ""));
  });
  teacherStudentSubjectsCache = results[3].data || [];
  teacherScoresCache = results[4].data || [];

  if (!teacherAssignmentsCache.length) {
    appRoot.innerHTML =
      "<div class='topbar'><div><h1>小象文教機構｜教師專區 僅供查詢</h1><small>教師專區</small></div>" +
        "<div class='parent-top-actions'>" +
          (currentHasTeacher ? "<button class='tab-btn' id='switchAccountModeButton' type='button'>切換家長模式</button>" : "") +
        "</div></div>" +
      "<main class='dashboard'><div class='system-message' style='display:block'>目前尚未設定授課權限，請聯絡管理員。</div></main>" +
      buildParentBottomNav();
    bindParentActionButtons();
    if ($("switchAccountModeButton")) $("switchAccountModeButton").addEventListener("click", switchAccountMode);
    return;
  }

  teacherSelectedExamId = teacherExamsCache.length ? String(teacherExamsCache[0].id) : "";
  renderTeacherResults();
}

function renderTeacherResults() {
  const examOptions = teacherExamsCache.map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");

  const selectedExam = teacherExamsCache.find(
    exam => String(exam.id) === String(teacherSelectedExamId)
  );

  const permittedClasses = Array.from(new Set(teacherAssignmentsCache.map(item => item.class_name)));
  const classOrder = ["國一班", "國二班", "國三班"];
  const visibleClasses = classOrder.filter(function (className) {
    return permittedClasses.includes(className) &&
      (!teacherSelectedClassName || teacherSelectedClassName === className);
  });

  const classSections = visibleClasses.map(function (className) {
    const permittedSubjects = Array.from(new Set(
      teacherAssignmentsCache
        .filter(item => item.class_name === className)
        .map(item => item.subject)
    ));
    const subjects = SUBJECTS.filter(subject => permittedSubjects.includes(subject));

    const subjectSections = subjects.map(function (subject) {
      const students = teacherStudentsCache.filter(function (student) {
        return student.class_name === className &&
          teacherStudentSubjectsCache.some(item =>
            String(item.student_id) === String(student.id) &&
            item.subject === subject &&
            item.is_active === true
          );
      });

      const groups = new Map();
      students.forEach(function (student) {
        const studentScores = teacherScoresCache.filter(function (item) {
          return selectedExam &&
            String(item.student_id) === String(student.id) &&
            String(item.exam_id) === String(selectedExam.id) &&
            item.subject === subject;
        });

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
          a.code.localeCompare(b.code, "zh-Hant", { numeric: true }) ||
          String(a.student.full_name).localeCompare(String(b.student.full_name), "zh-Hant")
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
    "<div class='topbar'><div><h1>小象文教機構｜教師專區 僅供查詢</h1></div>" +
      "<div class='parent-top-actions'>" +
        (currentHasTeacher ? "<button class='tab-btn' id='switchAccountModeButton' type='button'>切換家長模式</button>" : "") +
      "</div></div>" +
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
  if ($("switchAccountModeButton")) $("switchAccountModeButton").addEventListener("click", switchAccountMode);
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
    await renderTeacherDashboard();
  });
}

// ==================================================
// 16. 修改自己的登入密碼
// ==================================================

function renderTeacherFirstLoginPasswordChange() {
  appRoot.innerHTML =
    "<div class='topbar'><div><h1>小象文教機構｜教師專區 僅供查詢</h1><small>首次登入安全設定</small></div>" +
      "<button class='tab-btn' id='teacherFirstLoginLogout'>登出</button></div>" +
    "<main class='dashboard' style='max-width:560px'>" +
      "<div class='panel'>" +
        "<h2>首次登入請更改密碼</h2>" +
        "<p class='muted'>目前使用的是管理員提供的臨時密碼。為保障帳號安全，請先設定至少 8 個字元的新密碼；完成修改前，無法進入教師成績查詢。</p>" +
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
