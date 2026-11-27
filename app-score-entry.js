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
  const students = (scoreEntryStudentsByClassSubject.get(JSON.stringify([className, subject])) || []).slice().sort(function (a, b) {
    // 學生編號以數字感知排序，確保 G2 排在 G10 前；編號相同時再依姓名排序。
    const codeCompare = String(a.student_code || "").localeCompare(String(b.student_code || ""), "zh-Hant", { numeric: true, sensitivity: "base" });
    return codeCompare || String(a.full_name || "").localeCompare(String(b.full_name || ""), "zh-Hant");
  });
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
      "<td><input class='bulk-scope-display' data-bulk-scope type='text' value='" + escapeHtml(scope) + "' readonly aria-label='考試範圍'></td>" +
      fields + "<td><button class='btn btn-small' type='button' data-save-bulk-row>單筆儲存</button></td></tr>";
  }).join("");
  root.innerHTML = "<div class='muted' style='margin-bottom:10px'>共 " + students.length + " 位學生；只會儲存有填寫資料的學生。</div>" +
    "<div class='table-wrap'><table class='bulk-score-entry-table weekly-score-layout-table'><thead><tr><th>編號</th><th>學生</th><th>考試範圍</th>" +
    (grade3Math ? "<th>數學分數</th><th>模擬考等級</th>" : grade3 ? "<th>答對題數</th><th>模擬考等級</th>" : "<th>成績</th><th>出席狀態</th>") +
    "<th>操作</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  const scoreEntryTable = root.querySelector(".bulk-score-entry-table");
  if (scoreEntryTable) {
    // 直接在表格元素鎖定尺寸，避免全站 table-wrap 的 100% 寬度規則把欄距再次撐開。
    scoreEntryTable.style.setProperty("width", grade3 ? "1040px" : "900px", "important");
    scoreEntryTable.style.setProperty("min-width", grade3 ? "1040px" : "900px", "important");
    scoreEntryTable.style.setProperty("max-width", "none", "important");
    scoreEntryTable.style.setProperty("table-layout", "fixed", "important");
    const columnWidths = grade3 ? [120, 140, 160, 140, 140, 140, 200] : [120, 140, 160, 140, 140, 200];
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


function renderExistingWeeklyScores() {
  const root = $("existingWeeklyScoresContent");
  if (!root) return;
  const examId = $("scoreExam").value;
  const className = $("scoreClass").value;
  const subject = $("scoreSubject").value;
  if (!examId || !className || !subject) {
    root.innerHTML = "<div class='empty'>請先選擇考試週期、班級及科目。</div>";
    return;
  }
  const rows = scoresCache.filter(function (score) {
    const student = studentsByIdCache.get(String(score.student_id));
    return String(score.exam_id) === String(examId) && student &&
      student.class_name === className && score.subject === subject;
  }).sort(function (a, b) {
    const sa = studentsByIdCache.get(String(a.student_id));
    const sb = studentsByIdCache.get(String(b.student_id));
    return String(sa && sa.student_code || "").localeCompare(String(sb && sb.student_code || ""), "zh-Hant", {numeric:true}) ||
      String(a.scope || "").localeCompare(String(b.scope || ""), "zh-Hant", {numeric:true});
  });
  if (!rows.length) {
    root.innerHTML = "<div class='empty'>此考試週期目前沒有該班、該科目的既有成績。</div>";
    return;
  }
  const gradeOptions = GRADE_OPTIONS.map(g => "<option value='" + escapeHtml(g) + "'>" + escapeHtml(g) + "</option>").join("");
  root.innerHTML = "<p class='muted'>共 " + rows.length + " 筆既有成績，依考試範圍分別列出。</p>" +
    "<div class='table-wrap'><table class='existing-weekly-scores-table weekly-score-layout-table'><thead><tr><th>編號</th><th>學生</th><th>考試範圍</th>" +
    (isGrade3Class(className) ? "<th>成績／答對題數</th><th>模擬考等級</th>" : "<th>成績</th><th>出席狀態</th>") + "<th>操作</th></tr></thead><tbody>" +
    rows.map(function (item) {
      const student = studentsByIdCache.get(String(item.student_id));
      const grade3 = isGrade3Class(className);
      const grade3Math = isGrade3Math(className, subject);
      const absent = item.grade_level === "缺考" || item.grade_level === "請假";
      const value = grade3Math ? item.score : grade3 ? item.correct_count : item.score;
      const status = grade3
        ? "<select data-existing-grade>" + gradeOptions + "</select>"
        : "<select data-existing-status><option value='normal'>正常</option><option value='請假'>請假</option></select>";
      return "<tr data-existing-score-id='" + escapeHtml(item.id) + "'><td>" + escapeHtml(student.student_code || "") + "</td><td>" + escapeHtml(student.full_name) +
        "</td><td>" + escapeHtml(item.scope || "（未填寫）") + "</td><td><input data-existing-value type='number' min='0' " +
        (grade3 && !grade3Math ? "step='1'" : "max='100' step='0.1'") + " value='" +
        (value == null ? "" : escapeHtml(value)) + "' " + (absent ? "disabled" : "") + "></td><td>" +
        status + "</td><td><button class='btn btn-small' type='button' data-save-existing-score>儲存修改</button></td></tr>";
    }).join("") + "</tbody></table></div>";
  const existingTable = root.querySelector(".existing-weekly-scores-table");
  if (existingTable) {
    const grade3 = isGrade3Class(className);
    const tableWidth = grade3 ? "1040px" : "900px";
    existingTable.style.setProperty("width", tableWidth, "important");
    existingTable.style.setProperty("min-width", tableWidth, "important");
    existingTable.style.setProperty("max-width", "none", "important");
    existingTable.style.setProperty("table-layout", "fixed", "important");
    const columnWidths = grade3 ? [120, 140, 160, 140, 140, 140, 200] : [120, 140, 160, 140, 140, 200];
    existingTable.querySelectorAll("thead th, tbody td").forEach(function (cell) {
      const width = columnWidths[cell.cellIndex];
      if (width) cell.style.setProperty("width", width + "px", "important");
    });
  }
  root.querySelectorAll("[data-existing-grade]").forEach(function (select) {
    const item = scoresByIdCache.get(String(select.closest("tr").dataset.existingScoreId));
    select.value = item && item.grade_level || "";
    select.addEventListener("change", function () {
      const input = select.closest("tr").querySelector("[data-existing-value]");
      input.disabled = this.value === "缺考" || this.value === "請假";
      if (input.disabled) input.value = "";
    });
  });
  root.querySelectorAll("[data-existing-status]").forEach(function (select) {
    const item = scoresByIdCache.get(String(select.closest("tr").dataset.existingScoreId));
    select.value = item && item.grade_level === "請假" ? "請假" : "normal";
    select.addEventListener("change", function () {
      const input = select.closest("tr").querySelector("[data-existing-value]");
      input.disabled = this.value === "請假";
      if (input.disabled) input.value = "";
      updateScoreInputWarning(input, !isGrade3Class(className) || isGrade3Math(className, subject));
    });
  });
  // 既有成績修改欄位也要在載入及每次輸入時即時套用未達 60 分警示。
  root.querySelectorAll("[data-existing-value]").forEach(function (input) {
    const warningEnabled = !isGrade3Class(className) || isGrade3Math(className, subject);
    updateScoreInputWarning(input, warningEnabled);
    input.addEventListener("input", function () {
      updateScoreInputWarning(input, warningEnabled);
    });
  });
}

async function saveExistingWeeklyScore(row) {
  const button = row && row.querySelector("[data-save-existing-score]");
  if (!button || button.disabled) return;
  const id = String(row.dataset.existingScoreId);
  const item = scoresByIdCache.get(id);
  const student = item && studentsByIdCache.get(String(item.student_id));
  if (!item || !student) return;
  const className = $("scoreClass").value;
  const subject = $("scoreSubject").value;
  const grade3 = isGrade3Class(className);
  const grade3Math = isGrade3Math(className, subject);
  const input = row.querySelector("[data-existing-value]");
  const gradeSelect = row.querySelector("[data-existing-grade]");
  const statusSelect = row.querySelector("[data-existing-status]");
  const grade = gradeSelect ? gradeSelect.value : "";
  const status = statusSelect ? statusSelect.value : "normal";
  const raw = input ? input.value.trim() : "";
  let score = null, correctCount = null, gradeLevel = null;
  if (grade3) {
    if (!GRADE_OPTIONS.includes(grade)) {
      showMessage(student.full_name + "：請選擇模擬考等級。", "error", true); return;
    }
    gradeLevel = grade;
    if (grade !== "缺考" && grade !== "請假") {
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0 || (grade3Math ? value > 100 : !Number.isInteger(value))) {
        showMessage(student.full_name + "：成績格式錯誤。", "error", true); return;
      }
      if (grade3Math) score = value; else correctCount = value;
    }
  } else if (status === "請假") {
    gradeLevel = "請假";
  } else {
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < 0 || value > 100) {
      showMessage(student.full_name + "：請輸入 0～100 分。", "error", true); return;
    }
    score = value;
  }
  button.disabled = true;
  button.textContent = "儲存中…";
  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const result = await db.from("scores").update({
      score: score, correct_count: correctCount, grade_level: gradeLevel
    }).eq("id", id).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single();
    if (result.error) throw result.error;
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    Object.assign(item, result.data);
    rebuildScoresByIdCache();
    updateScoreCompositeIndex(item);
    invalidateAdminHighestPreviewCache();
    renderExistingWeeklyScores();
    showMessage(student.full_name + "（" + item.scope + "）成績已更新。", "success", true);
  } catch (error) {
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    showMessage(student.full_name + " 成績修改失敗：" + error.message, "error", true);
    button.disabled = false;
    button.textContent = "儲存修改";
  }
}

