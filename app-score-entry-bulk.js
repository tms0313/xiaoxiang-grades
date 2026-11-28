// ==================================================
// 小象成績管理系統｜週成績批次登錄模組
// 負責批次名冊、草稿保存、成績索引、單筆及批次儲存。
// 依賴 app.js 的資料快取與工作階段狀態、app-utils.js 共用工具，
// 以及 app-score-entry.js 的頁面初始化與單筆登錄流程。
// ==================================================

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

function sortWeeklyScoreEntryStudents(students) {
  return (Array.isArray(students) ? students : []).slice().sort(function (a, b) {
    const codeCompare = String(a.student_code || "").localeCompare(
      String(b.student_code || ""), "zh-Hant", { numeric: true, sensitivity: "base" }
    );
    return codeCompare || String(a.full_name || "").localeCompare(String(b.full_name || ""), "zh-Hant");
  });
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
  const students = sortWeeklyScoreEntryStudents(
    scoreEntryStudentsByClassSubject.get(JSON.stringify([className, subject])) || []
  );
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
        "<td><select data-bulk-status><option value='normal'>正常</option><option value='缺考'>缺考</option><option value='請假'>請假</option></select></td>";
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
      const grade3Leave = grade3 && control.value === "請假";
      if (input) {
        input.disabled = grade3Leave;
        if (control.value === "缺考") input.value = "0";
        else if (grade3Leave) input.value = "";
        updateScoreInputWarning(input, !grade3 || grade3Math);
      }
      return;
    }
    control.value = draft.status ||
      (existing && (existing.grade_level === "請假" || existing.grade_level === "缺考") ? existing.grade_level : "normal");
    const input = row.querySelector("[data-bulk-score]");
    if (input) {
      input.disabled = control.value === "請假";
      if (control.value === "缺考") input.value = "0";
      else if (input.disabled) input.value = "";
      updateScoreInputWarning(input, !grade3 || grade3Math);
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
      if (event.target.value === "缺考") input.value = "0";
      else if (input.disabled) input.value = "";
      updateScoreInputWarning(input, !grade3 || grade3Math);
    }
    if (event.target.matches("[data-bulk-grade]") && grade3) {
      const input = event.target.closest("tr").querySelector("[data-bulk-score]");
      const absentOrLeave = event.target.value === "請假";
      if (input) {
        input.disabled = absentOrLeave;
        if (event.target.value === "缺考") input.value = "0";
        else if (absentOrLeave) input.value = "";
        updateScoreInputWarning(input, !grade3 || grade3Math);
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
      const absent = item.grade_level === "請假";
      const value = grade3Math ? item.score : grade3 ? item.correct_count : item.score;
      const status = grade3
        ? "<select data-existing-grade>" + gradeOptions + "</select>"
        : "<select data-existing-status><option value='normal'>正常</option><option value='缺考'>缺考</option><option value='請假'>請假</option></select>";
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
      input.disabled = this.value === "請假";
      if (this.value === "缺考") input.value = "0";
      else if (input.disabled) input.value = "";
      updateScoreInputWarning(input, !grade3 || grade3Math);
    });
  });
  root.querySelectorAll("[data-existing-status]").forEach(function (select) {
    const item = scoresByIdCache.get(String(select.closest("tr").dataset.existingScoreId));
    select.value = item && (item.grade_level === "請假" || item.grade_level === "缺考") ? item.grade_level : "normal";
    const initialInput = select.closest("tr").querySelector("[data-existing-value]");
    if (select.value === "缺考" && initialInput) initialInput.value = "0";
    select.addEventListener("change", function () {
      const input = select.closest("tr").querySelector("[data-existing-value]");
      input.disabled = this.value === "請假";
      if (this.value === "缺考") input.value = "0";
      else if (input.disabled) input.value = "";
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
    if (grade === "缺考") {
      if (grade3Math) score = 0; else correctCount = 0;
    } else if (grade !== "請假") {
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0 || (grade3Math ? value > 100 : !Number.isInteger(value))) {
        showMessage(student.full_name + "：成績格式錯誤。", "error", true); return;
      }
      if (grade3Math) score = value; else correctCount = value;
    }
  } else if (status === "請假") {
    gradeLevel = "請假";
  } else if (status === "缺考") {
    gradeLevel = "缺考";
    score = 0;
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
    if (grade === "缺考") {
      if (grade3Math) score = 0; else correctCount = 0;
    } else if (grade !== "請假") {
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
  } else if (status === "缺考") {
    gradeLevel = "缺考";
    score = 0;
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
    if (!raw && !grade && status !== "請假" && status !== "缺考") return;
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
    } else if (status !== "請假" && status !== "缺考") {
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0 || value > 100) {
        errors.push(row.children[1].textContent.trim() + "：請輸入 0～100 分");
        return;
      }
    }
    const gradeLevel = grade3 ? grade : status === "請假" || status === "缺考" ? status : null;
    const score = grade3Math
      ? (grade === "缺考" ? 0 : grade === "請假" ? null : Number(raw))
      : grade3 ? null : status === "缺考" ? 0 : status === "請假" ? null : Number(raw);
    const correctCount = grade3 && !grade3Math
      ? (grade === "缺考" ? 0 : grade === "請假" ? null : Number(raw)) : null;
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
