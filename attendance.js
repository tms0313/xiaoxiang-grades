/* =========================================================
   小象文教機構｜出席管理介面預覽
   管理員內部規劃版：僅使用示意資料，不連接、不讀取、不寫入資料庫。
   ========================================================= */
"use strict";

const ATTENDANCE_PREVIEW_SCHEDULE = [
  { day: 1, time: "18:00", className: "國二班", subject: "英文" },
  { day: 1, time: "19:00", className: "國一班", subject: "數學" },
  { day: 2, time: "19:00", className: "國一班", subject: "英文" },
  { day: 3, time: "19:00", className: "國一班", subject: "數學" },
  { day: 4, time: "17:30", className: "國二班", subject: "國文" },
  { day: 4, time: "19:00", className: "國一班", subject: "國文" },
  { day: 4, time: "19:00", className: "國三班", subject: "國文" },
  { day: 5, time: "17:00", className: "國二班", subject: "數學" },
  { day: 5, time: "19:00", className: "國三班", subject: "英文" },
  { day: 6, time: "09:00", className: "國一班", subject: "自然" },
  { day: 6, time: "10:00", className: "國三班", subject: "數學" },
  { day: 6, time: "10:30", className: "國二班", subject: "自然" },
  { day: 6, time: "13:30", className: "國三班", subject: "自然" }
];

let attendancePreviewDate = "";
let attendancePreviewSessionIndex = -1;
let attendancePreviewRecords = [];

function attendancePreviewEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function attendancePreviewToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = {};
  parts.forEach(part => { values[part.type] = part.value; });
  return values.year + "-" + values.month + "-" + values.day;
}

function attendancePreviewInjectStyles() {
  if (document.getElementById("attendancePreviewStyles")) return;
  const style = document.createElement("style");
  style.id = "attendancePreviewStyles";
  style.textContent = `
    .att-preview-note{padding:12px 14px;border:1px solid #ead9b7;border-radius:9px;background:#fff9ed;color:#76551d;font-size:13px;line-height:1.65;margin:12px 0 18px}
    .att-preview-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:14px 0}
    .att-preview-toolbar input{width:auto;min-width:160px;height:42px}
    .att-preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin:12px 0 20px}
    .att-preview-session{display:flex;flex-direction:column;align-items:flex-start;gap:5px;width:100%;min-height:76px;margin:0;padding:13px;border:1px solid #d7e0e9;border-radius:10px;background:#fff;color:#263445;text-align:left}
    .att-preview-session strong{color:#23466b;font-size:15px}
    .att-preview-session span{font-size:13px;color:#64748b}
    .att-preview-session.active{border:2px solid #315d86;background:#edf4fa}
    .att-preview-table{width:100%;min-width:650px;border-collapse:collapse}
    .att-preview-table th,.att-preview-table td{padding:10px 8px;border-bottom:1px solid #e6ebf1;text-align:left;vertical-align:middle}
    .att-preview-table select,.att-preview-table input{width:100%;min-width:100px;height:40px;padding:6px 9px;border:1px solid #ccd4df;border-radius:7px;background:#fff}
    .att-preview-table .att-late{min-width:76px;text-align:center}
    .att-preview-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .att-preview-actions button{width:auto;min-height:40px;margin:0;padding:9px 16px}
    .att-preview-summary{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
    .att-preview-stat{padding:10px 13px;border-radius:8px;background:#f3f6fa;font-size:13px}
    .att-preview-stat strong{display:block;font-size:19px;color:#23466b}
    .att-preview-muted{font-size:13px;color:#788596}
    @media(max-width:600px){.att-preview-grid{grid-template-columns:1fr}.att-preview-toolbar input{width:100%}}
  `;
  document.head.appendChild(style);
}

