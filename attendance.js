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
let attendanceLoadRequestId = 0;
let attendanceCalendarMonth = "";
let attendanceCalendarMarkedDates = new Set();
let attendanceCalendarRequestId = 0;

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
    ".attendance-calendar{width:100%;max-width:280px;margin:6px 0 10px;padding:8px;border:1px solid #d7e0e9;border-radius:9px;background:#fff}",
    ".attendance-calendar-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}",
    ".attendance-calendar-heading strong{color:#23466b;font-size:13px}",
    ".attendance-calendar-heading button{width:26px;height:25px;min-height:25px;margin:0;padding:0;border:0;border-radius:5px;background:#edf1f5;color:#315d86;font-size:17px}",
    ".attendance-calendar-weekdays,.attendance-calendar-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;text-align:center}",
    ".attendance-calendar-weekdays{margin-bottom:3px;color:#64748b;font-size:11px;font-weight:700}",
    ".attendance-calendar-weekdays span{padding:2px 0}",
    ".attendance-calendar-day{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:100%;height:29px;min-height:29px;margin:0;padding:1px;border:1px solid transparent;border-radius:5px;background:#fff;color:#263445;font-size:12px}",
    ".attendance-calendar-day:hover{background:#edf3f9}",
    ".attendance-calendar-day.selected{border-color:#315d86;background:#315d86;color:#fff}",
    ".attendance-calendar-day.has-records:after{content:'';display:block;width:6px;height:6px;border-radius:50%;background:#dc2626}",
    ".attendance-calendar-day.selected.has-records:after{background:#dc2626}",
    ".attendance-calendar-empty{height:29px}",
    ".attendance-calendar-legend{margin:5px 0 0;color:#64748b;font-size:11px}",
    ".attendance-calendar-error{margin:6px 0;color:#b32626;font-size:12px}",
    ".attendance-session-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:14px 0 20px}",
    ".attendance-session-btn{display:flex;flex-direction:column;align-items:flex-start;gap:5px;width:100%;padding:14px;border:1px solid #d7e0e9;border-radius:10px;background:#fff;color:#263445;text-align:left}",
    ".attendance-session-btn strong{font-size:16px;color:#23466b}",
    ".attendance-session-btn span{font-size:14px;color:#526477}",
    ".attendance-session-btn:hover,.attendance-session-btn:focus-visible,.attendance-session-btn.active{border:2px solid #315d86;background:#315d86;color:#fff}",
    ".attendance-session-btn:hover strong,.attendance-session-btn:hover span,.attendance-session-btn:focus-visible strong,.attendance-session-btn:focus-visible span,.attendance-session-btn.active strong,.attendance-session-btn.active span{color:#fff}",
    ".attendance-session-btn:disabled{opacity:.6;cursor:not-allowed}",
    ".attendance-record-table{min-width:0;width:100%;table-layout:auto}",
    ".attendance-record-table th:nth-child(4),.attendance-record-table td:nth-child(4){width:90px;min-width:90px;max-width:90px}",
    ".attendance-record-table .attendance-late-input{width:58px!important;min-width:58px!important;max-width:58px!important;padding:3px!important}",
    ".attendance-record-table th:last-child,.attendance-record-table td:last-child{width:76px;min-width:76px;max-width:76px;white-space:nowrap;text-align:center}",
    ".attendance-record-table .attendance-row-actions{display:table-cell;white-space:nowrap;overflow:visible}",
    ".attendance-record-table .attendance-delete-one{position:relative;z-index:1;visibility:visible;opacity:1}",
    ".attendance-record-table .attendance-row-actions{white-space:nowrap;text-align:center}",
    ".attendance-record-table .attendance-delete-one{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:32px;min-height:32px;margin:0;padding:0 10px;border:1px solid #d7a0a0;border-radius:7px;background:#fff;color:#b32626;font-size:14px;font-weight:800;line-height:30px;white-space:nowrap;cursor:pointer}",
    ".attendance-record-table .attendance-delete-one:disabled,.attendance-clear-session:disabled{opacity:.55;cursor:not-allowed}",
    ".attendance-clear-session{border:1px solid #d7a0a0!important;background:#fff!important;color:#b32626!important}",
    ".attendance-record-table th,.attendance-record-table td{padding:5px 8px!important;line-height:1.3!important;vertical-align:middle}",
    ".attendance-record-table select,.attendance-record-table input{width:100%;min-width:100px;height:32px;min-height:32px;box-sizing:border-box;padding:4px 6px;border:1px solid #ccd4df;border-radius:7px;background:#fff;font-size:16px;line-height:1.3}",
    ".attendance-record-table .attendance-status-select{border-radius:8px!important;overflow:hidden}",
    ".attendance-record-table .attendance-late-input{min-width:76px;height:32px;min-height:32px;box-sizing:border-box;text-align:center;font-size:16px;}",
    ".attendance-record-table .attendance-late-input.has-late-value{color:#d32626;font-weight:800}",
    ".attendance-record-table .attendance-checkin-select.is-unchecked{color:#d32626;font-weight:800}",
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

