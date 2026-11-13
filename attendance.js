/* =========================================================
   小象文教機構｜出缺席管理模組
   每週固定課表、管理員整堂登錄、家長本週摘要
   ========================================================= */
"use strict";

const ATTENDANCE_WEEKLY_SCHEDULE = [
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

let attendanceSelectedDate = "";
let attendanceSelectedSession = null;
let attendanceLoadedStudents = [];
let attendanceSavedSessionId = "";

function attendanceTaipeiDateISO(dateValue) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(dateValue || new Date());
  const values = {};
  parts.forEach(part => { values[part.type] = part.value; });
  return values.year + "-" + values.month + "-" + values.day;
}

function attendanceWeekRange(dateISO) {
  const date = new Date(dateISO + "T00:00:00Z");
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { start: start, end: date.toISOString().slice(0, 10) };
}

function attendanceEscape(value) {
  return escapeHtml(value == null ? "" : value);
}

function attendanceInjectStyles() {
  if (document.getElementById("attendanceFeatureStyles")) return;
  const style = document.createElement("style");
  style.id = "attendanceFeatureStyles";
  style.textContent = [
    ".attendance-session-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:14px 0 20px}",
    ".attendance-session-btn{display:flex;flex-direction:column;align-items:flex-start;gap:5px;width:100%;padding:14px;border:1px solid #d7e0e9;border-radius:10px;background:#fff;color:#263445;text-align:left}",
    ".attendance-session-btn strong{font-size:16px;color:#23466b}",
    ".attendance-session-btn span{font-size:14px;color:#526477}",
    ".attendance-session-btn.active{border:2px solid #315d86;background:#edf4fa}",
    ".attendance-session-btn:disabled{opacity:.6;cursor:not-allowed}",
    ".attendance-record-table{min-width:850px}",
    ".attendance-record-table th,.attendance-record-table td{padding:9px 8px;vertical-align:middle}",
    ".attendance-record-table select,.attendance-record-table input{width:100%;min-width:100px;padding:8px;border:1px solid #ccd4df;border-radius:7px;background:#fff}",
    ".attendance-record-table .attendance-late-input{min-width:76px;text-align:center}",
    ".attendance-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}",
    ".attendance-status-message{margin:12px 0;padding:11px 13px;border-radius:8px;background:#edf4fa;color:#315d86}",
    ".attendance-status-message.error{background:#fde8e8;color:#a32626}",
    ".attendance-status-message.success{background:#e3f5e9;color:#20683d}",
    ".attendance-parent-summary{display:flex;flex-direction:column;gap:5px;margin:0 0 15px;padding:10px 12px;border-radius:9px;background:#f5f7fa;font-size:14px;line-height:1.55}",
    ".attendance-parent-summary .attendance-alert{color:#bd3030;font-weight:800}",
    "@media(max-width:600px){.attendance-session-grid{grid-template-columns:1fr}.attendance-session-btn{padding:12px}.attendance-parent-summary{font-size:13px}}"
  ].join("");
  document.head.appendChild(style);
}

