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