function attendanceCalendarMonthRange(monthISO) {
  const parts = monthISO.split("-").map(Number);
  const year = parts[0], month = parts[1];
  const first = year + "-" + String(month).padStart(2, "0") + "-01";
  const lastDay = new Date(year, month, 0).getDate();
  const last = year + "-" + String(month).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");
  return { year: year, month: month, first: first, last: last, lastDay: lastDay };
}

function renderAttendanceCalendar(errorText) {
  const calendar = $("attendanceCalendar");
  if (!calendar) return;
  const range = attendanceCalendarMonthRange(attendanceCalendarMonth);
  const firstWeekday = new Date(range.year, range.month - 1, 1).getDay();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  let cells = "";
  for (let i = 0; i < firstWeekday; i++) cells += "<span class='attendance-calendar-empty'></span>";
  for (let day = 1; day <= range.lastDay; day++) {
    const dateISO = range.year + "-" + String(range.month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    const selected = dateISO === attendanceSelectedDate ? " selected" : "";
    const marked = attendanceCalendarMarkedDates.has(dateISO) ? " has-records" : "";
    cells += "<button type='button' class='attendance-calendar-day" + selected + marked +
      "' data-attendance-calendar-date='" + dateISO + "' aria-label='" + dateISO +
      (marked ? "，已有出缺席紀錄" : "") + "'><span>" + day + "</span></button>";
  }
  calendar.innerHTML =
    "<div class='attendance-calendar-heading'>" +
      "<button type='button' data-attendance-calendar-month='-1' aria-label='上一個月'>‹</button>" +
      "<strong>" + range.year + " 年 " + range.month + " 月</strong>" +
      "<button type='button' data-attendance-calendar-month='1' aria-label='下一個月'>›</button>" +
    "</div>" +
    "<div class='attendance-calendar-weekdays'>" + weekdays.map(day => "<span>" + day + "</span>").join("") + "</div>" +
    "<div class='attendance-calendar-days'>" + cells + "</div>" +
    "<p class='attendance-calendar-legend'>紅點表示當日已有出缺席紀錄</p>" +
    (errorText ? "<p class='attendance-calendar-error'>" + attendanceEscape(errorText) + "</p>" : "");

  calendar.querySelectorAll("[data-attendance-calendar-date]").forEach(button => {
    button.addEventListener("click", function () {
      attendanceSelectedDate = this.dataset.attendanceCalendarDate;
      const dateInput = $("attendanceDate");
      if (dateInput) dateInput.value = attendanceSelectedDate;
      renderAttendanceManagement();
    });
  });
  calendar.querySelectorAll("[data-attendance-calendar-month]").forEach(button => {
    button.addEventListener("click", function () {
      const next = new Date(range.year, range.month - 1 + Number(this.dataset.attendanceCalendarMonth), 1);
      attendanceCalendarMonth = next.getFullYear() + "-" + String(next.getMonth() + 1).padStart(2, "0");
      attendanceCalendarMarkedDates = new Set();
      renderAttendanceCalendar();
      loadAttendanceCalendarMarks();
    });
  });
}

async function loadAttendanceCalendarMarks() {
  const requestId = ++attendanceCalendarRequestId;
  const range = attendanceCalendarMonthRange(attendanceCalendarMonth);
  const sessionsResult = await db.from("attendance_sessions")
    .select("id,session_date")
    .gte("session_date", range.first)
    .lte("session_date", range.last);
  if (requestId !== attendanceCalendarRequestId) return;
  if (sessionsResult.error) {
    renderAttendanceCalendar("日期紀錄讀取失敗：" + sessionsResult.error.message);
    return;
  }
  const sessions = sessionsResult.data || [];
  if (!sessions.length) {
    attendanceCalendarMarkedDates = new Set();
    renderAttendanceCalendar();
    return;
  }
  const recordsResult = await db.from("attendance_records")
    .select("session_id")
    .in("session_id", sessions.map(item => item.id));
  if (requestId !== attendanceCalendarRequestId) return;
  if (recordsResult.error) {
    renderAttendanceCalendar("日期紀錄讀取失敗：" + recordsResult.error.message);
    return;
  }
  const recordedSessionIds = new Set((recordsResult.data || []).map(item => String(item.session_id)));
  attendanceCalendarMarkedDates = new Set(
    sessions.filter(item => recordedSessionIds.has(String(item.id))).map(item => item.session_date)
  );
  renderAttendanceCalendar();
}

function renderAttendanceManagement() {
  attendanceInjectStyles();
  const content = $("adminContent");
  if (!content) return;

  // 切換日期或重新繪製管理頁時，立即作廢尚未完成的舊載入請求。
  attendanceLoadRequestId++;

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
    
    "<div id='attendanceCalendar' class='attendance-calendar' aria-label='出缺席登錄日期日曆'></div>" +
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

  if (!attendanceCalendarMonth) attendanceCalendarMonth = attendanceSelectedDate.slice(0, 7);
  renderAttendanceCalendar();
  loadAttendanceCalendarMarks();


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

  // 避免快速切換課堂時，較慢的舊請求覆蓋最新畫面。
  const requestId = ++attendanceLoadRequestId;
  const selectedDate = attendanceSelectedDate;
  const selectedSession = { ...attendanceSelectedSession };

  panel.innerHTML = "<div class='empty'>正在載入學生名單及既有紀錄……</div>";
  attendanceSavedSessionId = "";

  // 課堂與學生資料互不依賴，平行讀取以縮短等待時間。
  const [sessionLookup, studentsResult] = await Promise.all([
    db
      .from("attendance_sessions")
      .select("id")
      .eq("session_date", selectedDate)
      .eq("class_name", selectedSession.className)
      .eq("subject", selectedSession.subject)
      .eq("start_time", selectedSession.time)
      .maybeSingle(),
    db
      .from("students")
      .select("id,student_code,full_name,class_name")
      .eq("class_name", selectedSession.className)
      .eq("is_active", true)
      .order("student_code", { ascending: true })
  ]);

  if (requestId !== attendanceLoadRequestId) return;

  if (sessionLookup.error) {
    panel.innerHTML = "<div class='attendance-status-message error'>讀取課堂資料失敗：" +
      attendanceEscape(sessionLookup.error.message) + "</div>";
    return;
  }
  if (studentsResult.error) {
    panel.innerHTML = "<div class='attendance-status-message error'>讀取學生名單失敗：" +
      attendanceEscape(studentsResult.error.message) + "</div>";
    return;
  }

  const savedSessionId = sessionLookup.data ? sessionLookup.data.id : "";
  attendanceSavedSessionId = savedSessionId;
  const classStudents = studentsResult.data || [];

  // 修課名單與既有紀錄互不依賴，第二階段也平行讀取。
  const followUpQueries = [];
  if (classStudents.length) {
    followUpQueries.push(
      db
        .from("student_subjects")
        .select("student_id")
        .in("student_id", classStudents.map(student => student.id))
        .eq("subject", selectedSession.subject)
        .eq("is_active", true)
    );
  }
  if (savedSessionId) {
    followUpQueries.push(
      db
        .from("attendance_records")
        .select("id,student_id,attendance_status,late_minutes,checkin_status")
        .eq("session_id", savedSessionId)
    );
  }

  const followUpResults = await Promise.all(followUpQueries);
  if (requestId !== attendanceLoadRequestId) return;

  let resultIndex = 0;
  let enrolledStudentIds = new Set();
  if (classStudents.length) {
    const subjectEnrollmentsResult = followUpResults[resultIndex++];
    if (subjectEnrollmentsResult.error) {
      panel.innerHTML = "<div class='attendance-status-message error'>讀取學生修課科目失敗：" +
        attendanceEscape(subjectEnrollmentsResult.error.message) + "</div>";
      return;
    }
    enrolledStudentIds = new Set(
      (subjectEnrollmentsResult.data || []).map(item => String(item.student_id))
    );
  }

  attendanceLoadedStudents = classStudents.filter(student =>
    enrolledStudentIds.has(String(student.id))
  );

  let existingRecords = [];
  if (savedSessionId) {
    const recordsResult = followUpResults[resultIndex];
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
      "<td class='attendance-row-actions'>" + (record.id ? "<button type='button' class='attendance-delete-one' data-attendance-delete-student='" + attendanceEscape(student.id) + "'>刪除</button>" : "<span class='muted'>—</span>") + "</td>" +
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
          "<thead><tr><th>學生編號</th><th>學生姓名</th><th>出缺席</th><th>遲到分鐘</th><th>打卡狀態</th><th>操作</th></tr></thead>" +
          "<tbody>" + rows + "</tbody></table></div>" +
        "<div class='attendance-actions'>" +
          "<button type='button' class='btn btn-success' id='attendanceSaveButton' " + (attendanceSaveInProgress ? "disabled" : "") + ">" + (attendanceSaveInProgress ? "前一堂儲存中……" : "儲存全班紀錄") + "</button>" +
          "<button type='button' class='btn btn-secondary' id='attendanceReloadButton' " + (attendanceSaveInProgress ? "disabled" : "") + ">重新載入</button>" +
          (attendanceSavedSessionId && existingRecords.length ? "<button type='button' class='btn attendance-clear-session' id='attendanceClearSessionButton' " + (attendanceSaveInProgress ? "disabled" : "") + ">清除整堂紀錄</button>" : "") +
        "</div>" +
        "<div id='attendanceSaveMessage' aria-live='polite'></div>"
      : "<div class='empty'>此班目前沒有啟用中的學生。</div>");

  panel.querySelectorAll("[data-attendance-row]").forEach(row => {
    const statusSelect = row.querySelector(".attendance-status-select");
    const lateInput = row.querySelector(".attendance-late-input");
    const checkinSelect = row.querySelector(".attendance-checkin-select");
    const updateCheckinAppearance = function () {
      checkinSelect.classList.toggle("is-unchecked", checkinSelect.value === "not_checked_in");
    };
    const updateLateAppearance = function () {
      lateInput.classList.toggle("has-late-value", lateInput.value !== "" && Number(lateInput.value) > 0);
    };
    updateLateAppearance();
    updateCheckinAppearance();
    lateInput.addEventListener("input", updateLateAppearance);
    checkinSelect.addEventListener("change", updateCheckinAppearance);
    statusSelect.addEventListener("change", function () {
      const normal = this.value === "normal";
      lateInput.disabled = !normal;
      checkinSelect.disabled = !normal;
      if (!normal) {
        lateInput.value = "0";
        updateLateAppearance();
        checkinSelect.value = "";
        updateCheckinAppearance();
      } else if (!checkinSelect.value) {
        checkinSelect.value = "";
      }
    });
  });

  if ($("attendanceSaveButton")) {
    $("attendanceSaveButton").addEventListener("click", saveAttendanceSessionRecords);
    $("attendanceReloadButton").addEventListener("click", loadAttendanceSessionStudents);
    panel.querySelectorAll("[data-attendance-delete-student]").forEach(button => {
      button.addEventListener("click", function () {
        deleteAttendanceStudentRecord(this.dataset.attendanceDeleteStudent, this);
      });
    });
    if ($("attendanceClearSessionButton")) {
      $("attendanceClearSessionButton").addEventListener("click", clearAttendanceSessionRecords);
    }
  }
}

let attendanceSaveInProgress = false;

async function saveAttendanceSessionRecords() {
  const button = $("attendanceSaveButton");
  const message = $("attendanceSaveMessage");
  if (!button || !message || !attendanceSelectedSession || attendanceSaveInProgress) return;

  // 儲存期間固定使用本次選取的課堂快照，避免切換日期／課堂後寫入錯誤資料。
  const selectedDate = attendanceSelectedDate;
  const selectedSession = { ...attendanceSelectedSession };
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

  attendanceSaveInProgress = true;
  button.disabled = true;
  button.textContent = "儲存中……";

  try {
    const sessionResult = await db
      .from("attendance_sessions")
      .upsert({
        session_date: selectedDate,
        class_name: selectedSession.className,
        subject: selectedSession.subject,
        start_time: selectedSession.time
      }, {
        onConflict: "session_date,class_name,subject,start_time"
      })
      .select("id")
      .single();

    if (sessionResult.error) throw sessionResult.error;

    const savedSessionId = sessionResult.data.id;
    const records = payload.map(item => ({
      session_id: savedSessionId,
      student_id: item.student_id,
      attendance_status: item.attendance_status,
      late_minutes: item.late_minutes,
      checkin_status: item.checkin_status,
    }));

    const saveResult = await db
      .from("attendance_records")
      .upsert(records, { onConflict: "session_id,student_id" });

    if (saveResult.error) throw saveResult.error;

    // 只有仍停留在原課堂時，才更新目前畫面使用的既有課堂 ID。
    if (
      attendanceSelectedDate === selectedDate &&
      attendanceSelectedSession &&
      attendanceSelectedSession.className === selectedSession.className &&
      attendanceSelectedSession.subject === selectedSession.subject &&
      attendanceSelectedSession.time === selectedSession.time
    ) {
      attendanceSavedSessionId = savedSessionId;
    }

    message.className = "attendance-status-message success";
    message.textContent = "全班 " + records.length + " 位學生的出缺席紀錄已儲存。";
    if (selectedDate.slice(0, 7) === attendanceCalendarMonth) loadAttendanceCalendarMarks();
  } catch (error) {
    message.className = "attendance-status-message error";
    message.textContent = "儲存失敗：" + (error.message || String(error));
  } finally {
    attendanceSaveInProgress = false;
    // 舊畫面可能已因切換日期／課堂而卸載；只更新仍在畫面上的按鈕。
    const currentButton = $("attendanceSaveButton");
    if (currentButton) {
      currentButton.textContent = "儲存全班紀錄";
      currentButton.disabled = false;
    }
    const currentReloadButton = $("attendanceReloadButton");
    if (currentReloadButton) currentReloadButton.disabled = false;
  }
}


async function deleteAttendanceStudentRecord(studentId, button) {
  if (!attendanceSavedSessionId || attendanceSaveInProgress) return;
  const student = attendanceLoadedStudents.find(item => String(item.id) === String(studentId));
  const studentName = student ? student.full_name : "這位學生";
  if (!confirm("確定刪除「" + studentName + "」本堂出缺席紀錄嗎？此操作無法復原。")) return;

  const sessionId = attendanceSavedSessionId;
  const message = $("attendanceSaveMessage");
  if (button) button.disabled = true;
  try {
    const result = await db.from("attendance_records").delete()
      .eq("session_id", sessionId).eq("student_id", studentId);
    if (result.error) throw result.error;
    await loadAttendanceSessionStudents();
    if (attendanceSelectedDate.slice(0, 7) === attendanceCalendarMonth) loadAttendanceCalendarMarks();
    const currentMessage = $("attendanceSaveMessage");
    if (currentMessage) {
      currentMessage.className = "attendance-status-message success";
      currentMessage.textContent = studentName + " 本堂出缺席紀錄已刪除。";
    }
  } catch (error) {
    if (button) button.disabled = false;
    if (message) {
      message.className = "attendance-status-message error";
      message.textContent = "刪除失敗：" + (error.message || String(error));
    }
  }
}

async function clearAttendanceSessionRecords() {
  if (!attendanceSavedSessionId || attendanceSaveInProgress) return;
  const sessionId = attendanceSavedSessionId;
  const sessionLabel = attendanceSelectedDate + " " + attendanceSelectedSession.time +
    " " + attendanceSelectedSession.className + " " + attendanceSelectedSession.subject;
  if (!confirm("確定清除「" + sessionLabel + "」整堂出缺席紀錄嗎？\\n本堂所有學生紀錄都會刪除，但不影響學生資料及其他課堂紀錄。此操作無法復原。")) return;

  const button = $("attendanceClearSessionButton");
  const message = $("attendanceSaveMessage");
  if (button) {
    button.disabled = true;
    button.textContent = "清除中……";
  }
  try {
    // 外鍵 ON DELETE CASCADE 會一併清除本堂 attendance_records。
    const result = await db.from("attendance_sessions").delete().eq("id", sessionId);
    if (result.error) throw result.error;
    attendanceSavedSessionId = "";
    await loadAttendanceSessionStudents();
    if (attendanceSelectedDate.slice(0, 7) === attendanceCalendarMonth) loadAttendanceCalendarMarks();
    const currentMessage = $("attendanceSaveMessage");
    if (currentMessage) {
      currentMessage.className = "attendance-status-message success";
      currentMessage.textContent = "本堂所有出缺席紀錄已清除。";
    }
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "清除整堂紀錄";
    }
    if (message) {
      message.className = "attendance-status-message error";
      message.textContent = "清除失敗：" + (error.message || String(error));
    }
  }
}