function renderAttendanceManagement() {
  attendanceInjectStyles();
  const content = $("adminContent");
  if (!content) return;

  if (!attendanceSelectedDate) attendanceSelectedDate = attendanceTaipeiDateISO();
  attendanceSelectedSession = null;
  attendanceLoadedStudents = [];
  attendanceSavedSessionId = "";

  const date = new Date(attendanceSelectedDate + "T00:00:00");
  const day = date.getDay();
  const dayLabels = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const sessions = ATTENDANCE_WEEKLY_SCHEDULE
    .filter(item => item.day === day)
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));

  content.innerHTML =
    "<h2 class='section-title'>出缺席管理</h2>" +
    "<div class='toolbar'>" +
      "<label for='attendanceDate'><strong>上課日期</strong></label>" +
      "<input type='date' id='attendanceDate' value='" + attendanceEscape(attendanceSelectedDate) + "'>" +
      "<span class='muted'>" + dayLabels[day] + "</span>" +
    "</div>" +
    "<div class='panel'>" +
      "<h3>當日課程</h3>" +
      (sessions.length
        ? "<div class='attendance-session-grid'>" + sessions.map((item, index) =>
            "<button type='button' class='attendance-session-btn' data-attendance-session='" + index + "'>" +
              "<strong>" + attendanceEscape(item.time) + "　" + attendanceEscape(item.className) + "</strong>" +
              "<span>" + attendanceEscape(item.subject) + "</span>" +
            "</button>"
          ).join("") + "</div>"
        : "<div class='empty'>當日沒有排定課程。</div>") +
      "<div id='attendanceSessionContent'><div class='empty'>請選擇上方課程，載入學生名單。</div></div>" +
    "</div>";

  $("attendanceDate").addEventListener("change", function () {
    attendanceSelectedDate = this.value || attendanceTaipeiDateISO();
    renderAttendanceManagement();
  });

  content.querySelectorAll("[data-attendance-session]").forEach(button => {
    button.addEventListener("click", async function () {
      const index = Number(this.dataset.attendanceSession);
      attendanceSelectedSession = sessions[index];
      content.querySelectorAll(".attendance-session-btn").forEach(item => item.classList.remove("active"));
      this.classList.add("active");
      await loadAttendanceSessionStudents();
    });
  });
}

