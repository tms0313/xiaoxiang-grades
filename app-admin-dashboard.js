// ==================================================
// 小象成績管理系統｜管理員主畫面模組
// 管理員頁籤導覽、路由切換及班級最高分預覽。
// 依賴 app.js 提供的全域狀態、快取與共用工具；在 app.js 前載入。
// ==================================================

const ADMIN_TAB_KEYS = new Set([
  "overview", "reviews", "scores", "termScores",
  "students", "attendance", "guardians", "teachers",
  "alumni", "export", "logs"
]);

function getAdminTabFromHash() {
  const match = String(window.location.hash || "").match(/^#admin\/([^/]+)$/);
  if (match && match[1] === "passwords") return "guardians";
  return match && ADMIN_TAB_KEYS.has(match[1]) ? match[1] : "";
}

function handleAdminTabHashChange() {
  const nextTab = getAdminTabFromHash();
  if (!nextTab || nextTab === activeTab || !document.getElementById("adminTabs")) return;
  activeTab = nextTab;
  renderAdminTab();
}

function renderAdminDashboard() {
  appRoot.innerHTML =
    "<div class='topbar'>" +
      "<div><h1>小象文教機構｜成績管理系統</h1><small>管理員後台</small></div>" +
      "<div><button class='tab-btn logout-action' id='logoutButton'>登出</button></div>" +
    "</div>" +
    "<main class='dashboard'>" +
      "<div id='systemMessage' class='system-message'></div>" +
      "<div class='tabs' id='adminTabs'>" +
        "<a class='tab-btn' href='#admin/overview' data-tab='overview'>週成績總覽</a>" +
        "<a class='tab-btn' href='#admin/reviews' data-tab='reviews'>週考檢閱紀錄</a>" +
        "<a class='tab-btn' href='#admin/scores' data-tab='scores'>週成績登錄</a><a class='tab-btn' href='#admin/termScores' data-tab='termScores'>段考成績登錄</a>" +
        "<a class='tab-btn' href='#admin/students' data-tab='students'>學生管理</a>" +
        "<a class='tab-btn' href='#admin/attendance' data-tab='attendance'>出缺席管理</a>" +
        
        "<a class='tab-btn' href='#admin/guardians' data-tab='guardians'>家長帳號管理</a>" +
        "<a class='tab-btn' href='#admin/teachers' data-tab='teachers'>教師管理</a>" +
        "<a class='tab-btn' href='#admin/alumni' data-tab='alumni'>模考成績</a>" +
        "<a class='tab-btn' href='#admin/export' data-tab='export'>成績匯出</a>" +
        "<a class='tab-btn' href='#admin/logs' data-tab='logs'>登入紀錄</a>" +
      "</div>" +
      "<section id='adminContent'></section>" +
    "</main>" +
    "<div class='footer'>© 小象文教機構</div>";

  $("logoutButton").addEventListener("click", handleLogout);

  activeTab = getAdminTabFromHash() || "overview";
  window.removeEventListener("hashchange", handleAdminTabHashChange);
  window.addEventListener("hashchange", handleAdminTabHashChange);

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

  // 僅更新管理員導覽列，避免掃描其他頁面的按鈕；每次切換只執行一個頁面渲染器。
  if (adminTabs) {
    adminTabs.querySelectorAll(".tab-btn").forEach(function (button) {
      button.classList.toggle("active", button.dataset.tab === activeTab);
    });
  }

  switch (activeTab) {
    case "overview":
      renderOverview();
      break;
    case "scores":
      renderScoreEntry();
      break;
    case "termScores":
      renderTermExamEntry();
      break;
    case "students":
      renderStudents();
      break;
    case "attendance":
      renderAttendanceManagement();
      break;
    case "guardians":
      renderGuardians();
      break;
    case "teachers":
      renderTeacherManagement();
      break;
    case "logs":
      renderLoginLogs();
      break;
    case "reviews":
      renderStudentReviewRecords();
      break;
    case "export":
      renderExport();
      break;
    case "alumni":
      renderAlumniMockScores();
      break;
  }
}

// ==================================================
// 管理員專用：班級最高分預覽
// 不受家長端週六 18:00 開放時間限制；不顯示其他學生個別成績。
// ==================================================

function renderAdminClassHighestPreview() {
  const content = $("adminContent");
  if (!content) return;

  // 考試索引已依日期排序；直接篩選並取前三筆，避免每次切換頁面重複排序。
  const latestThreeExams = examsByDateDescCache
    .filter(exam => exam.start_date || exam.end_date)
    .slice(0, 3);

  if (!latestThreeExams.length) {
    content.innerHTML =
      "<h2 class='section-title'>班級最高分預覽</h2>" +
      "<div class='empty'>目前沒有可預覽的考試週期。</div>";
    return;
  }

  const availableExamIds = latestThreeExams.map(exam => String(exam.id));
  if (!availableExamIds.includes(String(adminHighestPreviewExamId))) {
    adminHighestPreviewExamId = String(latestThreeExams[0].id);
  }

  const selectedExam = latestThreeExams.find(
    exam => String(exam.id) === String(adminHighestPreviewExamId)
  );

  const examOptions = latestThreeExams.map(function (exam) {
    return "<option value='" + escapeHtml(exam.id) + "'>" +
      escapeHtml(formatDateRange(exam)) + "</option>";
  }).join("");

  // 同一考試週期的最高分統計只計算一次；班級／科目篩選直接重用結果。
  const previewExamKey = String(selectedExam.id);
  let cachedPreview = adminHighestPreviewCache.get(previewExamKey);
  if (!cachedPreview) {
  // 重用管理員資料載入時建立的學生 ID 索引，避免每次切換考試重新建 Map。
  const studentMap = studentsByIdCache;
  const groups = new Map();

  scoresCache.forEach(function (score) {
    if (String(score.exam_id) !== String(selectedExam.id)) return;
    if (score.grade_level === "請假" || score.grade_level === "缺考") return;

    const student = studentMap.get(String(score.student_id));
    if (!student || !student.class_name) return;

    const grade3NonMath =
      isGrade3Class(student.class_name) && score.subject !== "數學";
    const rawValue = grade3NonMath ? score.correct_count : score.score;
    if (rawValue === null || rawValue === undefined || rawValue === "") return;

    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;

    const scope = String(score.scope || "");
    // 補考成績保留在學生個人成績中，但不參與班級最高分比序。
    if (scope.includes("補考")) return;
    const key = JSON.stringify([
      student.class_name,
      score.subject,
      scope
    ]);

    if (!groups.has(key)) {
      groups.set(key, {
        className: student.class_name,
        subject: score.subject,
        scope: scope,
        valueUnit: grade3NonMath ? "題" : "分",
        highestValue: value,
        highestGradeLevel: score.grade_level || null,
        highestStudentName: student.full_name || "未命名學生",
        validCount: 1
      });
      return;
    }

    const group = groups.get(key);
    group.validCount += 1;

    if (
      value > group.highestValue ||
      (
        value === group.highestValue &&
        String(score.grade_level || "").localeCompare(
          String(group.highestGradeLevel || "")
        ) < 0
      )
    ) {
      group.highestValue = value;
      group.highestGradeLevel = score.grade_level || null;
      group.highestStudentName = student.full_name || "未命名學生";
    }
  });

  const classOrder = ["國一班", "國二班", "國三班"];
  const rows = Array.from(groups.values()).sort(function (a, b) {
    const classDiff =
      classOrder.indexOf(a.className) - classOrder.indexOf(b.className);
    if (classDiff !== 0) {
      if (classOrder.includes(a.className) && classOrder.includes(b.className)) {
        return classDiff;
      }
      if (classOrder.includes(a.className)) return -1;
      if (classOrder.includes(b.className)) return 1;
      return a.className.localeCompare(b.className, "zh-Hant");
    }

    const subjectDiff =
      SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject);
    if (subjectDiff !== 0) return subjectDiff;
    return a.scope.localeCompare(b.scope, "zh-Hant");
  });
    cachedPreview = { rows: rows };
    adminHighestPreviewCache.set(previewExamKey, cachedPreview);
  }
  const rows = cachedPreview.rows;

  const availableClassNames = new Set(
    studentsCache.map(student => student.class_name).filter(Boolean)
  );
  const knownClassNames = new Set(classOrder);
  const classOptions = classOrder.filter(className => availableClassNames.has(className));
  const otherClassOptions = Array.from(availableClassNames)
    .filter(className => !knownClassNames.has(className))
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
  classOptions.push(...otherClassOptions);

  const filteredRows = rows.filter(function (item) {
    return (!adminHighestPreviewClassName || item.className === adminHighestPreviewClassName) &&
      (!adminHighestPreviewSubject || item.subject === adminHighestPreviewSubject);
  });

  const tableRows = filteredRows.map(function (item) {
    const isGrade3NonMath =
      item.valueUnit === "題";
    const highestText =
      escapeHtml(item.highestValue) + " " + item.valueUnit +
      (
        isGrade3NonMath && item.highestGradeLevel
          ? " " + gradeTag(item.highestGradeLevel)
          : ""
      );

    return "<tr>" +
      "<td>" + escapeHtml(item.className) + " " + escapeHtml(item.highestStudentName) + "</td>" +
      "<td>" + escapeHtml(item.subject) + "</td>" +
      "<td>" + escapeHtml(item.scope || "—") + "</td>" +
      "<td><strong>" + highestText + "</strong></td>" +
      "<td>" + escapeHtml(item.validCount) + " 筆</td>" +
    "</tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>班級最高分預覽</h2>" +
    "<p class='muted'>管理員測試功能：可提前查看計算結果，不受家長端週六 18:00 開放時間限制。此頁只顯示各班各科各範圍的最高成績，不列出其他學生的個別成績。</p>" +
    "<div class='toolbar'>" +
      "<label for='classHighestPreviewExam'><strong>考試週期</strong></label>" +
      "<select id='classHighestPreviewExam'>" + examOptions + "</select>" +
      "<label for='classHighestPreviewClass'><strong>班級</strong></label>" +
      "<select id='classHighestPreviewClass'><option value=''>全部班級</option>" +
        classOptions.map(className => "<option value='" + escapeHtml(className) + "'>" + escapeHtml(className) + "</option>").join("") +
      "</select>" +
      "<label for='classHighestPreviewSubject'><strong>科目</strong></label>" +
      "<select id='classHighestPreviewSubject'><option value=''>全部科目</option>" +
        SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") +
      "</select>" +
    "</div>" +
    "<div class='table-wrap'>" +
      "<table class='class-highest-preview-table'>" +
        "<thead><tr>" +
          "<th>班級／學生姓名</th><th>科目</th><th>範圍</th>" +
          "<th>班級最高</th><th>有效成績</th>" +
        "</tr></thead>" +
        "<tbody>" +
          (
            tableRows ||
            "<tr><td colspan='5' class='empty'>此考試週期目前沒有可計算的有效成績。</td></tr>"
          ) +
        "</tbody>" +
      "</table>" +
    "</div>";

  $("classHighestPreviewExam").value = adminHighestPreviewExamId;
  $("classHighestPreviewClass").value = adminHighestPreviewClassName;
  $("classHighestPreviewSubject").value = adminHighestPreviewSubject;

  $("classHighestPreviewExam").addEventListener("change", function () {
    adminHighestPreviewExamId = this.value;
    renderAdminClassHighestPreview();
  });
  $("classHighestPreviewClass").addEventListener("change", function () {
    adminHighestPreviewClassName = this.value;
    renderAdminClassHighestPreview();
  });
  $("classHighestPreviewSubject").addEventListener("change", function () {
    adminHighestPreviewSubject = this.value;
    renderAdminClassHighestPreview();
  });
}