function renderAttendanceManagement() {
  attendancePreviewInjectStyles();
  const content = document.getElementById("adminContent");
  if (!content) return;
  if (!attendancePreviewDate) attendancePreviewDate = attendancePreviewToday();

  const date = new Date(attendancePreviewDate + "T00:00:00");
  const day = date.getDay();
  const dayLabels = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const sessions = ATTENDANCE_PREVIEW_SCHEDULE
    .map((item, index) => ({ ...item, index }))
    .filter(item => item.day === day)
    .sort((a, b) => a.time.localeCompare(b.time));

  content.innerHTML =
    "<h2 class='section-title'>出席管理</h2>" +
    "<div class='att-preview-note'><strong>管理員介面預覽</strong><br>目前為功能規劃階段，以下課程與學生均為介面示意。尚未連接出缺席資料庫，操作內容只暫存在目前頁面，不會儲存或影響正式資料。</div>" +
    "<div class='att-preview-toolbar'><label for='attendancePreviewDate'><strong>上課日期</strong></label>" +
      "<input type='date' id='attendancePreviewDate' value='" + attendancePreviewEscape(attendancePreviewDate) + "'>" +
      "<span class='att-preview-muted'>" + dayLabels[day] + "｜依每週固定課表顯示</span></div>" +
    "<div class='panel'><h3>當日課程</h3>" +
      (sessions.length
        ? "<div class='att-preview-grid'>" + sessions.map(item =>
            "<button type='button' class='att-preview-session " + (attendancePreviewSessionIndex === item.index ? "active" : "") + "' data-att-preview-session='" + item.index + "'>" +
              "<strong>" + attendancePreviewEscape(item.time) + "　" + attendancePreviewEscape(item.className) + "</strong>" +
              "<span>" + attendancePreviewEscape(item.subject) + "</span></button>"
          ).join("") + "</div>"
        : "<div class='empty'>這一天目前沒有排定課程。可切換日期查看其他課程。</div>") +
      "<div id='attendancePreviewDetail'><div class='empty'>請選擇上方課程，預覽管理員登錄畫面。</div></div>" +
    "</div>" +
    "<div class='panel' style='margin-top:16px'><h3>預計提供的管理功能</h3>" +
      "<ul><li>依日期及固定課表選擇上課場次</li><li>自動帶入該班學生名單</li><li>逐位登錄出席或請假</li><li>登錄遲到分鐘數及打卡狀態</li><li>整班儲存、重新載入及修正紀錄</li><li>依日期查閱過去場次</li></ul>" +
      "<p class='att-preview-muted'>家長端每週彙總及正式資料庫串接，待管理員介面確認、資料庫整理完成後再進行。</p></div>";

  document.getElementById("attendancePreviewDate").addEventListener("change", function () {
    attendancePreviewDate = this.value || attendancePreviewToday();
    attendancePreviewSessionIndex = -1;
    attendancePreviewRecords = [];
    renderAttendanceManagement();
  });

  content.querySelectorAll("[data-att-preview-session]").forEach(button => {
    button.addEventListener("click", function () {
      attendancePreviewSessionIndex = Number(this.dataset.attPreviewSession);
      attendancePreviewRecords = [
        { name: "示意學生 A", status: "normal", late: 0, checkin: "checked_in" },
        { name: "示意學生 B", status: "normal", late: 10, checkin: "not_checked_in" },
        { name: "示意學生 C", status: "leave", late: 0, checkin: "" }
      ];
      renderAttendanceManagement();
      renderAttendancePreviewDetail();
    });
  });

  if (attendancePreviewSessionIndex >= 0) renderAttendancePreviewDetail();
}