async function loadAttendanceSessionStudents() {
  const panel = $("attendanceSessionContent");
  if (!panel || !attendanceSelectedSession) return;

  panel.innerHTML = "<div class='empty'>正在載入學生名單及既有紀錄……</div>";
  attendanceSavedSessionId = "";

  const sessionLookup = await db
    .from("attendance_sessions")
    .select("id")
    .eq("session_date", attendanceSelectedDate)
    .eq("class_name", attendanceSelectedSession.className)
    .eq("subject", attendanceSelectedSession.subject)
    .eq("start_time", attendanceSelectedSession.time)
    .maybeSingle();

  if (sessionLookup.error) {
    panel.innerHTML = "<div class='attendance-status-message error'>讀取課堂資料失敗：" +
      attendanceEscape(sessionLookup.error.message) + "</div>";
    return;
  }

  if (sessionLookup.data) attendanceSavedSessionId = sessionLookup.data.id;

  const studentsResult = await db
    .from("students")
    .select("id,student_code,full_name,class_name")
    .eq("class_name", attendanceSelectedSession.className)
    .eq("is_active", true)
    .order("student_code", { ascending: true });

  if (studentsResult.error) {
    panel.innerHTML = "<div class='attendance-status-message error'>讀取學生名單失敗：" +
      attendanceEscape(studentsResult.error.message) + "</div>";
    return;
  }

  attendanceLoadedStudents = studentsResult.data || [];
  let existingRecords = [];

  if (attendanceSavedSessionId) {
    const recordsResult = await db
      .from("attendance_records")
      .select("student_id,attendance_status,late_minutes,checkin_status")
      .eq("session_id", attendanceSavedSessionId);

    if (recordsResult.error) {
      panel.innerHTML = "<div class='attendance-status-message error'>讀取既有出缺席紀錄失敗：" +
        attendanceEscape(recordsResult.error.message) + "</div>";
      return;
    }
    existingRecords = recordsResult.data || [];
  }

  const recordsByStudent = new Map(existingRecords.map(item => [String(item.student_id), item]));
  const rows = attendanceLoadedStudents.map(student => {
    const record = recordsByStudent.get(String(student.id)) || {};
    const status = record.attendance_status === "absent" ? "leave" : (record.attendance_status || "normal");
    const checkin = record.checkin_status || "";
    const inactiveCheckin = status !== "normal" ? "disabled" : "";
    return "<tr data-attendance-row data-student-id='" + attendanceEscape(student.id) + "'>" +
      "<td>" + attendanceEscape(student.student_code) + "</td>" +
      "<td><strong>" + attendanceEscape(student.full_name) + "</strong></td>" +
      "<td><select class='attendance-status-select' aria-label='出席狀態'>" +
        "<option value='normal' " + (status === "normal" ? "selected" : "") + ">出席</option>" +
        "<option value='leave' " + (status === "leave" ? "selected" : "") + ">請假</option>" +
      "</select></td>" +
      "<td><input class='attendance-late-input' type='number' min='0' step='1' value='" +
        (status === "normal" ? attendanceEscape(record.late_minutes == null ? 0 : record.late_minutes) : "0") +
        "' aria-label='遲到分鐘' " + (status !== "normal" ? "disabled" : "") + "></td>" +
      "<td><select class='attendance-checkin-select' aria-label='打卡狀態' " + inactiveCheckin + ">" +
        "<option value=''>請選擇</option>" +
        "<option value='checked_in' " + (checkin === "checked_in" ? "selected" : "") + ">打卡</option>" +
        "<option value='not_checked_in' " + (checkin === "not_checked_in" ? "selected" : "") + ">未打卡</option>" +
      "</select></td>" +
    "</tr>";
  }).join("");

  panel.innerHTML =
    "<h3>" + attendanceEscape(attendanceSelectedDate) + "　" +
      attendanceEscape(attendanceSelectedSession.time) + "　" +
      attendanceEscape(attendanceSelectedSession.className) + "　" +
      attendanceEscape(attendanceSelectedSession.subject) + "</h3>" +
    (attendanceSavedSessionId
      ? "<p class='muted'>已找到本堂既有紀錄；儲存時會更新原紀錄，不會重複新增。</p>"
      : "<p class='muted'>這堂課尚未儲存紀錄，完成登錄後可一次儲存全班。</p>") +
    (attendanceLoadedStudents.length
      ? "<div class='table-wrap'><table class='attendance-record-table'>" +
          "<thead><tr><th>學生編號</th><th>學生姓名</th><th>出缺席</th><th>遲到分鐘</th><th>打卡狀態</th></tr></thead>" +
          "<tbody>" + rows + "</tbody></table></div>" +
        "<div class='attendance-actions'>" +
          "<button type='button' class='btn btn-success' id='attendanceSaveButton'>儲存全班紀錄</button>" +
          "<button type='button' class='btn btn-secondary' id='attendanceReloadButton'>重新載入</button>" +
        "</div>" +
        "<div id='attendanceSaveMessage' aria-live='polite'></div>"
      : "<div class='empty'>此班目前沒有啟用中的學生。</div>");

  panel.querySelectorAll("[data-attendance-row]").forEach(row => {
    const statusSelect = row.querySelector(".attendance-status-select");
    const lateInput = row.querySelector(".attendance-late-input");
    const checkinSelect = row.querySelector(".attendance-checkin-select");
    statusSelect.addEventListener("change", function () {
      const normal = this.value === "normal";
      lateInput.disabled = !normal;
      checkinSelect.disabled = !normal;
      if (!normal) {
        lateInput.value = "0";
        checkinSelect.value = "";
      } else if (!checkinSelect.value) {
        checkinSelect.value = "";
      }
    });
  });

  if ($("attendanceSaveButton")) {
    $("attendanceSaveButton").addEventListener("click", saveAttendanceSessionRecords);
    $("attendanceReloadButton").addEventListener("click", loadAttendanceSessionStudents);
  }
}