async function refreshScoreCacheForScope(examId, subject, scope) {
  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  const result = await db
    .from("scores")
    .select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level")
    .eq("exam_id", examId)
    .eq("subject", subject)
    .eq("scope", scope);

  if (result.error) {
    throw new Error("成績已儲存，但同步本機成績快取失敗：" + result.error.message);
  }
  if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return [];

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
  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const payload = { student_id: studentId, exam_id: examId, subject, scope, score, correct_count: correctCount, grade_level: gradeLevel };
    const result = duplicate
      ? await db.from("scores").update(payload).eq("id", duplicate.id).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single()
      : await db.from("scores").insert(payload).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("成績已送出，但未取得儲存後的資料，請重新整理確認。");
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;

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
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    message.textContent = student.full_name + " 儲存失敗：" + error.message;
    message.className = "system-message error"; message.style.display = "block";
  } finally {
    if (isCurrentAppSession(sessionGeneration, sessionUserId)) {
      button.disabled = false; button.textContent = "單筆儲存";
    }
  }
}

async function saveBulkScores() {
  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
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
      if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    } catch (refreshError) {
      if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
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
      if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;

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
        if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
      } catch (refreshError) {
        if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
        console.warn(refreshError);
        // 無法確認遠端最終狀態時，鎖定成績索引；下次儲存必須先重新向資料庫讀取。
        bulkEntryScoreContextKey = "__stale__";
        cacheWarning = "；提醒：部分成績可能已寫入，但最新資料確認失敗。請確認網路後重新整理管理頁，再檢查未完成項目";
      }
    }
    message.textContent = "完成 " + saved + " 筆" + (failures.length ? "；失敗 " + failures.length + " 筆：" + failures.join("；") : "；全部成功。") +
      (failures.length ? " 失敗項目可修正後重新儲存。" : "") + cacheWarning;
    message.className = failures.length ? "system-message error" : "system-message success";
    if (!failures.length) { renderExistingWeeklyScores(); renderBulkScoreEntryRows(); }
  } catch (error) {
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    message.textContent = "批次儲存中斷：已完成 " + saved + " 筆；" + error.message;
    message.className = "system-message error";
  } finally {
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
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
    "<div class='field'><label>新增成績的考試範圍</label><input id='scoreScope' placeholder='例如：第 1～2 課、XX(補考)'></div></div>" +
    "<p class='muted'>選擇考試週期、班級及科目後，會先列出所有既有成績；新增或補登成績時，再填寫考試範圍。</p>" +
    "<h4>既有成績查詢與修改</h4><div id='existingWeeklyScoresContent'><div class='empty'>請先選擇考試週期、班級及科目。</div></div>" +"<h4>新增／補登成績</h4><div id='bulkScoreEntryContent'><div class='empty'>請選擇考試週期、班級、科目並填寫考試範圍。</div></div>" +
    "<div class='toolbar'><button class='btn btn-success' type='button' id='saveBulkScoresButton'>儲存已填寫的成績</button></div>" +
    "<div id='bulkScoreEntryMessage' class='system-message' role='status'></div></div>";
  setDefaultExamDates();
  ["scoreExam", "scoreClass", "scoreSubject", "scoreScope"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      renderExistingWeeklyScores();
      renderBulkScoreEntryRows();
    });
  });
  $("saveBulkScoresButton").addEventListener("click", saveBulkScores);
  $("existingWeeklyScoresContent").addEventListener("click", async function (event) {
    const button = event.target.closest("[data-save-existing-score]");
    if (button) await saveExistingWeeklyScore(button.closest("tr[data-existing-score-id]"));
  });
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
  renderExistingWeeklyScores();
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
  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const result = duplicate
      ? await db.from("scores").update(payload).eq("id", duplicate.id).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single()
      : await db.from("scores").insert(payload).select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").single();
    if (result.error) throw result.error;
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
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
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    showMessage("成績儲存失敗，原輸入資料已保留。原因：" + error.message, "error", true);
  } finally {
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
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
