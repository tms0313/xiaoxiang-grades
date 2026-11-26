// ==================================================
// 小象成績管理系統｜週成績總覽模組
// 由 index.html 在 app.js 前載入；沿用 app.js 的共用資料快取與工具函式。
// ==================================================

function areRowsEqualByFields(previousRows, nextRows, fields) {
  if (previousRows === nextRows) return true;
  if (!Array.isArray(previousRows) || !Array.isArray(nextRows)) return false;
  if (previousRows.length !== nextRows.length) return false;

  for (let i = 0; i < previousRows.length; i++) {
    const previousRow = previousRows[i];
    const nextRow = nextRows[i];
    if (!previousRow || !nextRow) {
      if (previousRow !== nextRow) return false;
      continue;
    }
    for (let j = 0; j < fields.length; j++) {
      const field = fields[j];
      if (previousRow[field] !== nextRow[field]) return false;
    }
  }
  return true;
}

async function refreshOverviewData() {
  const results = await Promise.all([
    fetchAllRows(() => db.from("scores").select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level").order("id", { ascending: true })),
    fetchAllRows(() => db.from("score_missing_exclusions").select("id, exam_id, student_id, subject, scope").order("id", { ascending: true }))
  ]);

  if (results[0].error) {
    throw new Error("成績資料讀取失敗：" + results[0].error.message);
  }
  if (results[1].error) {
    throw new Error("未登錄排除資料讀取失敗：" + results[1].error.message);
  }

  const nextScores = results[0].data || [];
  const nextExclusions = results[1].data || [];
  const previousExclusions = missingExclusionsCache;
  const scoresChanged = !areRowsEqualByFields(
    scoresCache,
    nextScores,
    ["id", "student_id", "exam_id", "subject", "scope", "score", "correct_count", "grade_level"]
  );
  const exclusionsChanged = !areRowsEqualByFields(
    previousExclusions,
    nextExclusions,
    ["id", "exam_id", "student_id", "subject", "scope"]
  );

  // 逐欄比較取代整份 JSON 序列化，減少每 60 秒輪詢時的字串配置與記憶體負擔。
  if (scoresChanged) {
    scoresCache = nextScores;
    rebuildScoresByIdCache();
    invalidateAdminHighestPreviewCache();
  }
  if (exclusionsChanged) {
    missingExclusionsCache = nextExclusions;
  }

  // 保留原有每週提醒名單清理規則；若清理了舊資料，也會觸發畫面更新。
  try {
    await cleanupPreviousWeekExclusions();
  } catch (error) {
    console.error("清除上一週已排除提醒失敗：", error);
  }

  return scoresChanged || exclusionsChanged ||
    !areRowsEqualByFields(
      previousExclusions,
      missingExclusionsCache,
      ["id", "exam_id", "student_id", "subject", "scope"]
    );
}

// ==================================================
// 7. 成績總覽
// ==================================================

function renderOverview(preservedFilters, keepExcludedPanelOpen) {
  const content = $("adminContent");

  // 本次畫面渲染共用索引，避免每一筆成績列都重新掃描學生與考試快取。
  const studentById = studentsByIdCache;
  const examById = examsByIdCache;

  function getStudent(id) {
    return studentById.get(String(id));
  }

  function getExam(id) {
    return examById.get(String(id));
  }

  function buildOverviewRow(score, showExamRange) {
    const student = getStudent(score.student_id);
    const exam = getExam(score.exam_id);
    if (!student || !exam) return "";

    const grade3 = isGrade3Class(student.class_name);
    const grade3Math = isGrade3Math(student.class_name, score.subject);

    const resultText = score.grade_level === "請假"
      ? "<span class='grade-tag grade-leave overview-status-button overview-status-leave'>請假</span>"
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
        "<td>" + (showExamRange ? escapeHtml(formatDateRange(exam)) : "") + "</td>" +
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

  const selectedMissingItems = new Map();
  const overviewPageSize = 100;
  const overviewClassCollator = new Intl.Collator("zh-Hant");
  const overviewCodeCollator = new Intl.Collator(undefined, { numeric: true });
  let overviewCurrentPage = 0;
  let overviewFilteredRows = [];
  let overviewSearchTimer = null;
  let lastOverviewFilterSignature = null;

  function missingSelectionKey(examId, studentId, subject, scope) {
    return JSON.stringify([String(examId), String(studentId), String(subject), String(scope || "")]);
  }

  function buildMissingOverviewRow(student, exam, subject, scope, showExamRange) {
    const selectionKey = missingSelectionKey(exam.id, student.id, subject, scope);
    const selectedAttribute = selectedMissingItems.has(selectionKey) ? " checked" : "";
    return (
      "<tr class='overview-missing-row'>" +
        "<td>" + (showExamRange ? escapeHtml(formatDateRange(exam)) : "") + "</td>" +
        "<td>" + escapeHtml(student.class_name) + "</td>" +
        "<td>" + escapeHtml(student.student_code) + "</td>" +
        "<td>" + escapeHtml(student.full_name) + "</td>" +
        "<td>" + escapeHtml(subject) + "</td>" +
        "<td>" + escapeHtml(scope || "—") + "</td>" +
        "<td><span class='grade-tag overview-status-button overview-status-missing'>未登錄</span></td>" +
        "<td class='action-cell'><div class='action-buttons'>" +
          "<label class='overview-missing-select'><input type='checkbox' data-select-missing='1' data-exam-id='" + escapeHtml(exam.id) +
          "' data-student-id='" + escapeHtml(student.id) + "' data-subject='" + escapeHtml(subject) +
          "' data-scope='" + escapeHtml(scope || "") + "' data-selection-key='" + escapeHtml(selectionKey) + "'" +
          selectedAttribute + ">選取此筆</label>" +
          "<button class='btn btn-small overview-edit-missing-btn' data-edit-missing='1' data-exam-id='" + escapeHtml(exam.id) +
          "' data-student-id='" + escapeHtml(student.id) + "' data-subject='" + escapeHtml(subject) +
          "' data-scope='" + escapeHtml(scope || "") + "'>修改</button>" +
          "<button class='btn btn-danger btn-small overview-exclude-reminder-btn' data-exclude-missing='1' data-exam-id='" + escapeHtml(exam.id) +
          "' data-student-id='" + escapeHtml(student.id) + "' data-subject='" + escapeHtml(subject) +
          "' data-scope='" + escapeHtml(scope || "") + "'>排除提醒</button>" +
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

  const examOptions = examsByDateDescCache.map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>週成績總覽</h2>" +
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
      "<span class='muted' style='font-size: 14px;white-space:nowrap'>每 60 秒自動更新</span>" +
    "</div>" +
    "<p id='overviewFilterHint' class='muted' style='margin:0 0 10px'>選擇考試週期及科目後，系統會依已登錄的科目範圍比對同班修課學生。</p>" +
    "<div class='toolbar' id='overviewMissingBatchBar' style='margin:0 0 12px;gap:8px'>" +
      "<button class='btn btn-secondary btn-small' type='button' id='selectAllMissingButton'>選取目前顯示的未登錄項目</button>" +
      "<button class='btn btn-secondary btn-small' type='button' id='clearMissingSelectionButton'>取消所有勾選</button>" +
      "<button class='btn btn-danger btn-small' type='button' id='batchExcludeMissingButton' disabled>排除已選取提醒（0）</button>" +
      "<span class='muted' style='font-size: 14px'>排除後只會從未登錄清單隱藏；不會刪除成績，且可隨時恢復提醒。</span>" +
    "</div>" +
    "<div id='excludedRemindersPanel' class='panel' style='display:none;margin-top:18px'>" +
      "<h3>已排除的未登錄提醒</h3>" +
      "<p class='muted'>這裡只管理已排除的提醒；按下「恢復提醒」後，該筆資料會重新列入未登錄清單。</p>" +
      "<div class='table-wrap'><table class='excluded-reminders-table'><thead><tr><th>考試區間</th><th>班級</th><th>編號</th><th>姓名</th><th>科目</th><th>考試範圍</th><th>操作</th></tr></thead>" +
      "<tbody id='excludedReminderRows'>" + (buildExcludedReminderRows() || "<tr><td colspan='7' class='empty'>目前沒有已排除的提醒</td></tr>") + "</tbody></table></div>" +
    "</div>" +
    "<div class='table-wrap'><table class='overview-table'>" +
      "<thead><tr><th>考試區間</th><th>班級</th><th>編號</th><th>姓名</th><th>科目</th><th>考試範圍</th><th>成績／狀態</th><th>操作</th></tr></thead>" +
      "<tbody id='overviewRows'><tr><td colspan='8' class='empty'>資料載入中……</td></tr></tbody>" +
    "</table></div>" +
    "<div id='overviewPagination' class='toolbar' style='justify-content:center;align-items:center;gap:12px;margin-top:12px'>" +
      "<button class='btn btn-secondary btn-small' type='button' id='overviewPrevPage'>上一頁</button>" +
      "<span id='overviewPageInfo' class='muted' style='font-size: 14px'>第 1 頁</span>" +
      "<button class='btn btn-secondary btn-small' type='button' id='overviewNextPage'>下一頁</button>" +
    "</div>";

  // 每次畫面重繪時建立一次索引；搜尋、篩選操作直接重用。
  const overviewIndexBuildStartedAt = performance.now();
  const keyOf = (...parts) => parts.map(value => String(value == null ? "" : value).trim()).join("\u001f");
  const scoreKeys = new Set();
  const registeredGroupsByExam = new Map();
  const scoresByExam = new Map();
  const scoresByClass = new Map();
  const scoresBySubject = new Map();
  const studentSearchIndex = new Map();

  studentsCache.forEach(function (student) {
    studentSearchIndex.set(String(student.id), (
      String(student.full_name || "") + "\u001f" +
      String(student.student_code || "")
    ).toLowerCase());
  });

  function addToIndex(index, key, value) {
    const normalizedKey = String(key == null ? "" : key);
    if (!index.has(normalizedKey)) index.set(normalizedKey, []);
    index.get(normalizedKey).push(value);
  }

  scoresCache.forEach(function (score) {
    const student = studentById.get(String(score.student_id));
    if (!student) return;
    addToIndex(scoresByExam, score.exam_id, score);
    addToIndex(scoresByClass, student.class_name, score);
    addToIndex(scoresBySubject, score.subject, score);
    const normalizedScope = String(score.scope || "").trim();
    scoreKeys.add(keyOf(score.exam_id, score.student_id, score.subject, normalizedScope));
    if (score.grade_level === "請假" || !normalizedScope) return;
    const groupKey = keyOf(score.exam_id, student.class_name, score.subject);
    const examKey = String(score.exam_id);
    if (!registeredGroupsByExam.has(examKey)) registeredGroupsByExam.set(examKey, new Map());
    const examGroups = registeredGroupsByExam.get(examKey);
    let registeredGroup = examGroups.get(groupKey);
    if (!registeredGroup) {
      registeredGroup = {
        className: student.class_name,
        subject: score.subject,
        scopes: new Set()
      };
      examGroups.set(groupKey, registeredGroup);
    }
    registeredGroup.scopes.add(normalizedScope);
  });

  const exclusionKeys = new Set(missingExclusionsCache.map(item =>
    keyOf(item.exam_id, item.student_id, item.subject, item.scope || "")
  ));
  const enrolledStudentsByClassSubject = new Map();
  studentSubjectsCache.forEach(function (item) {
    if (item.is_active !== true) return;
    const student = studentById.get(String(item.student_id));
    if (!student || student.is_active === false) return;
    const groupKey = keyOf(student.class_name, item.subject);
    if (!enrolledStudentsByClassSubject.has(groupKey)) {
      enrolledStudentsByClassSubject.set(groupKey, {
        ids: new Set(),
        students: [],
        className: student.class_name,
        subject: item.subject
      });
    }
    const group = enrolledStudentsByClassSubject.get(groupKey);
    const studentId = String(student.id);
    if (group.ids.has(studentId)) return;
    group.ids.add(studentId);
    group.students.push(student);
  });
  // 考試日期排序不隨搜尋條件改變，在本次畫面生命週期只計算一次。
  const overviewExamsByDateDesc = examsByDateDescCache;
  const overviewIndexBuildMs = performance.now() - overviewIndexBuildStartedAt;
  const overviewPerf = {
    indexBuildMs: overviewIndexBuildMs,
    latestFilter: null,
    latestRenderMs: 0,
    pageSize: overviewPageSize,
    students: studentsCache.length,
    exams: examsCache.length,
    scores: scoresCache.length,
    enrolledGroups: enrolledStudentsByClassSubject.size
  };

  function buildOverviewPerfReport() {
    const f = overviewPerf.latestFilter || {};
    return [
      "小象成績總覽效能紀錄",
      "管理員資料載入：" + (adminDataLoadMetrics ? adminDataLoadMetrics.totalMs.toFixed(2) + " ms（Supabase 查詢 " + adminDataLoadMetrics.queryMs.toFixed(2) + " ms）" : "尚無資料"),
      ...(adminDataLoadMetrics && adminDataLoadMetrics.queryBreakdown
        ? adminDataLoadMetrics.queryBreakdown
            .slice()
            .sort((a, b) => b.elapsedMs - a.elapsedMs)
            .map(item => "資料表 " + item.name + "：" + item.elapsedMs.toFixed(2) + " ms／" + item.rows + " 筆")
        : []),
      "索引建立：" + overviewPerf.indexBuildMs.toFixed(2) + " ms",
      "資料量：學生 " + overviewPerf.students + "、考試 " + overviewPerf.exams + "、成績 " + overviewPerf.scores,
      "修課群組：" + overviewPerf.enrolledGroups,
      "最近一次篩選：候選成績 " + (f.scoreCandidates || 0) + " 筆；成績比對 " + (f.scoreScanMs || 0).toFixed(2) + " ms",
      "未登錄比對：" + (f.missingCompareMs || 0).toFixed(2) + " ms；檢查考試 " + (f.examsChecked || 0) + " 場；實際登錄群組 " + (f.registeredGroupsChecked || 0) + " 組；符合修課群組 " + (f.matchedEnrolledGroups || 0) + " 組",
      "狀態篩選：" + (f.statusFilterMs || 0).toFixed(2) + " ms；排序：" + (f.sortMs || 0).toFixed(2) + " ms",
      "篩選總耗時：" + (f.totalMs || 0).toFixed(2) + " ms；未登錄 " + (f.missingCount || 0) + " 筆；篩選結果 " + (f.finalRows || 0) + " 筆",
      "最近一次頁面渲染：" + overviewPerf.latestRenderMs.toFixed(2) + " ms；實際渲染 " + (f.renderedRows || 0) + " 筆；每頁 " + overviewPerf.pageSize + " 筆"
    ].join("\n");
  }

  function updateOverviewPerfPanel() {
    const summary = $("overviewPerfSummary");
    if (summary) summary.textContent = buildOverviewPerfReport();
  }

  function renderOverviewPage() {
    const renderStartedAt = performance.now();
    const totalRows = overviewFilteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / overviewPageSize));
    overviewCurrentPage = Math.min(Math.max(overviewCurrentPage, 0), totalPages - 1);
    const startIndex = overviewCurrentPage * overviewPageSize;
    const pageRows = overviewFilteredRows.slice(startIndex, startIndex + overviewPageSize);
    const renderedExamIds = new Set();

    $("overviewRows").innerHTML =
      pageRows.map(function (item) {
        const currentExamId = String(item.exam && item.exam.id || "");
        const showExamRange = !renderedExamIds.has(currentExamId);
        renderedExamIds.add(currentExamId);
        return item.missing
          ? buildMissingOverviewRow(item.student, item.exam, item.subject, item.scope, showExamRange)
          : buildOverviewRow(item.score, showExamRange);
      }).join("") ||
      ($("overviewStatus").value === "missing"
        ? "<tr><td colspan='8' class='empty'>目前篩選條件下沒有待登錄提醒</td></tr>"
        : "<tr><td colspan='8' class='empty'>沒有符合的成績資料</td></tr>");

    const pageInfo = $("overviewPageInfo");
    const prevButton = $("overviewPrevPage");
    const nextButton = $("overviewNextPage");
    if (pageInfo) {
      pageInfo.textContent = totalRows
        ? "第 " + (overviewCurrentPage + 1) + " / " + totalPages + " 頁，共 " + totalRows + " 筆（每頁 " + overviewPageSize + " 筆）"
        : "共 0 筆資料";
    }
    if (prevButton) prevButton.disabled = overviewCurrentPage === 0 || totalRows === 0;
    if (nextButton) nextButton.disabled = overviewCurrentPage >= totalPages - 1 || totalRows === 0;
    updateMissingSelectionCount();
    overviewPerf.latestRenderMs = performance.now() - renderStartedAt;
    if (overviewPerf.latestFilter) overviewPerf.latestFilter.renderedRows = pageRows.length;
    updateOverviewPerfPanel();
  }

  // 搜尋學生集合只依搜尋文字與班級變化；切換考試、科目或狀態時沿用快取。
  let matchedStudentCacheSignature = null;
  let matchedStudentIdsCache = new Set();

  function filterRows() {
    const filterStartedAt = performance.now();
    const search = $("overviewSearch").value.trim().toLowerCase();
    const examId = $("overviewExam").value;
    const className = $("overviewClass").value;
    const subject = $("overviewSubject").value;
    const status = $("overviewStatus").value;
    const filterSignature = JSON.stringify([search, examId, className, subject, status]);
    if (filterSignature === lastOverviewFilterSignature) return;
    lastOverviewFilterSignature = filterSignature;
    overviewCurrentPage = 0;
    // 只有篩選條件真的改變才清除舊條件的勾選。
    selectedMissingItems.clear();

    // 只有搜尋文字或班級改變時才重建符合學生集合；考試、科目、狀態篩選共用此集合。
    const matchedStudentCacheKey = JSON.stringify([search, className]);
    if (matchedStudentCacheKey !== matchedStudentCacheSignature) {
      matchedStudentIdsCache = new Set();
      studentsCache.forEach(function (student) {
        if (!student || (className && student.class_name !== className)) return;
        if (search && !(studentSearchIndex.get(String(student.id)) || "").includes(search)) return;
        matchedStudentIdsCache.add(String(student.id));
      });
      matchedStudentCacheSignature = matchedStudentCacheKey;
    }
    const matchedStudentIds = matchedStudentIdsCache;

    // 依目前篩選條件選擇資料量最小的索引作為候選集，避免每次輸入都掃描全部成績。
    let scoreCandidates = scoresCache;
    if (examId) scoreCandidates = scoresByExam.get(String(examId)) || [];
    if (className) {
      const classCandidates = scoresByClass.get(className) || [];
      if (classCandidates.length < scoreCandidates.length) scoreCandidates = classCandidates;
    }
    if (subject) {
      const subjectCandidates = scoresBySubject.get(subject) || [];
      if (subjectCandidates.length < scoreCandidates.length) scoreCandidates = subjectCandidates;
    }

    const scoreScanStartedAt = performance.now();
    let rows = [];
    scoreCandidates.forEach(function (score) {
      if (examId && String(score.exam_id) !== String(examId)) return;
      if (subject && score.subject !== subject) return;
      const studentId = String(score.student_id);
      if (!matchedStudentIds.has(studentId)) return;
      const student = studentById.get(studentId);
      if (!student) return;
      const exam = getExam(score.exam_id);
      if (exam) rows.push({ score: score, student: student, exam: exam });
    });

    const scoreScanMs = performance.now() - scoreScanStartedAt;
    // 只走該考試實際有登錄過的班級／科目組合，不再掃描所有班級與科目的笛卡兒組合。
    const missingCompareStartedAt = performance.now();
    const examsToCheck = examId
      ? [getExam(examId)].filter(Boolean)
      : overviewExamsByDateDesc;
    // 只在實際遇到已登錄的班級／科目組合時，才篩選該組修課學生；
    // 同一組合跨多場考試時共用結果，避免每次搜尋掃描全部修課群組。
    const matchingEnrolledStudentsByClassSubject = new Map();
    let matchedEnrolledGroupCount = 0;

    let registeredGroupsCheckedCount = 0;
    examsToCheck.forEach(function (selectedExam) {
      const currentExamId = String(selectedExam.id);
      const examGroups = registeredGroupsByExam.get(currentExamId);
      if (!examGroups) return;
      registeredGroupsCheckedCount += examGroups.size;

      examGroups.forEach(function (registeredGroup) {
        const targetClass = registeredGroup.className;
        const targetSubject = registeredGroup.subject;
        if (className && targetClass !== className) return;
        if (subject && targetSubject !== subject) return;

        const enrollmentKey = keyOf(targetClass, targetSubject);
        if (!matchingEnrolledStudentsByClassSubject.has(enrollmentKey)) {
          const enrollmentGroup = enrolledStudentsByClassSubject.get(enrollmentKey);
          const matchedStudents = enrollmentGroup
            ? enrollmentGroup.students.filter(student => matchedStudentIds.has(String(student.id)))
            : [];
          matchingEnrolledStudentsByClassSubject.set(enrollmentKey, matchedStudents);
          if (matchedStudents.length) matchedEnrolledGroupCount += 1;
        }
        const enrolledStudents = matchingEnrolledStudentsByClassSubject.get(enrollmentKey);
        if (!enrolledStudents || !enrolledStudents.length) return;

        registeredGroup.scopes.forEach(function (scope) {
          enrolledStudents.forEach(function (student) {
            const recordKey = keyOf(currentExamId, student.id, targetSubject, scope);
            if (!scoreKeys.has(recordKey) && !exclusionKeys.has(recordKey)) {
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

        const missingCompareMs = performance.now() - missingCompareStartedAt;
    const rowsBeforeStatus = rows.length;
    const statusFilterStartedAt = performance.now();
    let missingCount = 0;
    const sortableRows = [];

    // 同一輪遍歷同時計算未登錄數量、狀態篩選及排序欄位，避免建立中間 filteredRows 陣列。
    rows.forEach(function (item) {
      if (item.missing) missingCount += 1;
      let include = true;
      if (status === "missing") include = !!item.missing;
      else if (status !== "all") {
        if (item.missing || !item.score) include = false;
        else if (status === "leave") include = item.score.grade_level === "請假";
        else if (status === "absent") include = item.score.grade_level === "缺考";
        else if (status === "low") {
          include = item.score.grade_level !== "請假" && item.score.grade_level !== "缺考" &&
            scoreClass(item.score.score, item.student.class_name, item.score.subject) === "low-score";
        }
      }
      if (!include) return;
      sortableRows.push({
        item: item,
        date: String((item.exam && (item.exam.end_date || item.exam.start_date)) || ""),
        examId: String(item.exam && item.exam.id || ""),
        className: String(item.student.class_name || ""),
        missing: !!item.missing,
        studentCode: String(item.student.student_code || ""),
        scope: String(item.scope || (item.score && item.score.scope) || "")
      });
    });

    const statusFilterMs = performance.now() - statusFilterStartedAt;

    // 排序欄位已在前一輪遍歷建立，排序比較器不再反覆讀取物件或轉換字串。
    const sortStartedAt = performance.now();

    sortableRows.sort(function (a, b) {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const examCompare = a.examId.localeCompare(b.examId);
      if (examCompare !== 0) return examCompare;
      const classCompare = overviewClassCollator.compare(a.className, b.className);
      if (classCompare !== 0) return classCompare;
      if (a.missing !== b.missing) return a.missing ? 1 : -1;
      const codeCompare = overviewCodeCollator.compare(a.studentCode, b.studentCode);
      if (codeCompare !== 0) return codeCompare;
      return overviewClassCollator.compare(a.scope, b.scope);
    });
    const sortedRows = sortableRows.map(entry => entry.item);
    const sortMs = performance.now() - sortStartedAt;

    const hint = $("overviewFilterHint");
    if (hint) {
      const filterDescription = (examId ? formatDateRange(getExam(examId)) : "全部考試週期") +
        "／" + (className || "全部班級") + "／" + (subject || "全部科目");
      hint.textContent =
        "目前條件：" + filterDescription +
        "；符合條件的未登錄提醒共 " + missingCount + " 筆。" +
        "只比對同一考試、班級及科目已有學生登錄的考試範圍；已標記請假的學生不列入。";
    }

    overviewFilteredRows = sortedRows;
    overviewPerf.latestFilter = {
      scoreCandidates: scoreCandidates.length,
      scoreScanMs: scoreScanMs,
      missingCompareMs: missingCompareMs,
      examsChecked: examsToCheck.length,
      registeredGroupsChecked: registeredGroupsCheckedCount,
      matchedEnrolledGroups: matchedEnrolledGroupCount,
      statusFilterMs: statusFilterMs,
      sortMs: sortMs,
      totalMs: performance.now() - filterStartedAt,
      missingCount: missingCount,
      rowsBeforeStatus: rowsBeforeStatus,
      finalRows: sortedRows.length,
      renderedRows: 0
    };
    renderOverviewPage();
    overviewPerf.latestFilter.totalMs = performance.now() - filterStartedAt;
    updateOverviewPerfPanel();
  }

  if (preservedFilters) {
    $("overviewSearch").value = preservedFilters.search || "";
    $("overviewExam").value = preservedFilters.examId || "";
    $("overviewClass").value = preservedFilters.className || "";
    $("overviewSubject").value = preservedFilters.subject || "";
    $("overviewStatus").value = preservedFilters.status || "all";
  }

  $("overviewSearch").addEventListener("input", function () {
    if (overviewSearchTimer) clearTimeout(overviewSearchTimer);
    overviewSearchTimer = setTimeout(function () {
      overviewSearchTimer = null;
      filterRows();
    }, 180);
  });
  $("overviewExam").addEventListener("change", filterRows);
  $("overviewClass").addEventListener("change", filterRows);
  $("overviewSubject").addEventListener("change", filterRows);
  $("overviewStatus").addEventListener("change", filterRows);

  function updateMissingSelectionCount() {
    const button = $("batchExcludeMissingButton");
    if (button) {
      button.textContent = "排除已選取提醒（" + selectedMissingItems.size + "）";
      button.disabled = selectedMissingItems.size === 0;
    }
  }

  $("overviewPrevPage").addEventListener("click", function () {
    if (overviewCurrentPage <= 0) return;
    overviewCurrentPage--;
    renderOverviewPage();
  });
  $("overviewNextPage").addEventListener("click", function () {
    const totalPages = Math.ceil(overviewFilteredRows.length / overviewPageSize);
    if (overviewCurrentPage >= totalPages - 1) return;
    overviewCurrentPage++;
    renderOverviewPage();
  });
  $("selectAllMissingButton").addEventListener("click", function () {
    const startIndex = overviewCurrentPage * overviewPageSize;
    overviewFilteredRows.slice(startIndex, startIndex + overviewPageSize).forEach(function (item) {
      if (!item.missing) return;
      const selectionKey = missingSelectionKey(item.exam.id, item.student.id, item.subject, item.scope);
      selectedMissingItems.set(selectionKey, {
        examId: item.exam.id,
        studentId: item.student.id,
        subject: item.subject,
        scope: item.scope || ""
      });
    });
    renderOverviewPage();
  });
  $("clearMissingSelectionButton").addEventListener("click", function () {
    selectedMissingItems.clear();
    renderOverviewPage();
  });
  content.onchange = function (event) {
    if (!event.target.matches("[data-select-missing]")) return;
    const box = event.target;
    const selectionKey = box.dataset.selectionKey;
    if (box.checked) {
      selectedMissingItems.set(selectionKey, {
        examId: box.dataset.examId,
        studentId: box.dataset.studentId,
        subject: box.dataset.subject,
        scope: box.dataset.scope || ""
      });
    } else {
      selectedMissingItems.delete(selectionKey);
    }
    updateMissingSelectionCount();
  };
  $("batchExcludeMissingButton").addEventListener("click", async function () {
    const items = Array.from(selectedMissingItems.values());
    if (!items.length) return;
    await excludeMissingRemindersBatch(items);
  });

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
    const editMissingButton = event.target.closest("[data-edit-missing]");
    const deleteButton = event.target.closest("[data-delete-score]");
    const excludeButton = event.target.closest("[data-exclude-missing]");
    const restoreButton = event.target.closest("[data-restore-missing]");

    if (editButton) await editScore(editButton.dataset.editScore);
    if (editMissingButton) {
      await editScore(null, {
        examId: editMissingButton.dataset.examId,
        studentId: editMissingButton.dataset.studentId,
        subject: editMissingButton.dataset.subject,
        scope: editMissingButton.dataset.scope
      });
      return;
    }
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
    if (document.visibilityState === "hidden" || activeTab !== "overview" || overviewAutoRefreshBusy || !$("overviewRows")) return;

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
      const dataChanged = await refreshOverviewData();
      const filtersStillMatch =
        currentFilters.search === ($("overviewSearch") ? $("overviewSearch").value : "") &&
        currentFilters.examId === ($("overviewExam") ? $("overviewExam").value : "") &&
        currentFilters.className === ($("overviewClass") ? $("overviewClass").value : "") &&
        currentFilters.subject === ($("overviewSubject") ? $("overviewSubject").value : "") &&
        currentFilters.status === ($("overviewStatus") ? $("overviewStatus").value : "all");
      if (dataChanged && activeTab === "overview" && $("overviewRows") && filtersStillMatch) {
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
// 7-0. 批次排除未登錄提醒
// ==================================================

async function excludeMissingRemindersBatch(items) {
  const uniqueItems = Array.from(new Map(items.map(item => [
    [item.examId, item.studentId, item.subject, item.scope || ""].join("|"), item
  ])).values());
  const details = uniqueItems.map(item => {
    const student = studentsByIdCache.get(String(item.studentId));
    const exam = examsByIdCache.get(String(item.examId));
    return student && exam
      ? student.full_name + "（" + student.class_name + "／" + formatDateRange(exam) + "／" + item.subject + "）"
      : null;
  }).filter(Boolean);
  if (details.length !== uniqueItems.length) {
    showMessage("部分選取資料已不存在，請重新整理後再操作。", "error", true);
    return;
  }
  if (!confirm(
    "確定要批次排除這 " + uniqueItems.length + " 筆未登錄提醒嗎？\n\n" +
    details.slice(0, 8).join("\n") +
    (details.length > 8 ? "\n另有 " + (details.length - 8) + " 筆……" : "") +
    "\n\n只會排除提醒，不會刪除任何成績或學生資料。"
  )) return;

  const overviewScrollY = window.scrollY;
  const overviewFilters = {
    search: $("overviewSearch") ? $("overviewSearch").value : "",
    examId: $("overviewExam") ? $("overviewExam").value : "",
    className: $("overviewClass") ? $("overviewClass").value : "",
    subject: $("overviewSubject") ? $("overviewSubject").value : "",
    status: $("overviewStatus") ? $("overviewStatus").value : "all"
  };
  const excludedPanel = $("excludedRemindersPanel");
  const keepPanelOpen = !!(excludedPanel && excludedPanel.style.display !== "none");
  let successCount = 0;
  const failures = [];
  const knownExclusionIds = new Set(
    missingExclusionsCache.map(row => String(row.id))
  );

  for (const item of uniqueItems) {
    try {
      const result = await db.from("score_missing_exclusions")
        .insert({
          exam_id: item.examId,
          student_id: item.studentId,
          subject: item.subject,
          scope: item.scope || ""
        })
        .select("id, exam_id, student_id, subject, scope")
        .single();

      let exclusionRow = result.data;
      if (result.error) {
        if (result.error.code === "23505") {
          const existing = await db.from("score_missing_exclusions")
            .select("id, exam_id, student_id, subject, scope")
            .eq("exam_id", item.examId)
            .eq("student_id", item.studentId)
            .eq("subject", item.subject)
            .eq("scope", item.scope || "")
            .maybeSingle();
          if (existing.error) throw existing.error;
          exclusionRow = existing.data;
        } else {
          throw result.error;
        }
      }
      if (!exclusionRow) throw new Error("無法確認排除紀錄");
      const exclusionId = String(exclusionRow.id);
      if (!knownExclusionIds.has(exclusionId)) {
        missingExclusionsCache.push(exclusionRow);
        knownExclusionIds.add(exclusionId);
      }
      successCount++;
    } catch (error) {
      const student = studentsByIdCache.get(String(item.studentId));
      failures.push((student ? student.full_name : item.studentId) + "：" + error.message);
    }
  }

  renderOverview(overviewFilters, keepPanelOpen);
  window.scrollTo({ top: overviewScrollY, behavior: "auto" });
  if (failures.length) {
    showMessage("批次排除完成：成功 " + successCount + " 筆，失敗 " + failures.length + " 筆。\n" +
      failures.slice(0, 5).join("\n"), "error", true);
  } else {
    showMessage("已成功排除 " + successCount + " 筆未登錄提醒。", "success", true);
  }
}

// ==================================================
// 7-0-1. 排除單筆未登錄提醒
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
  const student = studentsByIdCache.get(String(item.studentId));
  const exam = examsByIdCache.get(String(item.examId));
  if (!student || !exam) {
    showMessage("找不到學生或考試資料，請重新整理。", "error");
    return;
  }

  const confirmed = confirm(
    "確定要排除此筆未登錄提醒嗎？\n\n" +
    "學生：" + student.full_name + "\n" +
    "班級：" + student.class_name + "\n" +
    "考試：" + formatDateRange(exam) + "\n" +
    "科目：" + item.subject + "\n" +
    "考試範圍：" + (item.scope || "—") + "\n\n" +
    "只會排除此學生本次考試、此科目及範圍的提醒，不會刪除學生或成績資料。"
  );
  if (!confirmed) return;

  try {
    const result = await db.from("score_missing_exclusions")
      .insert({
        exam_id: item.examId,
        student_id: item.studentId,
        subject: item.subject,
        scope: item.scope || ""
      })
      .select("id, exam_id, student_id, subject, scope")
      .single();

    let exclusionRow = result.data;

    if (result.error) {
      // 若同一提醒已被其他管理員排除，將既有資料讀回即可，不執行 UPDATE。
      if (result.error.code === "23505") {
        const existing = await db.from("score_missing_exclusions")
          .select("id, exam_id, student_id, subject, scope")
          .eq("exam_id", item.examId)
          .eq("student_id", item.studentId)
          .eq("subject", item.subject)
          .eq("scope", item.scope || "")
          .maybeSingle();

        if (existing.error) throw existing.error;
        exclusionRow = existing.data;
      } else {
        throw result.error;
      }
    }

    if (!exclusionRow) {
      throw new Error("無法確認未登錄提醒的排除紀錄，請重新整理後再試。");
    }

    missingExclusionsCache = missingExclusionsCache.filter(function (row) {
      return !(
        String(row.exam_id) === String(item.examId) &&
        String(row.student_id) === String(item.studentId) &&
        row.subject === item.subject &&
        String(row.scope || "") === String(item.scope || "")
      );
    });
    missingExclusionsCache.push(exclusionRow);
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

  const student = studentsByIdCache.get(String(exclusion.student_id));
  const exam = examsByIdCache.get(String(exclusion.exam_id));
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

async function editScore(scoreId, missingEntry) {
  const isNewScore = !!missingEntry;
  const overviewScrollY = window.scrollY;
  const overviewFilters = {
    search: $("overviewSearch") ? $("overviewSearch").value : "",
    examId: $("overviewExam") ? $("overviewExam").value : "",
    className: $("overviewClass") ? $("overviewClass").value : "",
    subject: $("overviewSubject") ? $("overviewSubject").value : "",
    status: $("overviewStatus") ? $("overviewStatus").value : "all"
  };
  const score = isNewScore
    ? {
        student_id: missingEntry.studentId,
        exam_id: missingEntry.examId,
        subject: missingEntry.subject,
        scope: missingEntry.scope || "",
        score: null,
        correct_count: null,
        grade_level: null
      }
    : scoresByIdCache.get(String(scoreId));
  if (!score) {
    showMessage("找不到這筆成績資料，請重新整理。", "error");
    return;
  }
  const student = studentsByIdCache.get(String(score.student_id));
  const exam = examsByIdCache.get(String(score.exam_id));
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
      "<div class='score-edit-header'><div><h3 id='scoreEditTitle'>" + (isNewScore ? "新增未登錄成績" : "修改成績") + "</h3><p>" +
        escapeHtml(student.full_name) + "｜" + escapeHtml(student.class_name) + "｜" + escapeHtml(formatDateRange(exam)) +
      "</p></div><button type='button' class='score-edit-close' id='scoreEditClose' aria-label='關閉'>×</button></div>" +
      "<form id='scoreEditForm'>" +
        "<p id='scoreEditError' class='system-message error' style='display:none'></p>" +
        "<div class='field'><label for='scoreEditSubject'>科目</label><select id='scoreEditSubject' required>" + subjectOptions + "</select></div>" +
        "<div class='field'><label for='scoreEditScope'>考試範圍</label><input id='scoreEditScope' type='text' maxlength='120' required value='" + escapeHtml(score.scope || "") + "'></div>" +
        "<div id='scoreEditValueFields'></div>" +
        "<p class='score-edit-note'>" + (isNewScore ? "儲存後會新增這位學生的成績紀錄。" : "修改後會更新原有紀錄，不會新增另一筆成績。") + "</p>" +
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

    // 使用學生＋考試＋科目＋範圍複合索引檢查重複，避免每次修改都掃描整份成績快取。
    const duplicateScore = scoresByStudentExamSubjectScopeCache.get(
      getScoreCompositeKey(score.student_id, score.exam_id, subject, scope)
    );
    const hasOtherDuplicate = duplicateScore && (isNewScore || String(duplicateScore.id) !== String(scoreId));
    if (hasOtherDuplicate) {
      showScoreEditError("這位學生已有相同考試、科目及範圍的成績紀錄。請調整科目或考試範圍，避免重複資料。");
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
    if (!confirm((isNewScore ? "確認新增這筆成績嗎？" : "確認修改這筆成績嗎？") + "\n\n學生：" + student.full_name +
      "\n科目：" + subject + "\n考試範圍：" + scope + "\n成績：" + resultLabel +
      "\n\n" + (isNewScore ? "此操作會新增一筆成績紀錄。" : "此操作會更新原有資料，不會新增另一筆成績。"))) return;

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
      const result = isNewScore
        ? await db.from("scores")
            .insert({
              student_id: score.student_id,
              exam_id: score.exam_id,
              ...payload
            })
            .select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level")
            .single()
        : await db.from("scores")
            .update(payload)
            .eq("id", scoreId)
            .select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level")
            .single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("資料已送出，但未取得成績內容，請重新整理確認。");

      if (isNewScore) {
        // 新增成功後直接更新成績快取與索引，避免為單筆新增重新查詢整張成績表。
        upsertScoreToLocalCache(result.data);
      } else {
        // 更新複合索引時先移除舊鍵，再寫入新鍵，維持科目／範圍修改後的查找正確性。
        const previousCompositeKey = getScoreCompositeKey(
          score.student_id, score.exam_id, score.subject, score.scope
        );
        Object.assign(score, result.data);
        scoresByIdCache.set(String(scoreId), score);
        updateScoreCompositeIndex(score, previousCompositeKey);
        invalidateAdminHighestPreviewCache();
      }

      closeScoreEditModal();
      renderOverview(overviewFilters);
      showMessage(isNewScore
        ? "「" + student.full_name + "」的成績已新增成功。"
        : "「" + student.full_name + "」的成績已修改成功。", "success", true);
      window.scrollTo({ top: overviewScrollY, behavior: "auto" });
    } catch (error) {
      saveButton.disabled = false;
      saveButton.textContent = isNewScore ? "新增成績" : "儲存修改";
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
  const score = scoresByIdCache.get(String(scoreId));

  if (!score) {
    showMessage("找不到這筆成績資料，請重新整理。", "error");
    return;
  }

  const student = studentsByIdCache.get(String(score.student_id));
  const exam = examsByIdCache.get(String(score.exam_id));

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

    // 刪除成功後直接從本機成績快取移除，避免為單筆刪除重新下載全體成績。
    removeScoreFromLocalCache(scoreId);
    renderOverview(overviewFilters);

    // 成績總覽刪除後保留篩選條件與捲動位置，不顯示系統通知。
    const systemMessage = $("systemMessage");
    if (systemMessage) systemMessage.style.display = "none";
    window.scrollTo({ top: overviewScrollY, behavior: "auto" });

  } catch (error) {
    showMessage("刪除成績失敗：" + error.message, "error");
  }
}
