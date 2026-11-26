async function renderTeacherDashboard() {
  // 教師模式啟動時，使尚未完成的家長頁面請求失效。
  parentDashboardRequestId++;
  // 防止快速切換模式時，較晚回來的舊請求覆蓋最新教師畫面。
  const requestId = ++teacherDashboardRequestId;
  document.body.classList.remove("parent-page");
  document.body.classList.add("teacher-page");
  // 教師查詢頁背景直接套用至 html、body 與應用根節點，避免外層畫布沿用深藍背景。
  document.documentElement.style.setProperty("background-color", "#f3f5f8", "important");
  document.body.style.setProperty("background-color", "#f3f5f8", "important");
  appRoot.style.setProperty("background-color", "#f3f5f8", "important");
  showLoading("正在載入教師授課資料……");

  // 先取得教師授課範圍，後續學生與修課查詢只載入相關班級／科目。
  const assignmentsResult = await db
    .from("teacher_assignments")
    .select("id, teacher_id, class_name, subject");
  if (assignmentsResult.error) {
    throw new Error("授課權限讀取失敗：" + assignmentsResult.error.message);
  }
  if (requestId !== teacherDashboardRequestId) return;

  teacherAssignmentsCache = assignmentsResult.data || [];
  if (!teacherAssignmentsCache.length) {
    teacherStudentsCache = [];
    teacherExamsCache = [];
    teacherExamsByIdCache = new Map();
    teacherExamOptionsCache = "";
    teacherStudentSubjectsCache = [];
    teacherScoresCache = [];
    teacherPermittedSubjectsByClass = new Map();
    teacherStudentsByClassSubject = new Map();
    teacherScoresByStudentExamSubject = new Map();
    appRoot.innerHTML =
      "<div class='topbar'><div><h1>小象文教機構｜教師專區 僅供查詢</h1><small>教師專區</small></div>" +
      "<main class='dashboard'><div class='system-message' style='display:block'>目前尚未設定授課權限，請聯絡管理員。</div></main>" +
      buildParentBottomNav();
    bindParentActionButtons();
    return;
  }

  const permittedClassesForQuery = Array.from(new Set(teacherAssignmentsCache.map(item => item.class_name).filter(Boolean)));
  const permittedSubjectsForQuery = Array.from(new Set(teacherAssignmentsCache.map(item => item.subject).filter(Boolean)));
  const results = await Promise.all([
    db.from("students")
      .select("id, class_name, student_code, full_name")
      .eq("is_active", true)
      .in("class_name", permittedClassesForQuery)
      .order("student_code"),
    db.from("exams").select("id, start_date, end_date"),
    db.from("student_subjects")
      .select("student_id, subject")
      .eq("is_active", true)
      .in("subject", permittedSubjectsForQuery)
  ]);

  if (requestId !== teacherDashboardRequestId) return;

  const labels = ["學生資料", "考試資料", "學生修課資料"];
  for (let i = 0; i < results.length; i++) {
    if (results[i].error) {
      throw new Error(labels[i] + "讀取失敗：" + results[i].error.message);
    }
  }

  teacherStudentsCache = results[0].data || [];
  teacherExamsCache = (results[1].data || []).sort(function (a, b) {
    return String(b.end_date || b.start_date || "").localeCompare(String(a.end_date || a.start_date || ""));
  });
  teacherExamsByIdCache = new Map(teacherExamsCache.map(exam => [String(exam.id), exam]));
  teacherExamOptionsCache = teacherExamsCache.map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");
  teacherStudentSubjectsCache = results[2].data || [];

  // 只查詢有授課權限且學生實際有修習的班級／科目組合；每批最多 200 位學生。
  const activeSubjectsByStudent = new Map();
  teacherStudentSubjectsCache.forEach(function (item) {
    const studentId = String(item.student_id);
    if (!activeSubjectsByStudent.has(studentId)) activeSubjectsByStudent.set(studentId, new Set());
    activeSubjectsByStudent.get(studentId).add(item.subject);
  });

  const teacherScoreQueries = [];
  const teacherAssignmentKeys = new Set();
  teacherAssignmentsCache.forEach(function (assignment) {
    const assignmentKey = JSON.stringify([assignment.class_name, assignment.subject]);
    if (teacherAssignmentKeys.has(assignmentKey)) return;
    teacherAssignmentKeys.add(assignmentKey);

    const studentIds = teacherStudentsCache
      .filter(function (student) {
        const activeSubjects = activeSubjectsByStudent.get(String(student.id));
        return student.class_name === assignment.class_name &&
          activeSubjects && activeSubjects.has(assignment.subject);
      })
      .map(student => String(student.id));

    for (let i = 0; i < studentIds.length; i += 200) {
      const batchIds = studentIds.slice(i, i + 200);
      teacherScoreQueries.push(function () {
        return fetchAllRows(() =>
          db.from("scores")
            .select("student_id, exam_id, subject, scope, grade_level, score, correct_count")
            .eq("subject", assignment.subject)
            .in("student_id", batchIds)
            .order("student_id", { ascending: true })
            .order("exam_id", { ascending: true })
            .order("scope", { ascending: true })
        );
      });
    }
  });

  const teacherScoreResults = [];
  const teacherScoreConcurrency = 6;
  for (let i = 0; i < teacherScoreQueries.length; i += teacherScoreConcurrency) {
    const batchResults = await Promise.all(
      teacherScoreQueries.slice(i, i + teacherScoreConcurrency).map(query => query())
    );
    teacherScoreResults.push(...batchResults);
  }

  for (const result of teacherScoreResults) {
    if (result.error) throw new Error("成績資料讀取失敗：" + result.error.message);
  }
  teacherScoresCache = teacherScoreResults.flatMap(result => result.data || []);

  // 教師頁切換考試或班級時重用授課、修課與成績索引，避免每次重新掃描完整快取。
  teacherPermittedSubjectsByClass = new Map();
  teacherAssignmentsCache.forEach(function (item) {
    if (!teacherPermittedSubjectsByClass.has(item.class_name)) {
      teacherPermittedSubjectsByClass.set(item.class_name, new Set());
    }
    teacherPermittedSubjectsByClass.get(item.class_name).add(item.subject);
  });

  teacherStudentsByClassSubject = new Map();
  const teacherActiveSubjectsByStudent = new Map();
  teacherStudentSubjectsCache.forEach(function (item) {
    const studentId = String(item.student_id);
    if (!teacherActiveSubjectsByStudent.has(studentId)) {
      teacherActiveSubjectsByStudent.set(studentId, new Set());
    }
    teacherActiveSubjectsByStudent.get(studentId).add(item.subject);
  });
  teacherStudentsCache.forEach(function (student) {
    const activeSubjects = teacherActiveSubjectsByStudent.get(String(student.id));
    if (!activeSubjects) return;
    SUBJECTS.forEach(function (subject) {
      if (!activeSubjects.has(subject)) return;
      const key = JSON.stringify([student.class_name, subject]);
      if (!teacherStudentsByClassSubject.has(key)) teacherStudentsByClassSubject.set(key, []);
      teacherStudentsByClassSubject.get(key).push(student);
    });
  });

  teacherScoresByStudentExamSubject = new Map();
  teacherScoresCache.forEach(function (item) {
    const key = JSON.stringify([String(item.student_id), String(item.exam_id), item.subject]);
    if (!teacherScoresByStudentExamSubject.has(key)) {
      teacherScoresByStudentExamSubject.set(key, []);
    }
    teacherScoresByStudentExamSubject.get(key).push(item);
  });

  teacherSelectedExamId = teacherExamsCache.length ? String(teacherExamsCache[0].id) : "";
  renderTeacherResults();
}