async function saveAttendanceSessionRecords() {
  const button = $("attendanceSaveButton");
  const message = $("attendanceSaveMessage");
  if (!button || !attendanceSelectedSession) return;

  const payload = [];
  const rows = document.querySelectorAll("#attendanceSessionContent [data-attendance-row]");

  for (const row of rows) {
    const status = row.querySelector(".attendance-status-select").value;
    const lateRaw = row.querySelector(".attendance-late-input").value;
    const checkin = row.querySelector(".attendance-checkin-select").value;
    const late = Number(lateRaw);

    if (status === "normal" && !["checked_in", "not_checked_in"].includes(checkin)) {
      message.className = "attendance-status-message error";
      message.textContent = "請先完成所有出席學生的打卡狀態選擇。";
      return;
    }
    if (lateRaw === "" || !Number.isInteger(late) || late < 0) {
      message.className = "attendance-status-message error";
      message.textContent = "遲到分鐘必須是大於或等於 0 的整數。";
      return;
    }

    payload.push({
      student_id: row.dataset.studentId,
      attendance_status: status,
      late_minutes: status === "normal" ? late : 0,
      checkin_status: status === "normal" ? checkin : null
    });
  }

  if (!payload.length) {
    message.className = "attendance-status-message error";
    message.textContent = "目前沒有可儲存的學生紀錄。";
    return;
  }

  button.disabled = true;
  button.textContent = "儲存中……";

  try {
    const sessionResult = await db
      .from("attendance_sessions")
      .upsert({
        session_date: attendanceSelectedDate,
        class_name: attendanceSelectedSession.className,
        subject: attendanceSelectedSession.subject,
        start_time: attendanceSelectedSession.time
      }, {
        onConflict: "session_date,class_name,subject,start_time"
      })
      .select("id")
      .single();

    if (sessionResult.error) throw sessionResult.error;

    attendanceSavedSessionId = sessionResult.data.id;
    const records = payload.map(item => ({
      session_id: attendanceSavedSessionId,
      student_id: item.student_id,
      attendance_status: item.attendance_status,
      late_minutes: item.late_minutes,
      checkin_status: item.checkin_status
    }));

    const saveResult = await db
      .from("attendance_records")
      .upsert(records, { onConflict: "session_id,student_id" });

    if (saveResult.error) throw saveResult.error;

    message.className = "attendance-status-message success";
    message.textContent = "全班 " + records.length + " 位學生的出缺席紀錄已儲存。";
    button.textContent = "儲存全班紀錄";
    button.disabled = false;
  } catch (error) {
    message.className = "attendance-status-message error";
    message.textContent = "儲存失敗：" + (error.message || String(error));
    button.textContent = "儲存全班紀錄";
    button.disabled = false;
  }
}

/* 家長端：只讀取 RLS 已授權的孩子本週出缺席資料 */
const attendanceOriginalParentDashboard = renderParentDashboard;
async function renderParentDashboard() {
  await attendanceOriginalParentDashboard();
  await renderParentAttendanceSummary();
}

async function renderParentAttendanceSummary() {
  attendanceInjectStyles();
  const cards = Array.from(document.querySelectorAll(".student-card[data-student-id]"));
  if (!cards.length) return;

  const week = attendanceWeekRange(attendanceTaipeiDateISO());
  const result = await db
    .from("attendance_records")
    .select("student_id,late_minutes,attendance_status,checkin_status,attendance_sessions!inner(session_date)")
    .gte("attendance_sessions.session_date", week.start)
    .lte("attendance_sessions.session_date", week.end);

  if (result.error) {
    console.error("讀取本週出缺席摘要失敗：", result.error.message);
    return;
  }

  const summary = new Map();
  (result.data || []).forEach(record => {
    const key = String(record.student_id);
    if (!summary.has(key)) summary.set(key, { late: 0, uncheckin: 0 });
    const item = summary.get(key);
    item.late += Number(record.late_minutes || 0);
    if (record.attendance_status === "normal" && record.checkin_status === "not_checked_in") {
      item.uncheckin += 1;
    }
  });

  cards.forEach(card => {
    const studentId = String(card.dataset.studentId);
    const item = summary.get(studentId) || { late: 0, uncheckin: 0 };
    const box = document.createElement("div");
    box.className = "attendance-parent-summary";

    const lateLine = document.createElement("div");
    lateLine.textContent = item.late > 0
      ? "本週遲到共計 " + item.late + " 分鐘"
      : "本週無遲到紀錄";
    if (item.late > 0) lateLine.className = "attendance-alert";
    box.appendChild(lateLine);

    if (item.uncheckin > 0) {
      const checkinLine = document.createElement("div");
      checkinLine.className = "attendance-alert";
      checkinLine.textContent = "本週未打卡次數 " + item.uncheckin + " 次";
      box.appendChild(checkinLine);
    }

    const heading = card.querySelector(".student-heading");
    if (heading) heading.insertAdjacentElement("afterend", box);
  });
}