function renderAttendancePreviewDetail() {
  const panel = document.getElementById("attendancePreviewDetail");
  if (!panel) return;
  const session = ATTENDANCE_PREVIEW_SCHEDULE[attendancePreviewSessionIndex];
  if (!session) return;

  panel.innerHTML =
    "<h3>" + attendancePreviewEscape(attendancePreviewDate) + "　" +
      attendancePreviewEscape(session.time) + "　" + attendancePreviewEscape(session.className) +
      "　" + attendancePreviewEscape(session.subject) + "</h3>" +
    "<p class='att-preview-muted'>以下為示意名單，用來確認登錄欄位與操作流程。</p>" +
    "<div class='att-preview-summary' id='attendancePreviewStats'></div>" +
    "<div class='table-wrap'><table class='att-preview-table'><thead><tr><th>學生</th><th>出缺席</th><th>遲到分鐘</th><th>打卡狀態</th></tr></thead><tbody>" +
    attendancePreviewRecords.map((record, index) =>
      "<tr data-att-preview-row='" + index + "'><td><strong>" + attendancePreviewEscape(record.name) + "</strong></td>" +
      "<td><select class='att-status'><option value='normal' " + (record.status === "normal" ? "selected" : "") + ">出席</option><option value='leave' " + (record.status === "leave" ? "selected" : "") + ">請假</option></select></td>" +
      "<td><input class='att-late' type='number' min='0' step='1' value='" + record.late + "' " + (record.status !== "normal" ? "disabled" : "") + "></td>" +
      "<td><select class='att-checkin' " + (record.status !== "normal" ? "disabled" : "") + "><option value='checked_in' " + (record.checkin === "checked_in" ? "selected" : "") + ">已打卡</option><option value='not_checked_in' " + (record.checkin === "not_checked_in" ? "selected" : "") + ">未打卡</option></select></td></tr>"
    ).join("") +
    "</tbody></table></div>" +
    "<div class='att-preview-actions'><button type='button' class='btn btn-success' id='attendancePreviewSave'>預覽整班儲存</button><button type='button' class='btn btn-secondary' id='attendancePreviewReset'>重設示意資料</button></div>" +
    "<p class='att-preview-muted' id='attendancePreviewMessage' aria-live='polite'>提醒：目前僅為畫面操作示範，按下儲存不會寫入資料庫。</p>";

  panel.querySelectorAll("[data-att-preview-row]").forEach(row => {
    const status = row.querySelector(".att-status");
    const late = row.querySelector(".att-late");
    const checkin = row.querySelector(".att-checkin");
    status.addEventListener("change", function () {
      const isPresent = this.value === "normal";
      late.disabled = !isPresent;
      checkin.disabled = !isPresent;
      if (!isPresent) { late.value = "0"; }
    });
  });

  document.getElementById("attendancePreviewSave").addEventListener("click", function () {
    const rows = panel.querySelectorAll("[data-att-preview-row]");
    const invalid = Array.from(rows).some(row => {
      const status = row.querySelector(".att-status").value;
      const late = row.querySelector(".att-late").value;
      return status === "normal" && (late === "" || !Number.isInteger(Number(late)) || Number(late) < 0);
    });
    const message = document.getElementById("attendancePreviewMessage");
    if (invalid) {
      message.textContent = "遲到分鐘必須是大於或等於 0 的整數。";
      return;
    }
    message.textContent = "預覽完成：整班登錄欄位與資料檢查流程可供確認。尚未儲存任何正式資料。";
  });

  document.getElementById("attendancePreviewReset").addEventListener("click", function () {
    attendancePreviewRecords = [
      { name: "示意學生 A", status: "normal", late: 0, checkin: "checked_in" },
      { name: "示意學生 B", status: "normal", late: 10, checkin: "not_checked_in" },
      { name: "示意學生 C", status: "leave", late: 0, checkin: "" }
    ];
    renderAttendancePreviewDetail();
  });

  updateAttendancePreviewStats();
}

function updateAttendancePreviewStats() {
  const stats = document.getElementById("attendancePreviewStats");
  const panel = document.getElementById("attendancePreviewDetail");
  if (!stats || !panel) return;
  const rows = Array.from(panel.querySelectorAll("[data-att-preview-row]"));
  let present = 0, leave = 0, late = 0, uncheckin = 0;
  rows.forEach(row => {
    const status = row.querySelector(".att-status").value;
    if (status === "leave") { leave++; return; }
    present++;
    late += Math.max(0, Number(row.querySelector(".att-late").value || 0));
    if (row.querySelector(".att-checkin").value === "not_checked_in") uncheckin++;
  });
  stats.innerHTML =
    "<div class='att-preview-stat'><strong>" + present + "</strong>出席</div>" +
    "<div class='att-preview-stat'><strong>" + leave + "</strong>請假</div>" +
    "<div class='att-preview-stat'><strong>" + late + " 分鐘</strong>遲到合計</div>" +
    "<div class='att-preview-stat'><strong>" + uncheckin + " 次</strong>未打卡";
  panel.querySelectorAll("select,input").forEach(input => {
    input.addEventListener("change", updateAttendancePreviewStats);
  });
}