function renderTeacherResults() {
  const examOptions = teacherExamOptionsCache;

  const selectedExam = teacherExamsByIdCache.get(String(teacherSelectedExamId)) || null;

  const scoreKey = (studentId, examId, subject) =>
    JSON.stringify([String(studentId), String(examId), subject]);

  const permittedClasses = Array.from(teacherPermittedSubjectsByClass.keys());
  const classOrder = ["國一班", "國二班", "國三班"];
  const visibleClasses = classOrder.filter(function (className) {
    return permittedClasses.includes(className) &&
      (!teacherSelectedClassName || teacherSelectedClassName === className);
  });

  const classSections = visibleClasses.map(function (className) {
    const permittedSubjects = teacherPermittedSubjectsByClass.get(className) || new Set();
    const subjects = SUBJECTS.filter(subject => permittedSubjects.has(subject));

    const subjectSections = subjects.map(function (subject) {
      const students = teacherStudentsByClassSubject.get(JSON.stringify([className, subject])) || [];

      const groups = new Map();
      students.forEach(function (student) {
        const studentScores = selectedExam
          ? (teacherScoresByStudentExamSubject.get(scoreKey(student.id, selectedExam.id, subject)) || [])
          : [];

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
          teacherStudentCodeCollator.compare(a.code, b.code) ||
          teacherStudentNameCollator.compare(String(a.student.full_name || ""), String(b.student.full_name || ""))
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
    "<div class='topbar'><div><h1>小象文教機構｜教師專區 僅供查詢</h1></div></div>" +
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
    await renderDashboard();
  });
}
