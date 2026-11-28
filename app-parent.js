function buildParentBottomNav() {
  return (
    "<nav class='parent-bottom-nav' aria-label='家長功能'>" +
      "<button class='parent-action-btn parent-password-btn parent-change-password' type='button' title='修改登入密碼' aria-label='修改登入密碼'>" +
        "<svg class='parent-action-icon' viewBox='0 0 24 24' aria-hidden='true'><path d='M7 10V7a5 5 0 0 1 10 0v3'/><rect x='4' y='10' width='16' height='11' rx='2'/><path d='M12 14v3'/></svg>" +
        "<span>修改密碼</span>" +
      "</button>" +
      "<button class='parent-action-btn parent-logout-btn parent-logout logout-action' type='button' title='登出系統' aria-label='登出系統'>" +
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
// 段考成績登錄結束
// ==================================================

// ==================================================
// 歷屆模考成績管理已移至 app-alumni-mock.js
// ==================================================

// ==================================================
// 15. 家長端畫面
// ==================================================

function getParentAttendanceMonthlyPeriod(taiwanDateTime) {
  const today = new Date(Date.UTC(
    Number(taiwanDateTime.year),
    Number(taiwanDateTime.month) - 1,
    Number(taiwanDateTime.day)
  ));
  const currentMonthFirst = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const firstSaturdayOffset = (6 - currentMonthFirst.getUTCDay() + 7) % 7;
  const releaseDate = new Date(currentMonthFirst);
  releaseDate.setUTCDate(releaseDate.getUTCDate() + firstSaturdayOffset);
  const todayISO = today.getUTCFullYear() + "-" +
    String(today.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(today.getUTCDate()).padStart(2, "0");
  const releaseISO = releaseDate.toISOString().slice(0, 10);
  const beforeCurrentRelease = todayISO < releaseISO ||
    (todayISO === releaseISO && Number(taiwanDateTime.hour) < 18);

  // 每月第一個週六 18:00 發布上個月統計，並持續顯示至下次月統計發布。
  const releaseMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  if (beforeCurrentRelease) releaseMonth.setUTCMonth(releaseMonth.getUTCMonth() - 1);
  const reportMonth = new Date(Date.UTC(releaseMonth.getUTCFullYear(), releaseMonth.getUTCMonth() - 1, 1));
  const start = reportMonth.toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(reportMonth.getUTCFullYear(), reportMonth.getUTCMonth() + 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  return {
    month: String(reportMonth.getUTCMonth() + 1) + "月",
    start: start,
    end: end
  };
}

function summarizeParentAttendanceRecords(records) {
  return (records || []).reduce(function (summary, record) {
    if (record.attendance_status === "normal") {
      summary.lateMinutes += Math.max(0, Number(record.late_minutes) || 0);
      if (record.checkin_status === "not_checked_in") summary.uncheckedCount++;
    }
    return summary;
  }, { lateMinutes: 0, uncheckedCount: 0 });
}

let parentDashboardRequestId = 0;
let parentExamReleaseRefreshTimer = null;

async function renderParentDashboard() {
  if (parentExamReleaseRefreshTimer) {
    window.clearTimeout(parentExamReleaseRefreshTimer);
    parentExamReleaseRefreshTimer = null;
  }
  const requestId = ++parentDashboardRequestId;
  document.body.classList.add("parent-page");
  const content = $("appRoot");

  if (!document.getElementById("parentAttendanceSummaryStyles")) {
    const attendanceStyle = document.createElement("style");
    attendanceStyle.id = "parentAttendanceSummaryStyles";
    attendanceStyle.textContent =
      ".parent-attendance-summary{margin:0 0 18px;padding:0}" +
      ".parent-attendance-summary-title{margin:0 0 10px;color:#526477;font-size: 20px;font-weight:800;line-height:1.4}" +
      ".parent-attendance-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}" +
      ".parent-attendance-stat{display:flex;flex-direction:row;align-items:center;gap:7px;min-width:0;padding:12px 14px;border:1px solid #dce5ed;border-radius:10px;background:#f5f8fb}" +
      " .parent-attendance-stat-label{color:#647487;font-size: 16px !important;font-weight:700;line-height:1.45}" +
      ".parent-attendance-stat-value{color:#31506c;font-size: 20px;font-weight:800;line-height:1.35;font-variant-numeric:tabular-nums}" +
      " .parent-attendance-stat-value small{font-size: 20px !important;font-weight:800 !important}" +
      ".parent-attendance-stat-value.attendance-alert{color:#bd3030;font-weight:600}" +
      ".parent-attendance-stat-value.attendance-alert small{color:inherit !important;font-weight:600 !important;opacity:1 !important}" +
      ".parent-attendance-empty,.parent-attendance-error{margin:0 0 16px;padding:11px 13px;border:1px solid #dce5ed;border-radius:10px;background:#f5f8fb;color:#647487;font-size: 14px;line-height:1.6}" +
      ".parent-attendance-error{border-color:#f0d0d0;background:#fff5f5;color:#a32626}" +
      "@media(max-width:380px){.parent-attendance-summary-grid{gap:7px}.parent-attendance-stat{padding:10px}.parent-attendance-stat-label{font-size: 16px}.parent-attendance-stat-value{font-size: 20px}.parent-attendance-stat-value small{font-size: 16px}}";
    document.head.appendChild(attendanceStyle);
  }

  const profileResult = await db
    .from("guardian_students")
    .select("student_id")
    .eq("guardian_id", currentUser.id);

  if (requestId !== parentDashboardRequestId) return;
  if (profileResult.error) {
    throw new Error("讀取家長學生綁定失敗：" + profileResult.error.message);
  }

  const studentIds = (profileResult.data || []).map(function (item) {
    return item.student_id;
  });

  // 尚未綁定學生的家長畫面
  if (requestId !== parentDashboardRequestId) return;
  if (studentIds.length === 0) {
    content.innerHTML =
      "<div class='topbar'>" +
        "<div class='parent-brand'><h1>小象文教機構 成績查詢系統</h1></div>" +
      "</div>" +
      "<main class='dashboard'>" +
        "<div class='system-message'>目前尚未綁定學生，請聯絡管理員協助處理。</div>" +
      "</main>" +
      buildParentBottomNav();

    bindParentActionButtons();
    return;
  }

  // 學生資料與考試清單互不依賴，並行讀取以縮短家長首頁等待時間。
  const [studentsResult, examsResult] = await Promise.all([
    db.from("students")
      .select("id, student_code, full_name, class_name")
      .in("id", studentIds)
      .order("student_code"),
    db.from("exams")
      .select("id, title, start_date, end_date")
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(3)
  ]);

  if (requestId !== parentDashboardRequestId) return;
  if (studentsResult.error) {
    throw new Error("讀取學生資料失敗：" + studentsResult.error.message);
  }
  if (examsResult.error) {
    throw new Error("讀取考試資料失敗：" + examsResult.error.message);
  }

  const parentStudents = studentsResult.data || [];
  // 考試清單已由資料庫依日期排序並限制最近三場，避免載入完整歷史考試資料。
  const latestThreeExams = examsResult.data || [];
  const reviewExamIds = latestThreeExams.map(function (exam) {
    return exam.id;
  });

  // 三項資料彼此獨立，並行讀取，避免家長首頁逐項等待網路往返。
  const parentDataRequestsPromise = Promise.all([
    reviewExamIds.length > 0
      ? fetchAllRows(() => db.from("scores")
          .select("id, student_id, exam_id, subject, scope, score, correct_count, grade_level")
          .in("student_id", studentIds)
          .in("exam_id", reviewExamIds)
          .order("id", { ascending: true }))
      : Promise.resolve({ data: [], error: null }),
    db.rpc("get_parent_class_scope_highest_scores"),
    reviewExamIds.length > 0 && studentIds.length > 0
      ? fetchAllRows(() => db.from("score_review_records")
          .select("exam_id, student_id, guardian_id, reviewed_at")
          .in("exam_id", reviewExamIds)
          .in("student_id", studentIds)
          .order("exam_id", { ascending: true })
          .order("student_id", { ascending: true })
          .order("guardian_id", { ascending: true }))
      : Promise.resolve({ data: [], error: null })
  ]);


  let cachedTaiwanDateTime = null;

  function getTaiwanDateTime() {
    if (cachedTaiwanDateTime) return cachedTaiwanDateTime;

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

    cachedTaiwanDateTime = result;
    return cachedTaiwanDateTime;
  }

  // 家長端僅顯示本週彙總，不呈現每日或逐堂明細。
  const taiwanToday = getTaiwanDateTime();
  const todayISO = taiwanToday.year + "-" + taiwanToday.month + "-" + taiwanToday.day;
  const currentDate = new Date(todayISO + "T00:00:00Z");
  const weekday = currentDate.getUTCDay();
  // 家長端持續顯示最近一次週六 18:00 已發布的出缺席週，直到下次發布。
  const latestReleasedSaturday = new Date(currentDate);
  const daysSinceSaturday = (weekday + 1) % 7;
  latestReleasedSaturday.setUTCDate(latestReleasedSaturday.getUTCDate() - daysSinceSaturday);
  if (weekday === 6 && Number(taiwanToday.hour) < 18) {
    latestReleasedSaturday.setUTCDate(latestReleasedSaturday.getUTCDate() - 7);
  }
  const weekStartDate = new Date(latestReleasedSaturday);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - 5);
  const weekStartISO = weekStartDate.toISOString().slice(0, 10);
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() + 6);
  const weekEndISO = weekStartDate.toISOString().slice(0, 10);
  const monthlyAttendancePeriod = getParentAttendanceMonthlyPeriod(taiwanToday);

  let parentAttendanceRecords = [];
  let parentAttendanceLoadError = null;
  let parentMonthlyAttendanceRecords = [];
  let parentMonthlyAttendanceLoadError = null;
  // 週統計與月統計分別查詢，月統計依每月第一個週六 18:00 的發布週期計算。
  const [parentDataRequests, attendanceSessionsResult, monthlyAttendanceSessionsResult] = await Promise.all([
    parentDataRequestsPromise,
    db.from("attendance_sessions")
      .select("id")
      .gte("session_date", weekStartISO)
      .lte("session_date", weekEndISO),
    db.from("attendance_sessions")
      .select("id")
      .gte("session_date", monthlyAttendancePeriod.start)
      .lte("session_date", monthlyAttendancePeriod.end)
  ]);

  if (requestId !== parentDashboardRequestId) return;
  if (attendanceSessionsResult.error) {
    parentAttendanceLoadError = attendanceSessionsResult.error;
  }
  if (monthlyAttendanceSessionsResult.error) {
    parentMonthlyAttendanceLoadError = monthlyAttendanceSessionsResult.error;
  }

  const weeklySessionIds = attendanceSessionsResult.error
    ? []
    : (attendanceSessionsResult.data || []).map(item => item.id);
  const monthlySessionIds = monthlyAttendanceSessionsResult.error
    ? []
    : (monthlyAttendanceSessionsResult.data || []).map(item => item.id);

  const attendanceRecordRequests = await Promise.all([
    weeklySessionIds.length
      ? fetchAllRows(() => db.from("attendance_records")
          .select("student_id,attendance_status,late_minutes,checkin_status")
          .in("session_id", weeklySessionIds)
          .in("student_id", studentIds))
      : Promise.resolve({ data: [], error: null }),
    monthlySessionIds.length
      ? fetchAllRows(() => db.from("attendance_records")
          .select("student_id,attendance_status,late_minutes,checkin_status")
          .in("session_id", monthlySessionIds)
          .in("student_id", studentIds))
      : Promise.resolve({ data: [], error: null })
  ]);
  if (requestId !== parentDashboardRequestId) return;

  if (attendanceRecordRequests[0].error) {
    parentAttendanceLoadError = attendanceRecordRequests[0].error;
  } else {
    parentAttendanceRecords = attendanceRecordRequests[0].data || [];
  }
  if (attendanceRecordRequests[1].error) {
    parentMonthlyAttendanceLoadError = attendanceRecordRequests[1].error;
  } else {
    parentMonthlyAttendanceRecords = attendanceRecordRequests[1].data || [];
  }

  const scoresResult = parentDataRequests[0];
  const highestScoresResult = parentDataRequests[1];
  const reviewResult = parentDataRequests[2];

  if (scoresResult.error) {
    throw new Error("讀取成績資料失敗：" + scoresResult.error.message);
  }
  if (highestScoresResult.error) {
    throw new Error("讀取班級最高分失敗：" + highestScoresResult.error.message);
  }
  if (reviewResult.error) {
    throw new Error("讀取成績檢閱紀錄失敗：" + reviewResult.error.message);
  }

  const parentScores = scoresResult.data || [];
  // RPC 僅回傳已綁定孩子所在班級的最高分統計，不讀取其他學生的個別成績。
  const parentClassHighestScores = highestScoresResult.data || [];
  const parentReviewRecords = reviewResult.data || [];

  // 將家長端成績、班級最高分及檢閱紀錄建立索引，避免每張成績卡反覆掃描陣列。
  const parentStudentExamKey = (studentId, examId) =>
    JSON.stringify([String(studentId), String(examId)]);
  const parentHighestScoreKey = (studentId, examId, subject, scope) =>
    JSON.stringify([String(studentId), String(examId), String(subject), String(scope || "")]);

  const parentScoresByStudentExam = new Map();
  parentScores.forEach(function (score) {
    const key = parentStudentExamKey(score.student_id, score.exam_id);
    if (!parentScoresByStudentExam.has(key)) parentScoresByStudentExam.set(key, []);
    parentScoresByStudentExam.get(key).push(score);
  });

  const parentHighestScoreByKey = new Map();
  parentClassHighestScores.forEach(function (item) {
    const key = parentHighestScoreKey(item.student_id, item.exam_id, item.subject, item.scope);
    if (!parentHighestScoreByKey.has(key)) parentHighestScoreByKey.set(key, item);
  });

  const parentReviewByStudentExam = new Map();
  parentReviewRecords.forEach(function (record) {
    const key = parentStudentExamKey(record.student_id, record.exam_id);
    if (!parentReviewByStudentExam.has(key)) parentReviewByStudentExam.set(key, record);
  });

  function findClassHighestScore(student, exam, score) {
    return parentHighestScoreByKey.get(
      parentHighestScoreKey(student.id, exam.id, score.subject, score.scope)
    );
  }

  function findReviewRecord(student, exam) {
    return parentReviewByStudentExam.get(parentStudentExamKey(student.id, exam.id));
  }


  const parentAttendanceByStudent = new Map();
  parentAttendanceRecords.forEach(function (record) {
    const key = String(record.student_id);
    if (!parentAttendanceByStudent.has(key)) {
      parentAttendanceByStudent.set(key, { recordCount: 0, lateMinutes: 0, uncheckedCount: 0 });
    }
    const summary = parentAttendanceByStudent.get(key);
    summary.recordCount++;
    if (record.attendance_status === "normal") {
      summary.lateMinutes += Math.max(0, Number(record.late_minutes) || 0);
      if (record.checkin_status === "not_checked_in") summary.uncheckedCount++;
    }
  });

  const parentMonthlyAttendanceByStudent = new Map();
  const parentMonthlyRecordsByStudent = new Map();
  parentMonthlyAttendanceRecords.forEach(function (record) {
    const key = String(record.student_id);
    if (!parentMonthlyRecordsByStudent.has(key)) parentMonthlyRecordsByStudent.set(key, []);
    parentMonthlyRecordsByStudent.get(key).push(record);
  });
  parentMonthlyRecordsByStudent.forEach(function (records, studentId) {
    parentMonthlyAttendanceByStudent.set(studentId, summarizeParentAttendanceRecords(records));
  });

  function buildParentAttendanceSummary(student) {
    // 顯示最近一次週六 18:00 已發布的出缺席週，並明確標示實際統計日期。
    const periodLabel = weekStartISO.replace(/-/g, "/").slice(5) + "～" + weekEndISO.replace(/-/g, "/").slice(5);
    const sectionStart =
      "<section class='parent-attendance-summary' aria-label='出缺席統計：" + periodLabel + "'>" +
        "<h3 class='parent-attendance-summary-title'>出缺席統計（" + periodLabel + "）</h3>";
    const monthlySummary = parentMonthlyAttendanceByStudent.get(String(student.id)) || {
      lateMinutes: 0,
      uncheckedCount: 0
    };
    const monthlySection =
      "<h3 class='parent-attendance-summary-title parent-attendance-month-title'>" +
        monthlyAttendancePeriod.month + "整月統計</h3>" +
      (parentMonthlyAttendanceLoadError
        ? "<div class='parent-attendance-error' role='alert'>整月出缺席資料暫時無法讀取，請稍後再試。</div>"
        : "<div class='parent-attendance-summary-grid'>" +
            "<div class='parent-attendance-stat'>" +
              "<span class='parent-attendance-stat-label'>遲到共計</span>" +
              "<span class='parent-attendance-stat-value" + (monthlySummary.lateMinutes > 0 ? " attendance-alert" : "") + "'>" +
                monthlySummary.lateMinutes + " <small>分鐘</small></span>" +
            "</div>" +
            "<div class='parent-attendance-stat'>" +
              "<span class='parent-attendance-stat-label'>未打卡共計</span>" +
              "<span class='parent-attendance-stat-value" + (monthlySummary.uncheckedCount > 0 ? " attendance-alert" : "") + "'>" +
                monthlySummary.uncheckedCount + " <small>次</small></span>" +
            "</div>" +
          "</div>");

    if (parentAttendanceLoadError) {
      return sectionStart +
        "<div class='parent-attendance-error' role='alert'>出缺席資料暫時無法讀取，請稍後再試。</div>" +
        monthlySection +
      "</section>";
    }

    // 即使本週尚無紀錄，也顯示摘要欄位，讓家長清楚知道目前沒有遲到或未打卡資料。
    const summary = parentAttendanceByStudent.get(String(student.id)) || {
      recordCount: 0,
      lateMinutes: 0,
      uncheckedCount: 0
    };
    const hasLate = summary.lateMinutes > 0;
    return (
      sectionStart +
        "<div class='parent-attendance-summary-grid'>" +
          "<div class='parent-attendance-stat'>" +
            "<div><span class='parent-attendance-stat-label'>" + (hasLate ? "遲到" : "無遲到紀錄") + "</span></div>" +
            "<span class='parent-attendance-stat-value" + (hasLate ? " attendance-alert" : "") + "'>" +
              (hasLate ? summary.lateMinutes + " <small>分鐘</small>" : "") + "</span>" +
          "</div>" +
          "<div class='parent-attendance-stat'>" +
            "<span class='parent-attendance-stat-label'>未打卡</span>" +
            "<span class='parent-attendance-stat-value" + (summary.uncheckedCount > 0 ? " attendance-alert" : "") + "'>" +
              summary.uncheckedCount + " <small>次</small></span>" +
          "</div>" +
        "</div>" +
        monthlySection +
      "</section>"
    );
  }

  const releasedExamCache = new Map();

  function isExamReleased(exam) {
    const examKey = String(exam && exam.id || "");
    if (examKey && releasedExamCache.has(examKey)) {
      return releasedExamCache.get(examKey);
    }

    const released = isExamReleasedAt(exam, new Date());
    if (examKey) releasedExamCache.set(examKey, released);
    return released;
  }

  function getStudentScores(student, exam) {
    return parentScoresByStudentExam.get(parentStudentExamKey(student.id, exam.id)) || [];
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
    // 國三家長端依科目分組排序；同科目內保留原本範圍順序。
    const displayScores = isGrade3Class(student.class_name)
      ? scores.slice().sort(function (a, b) {
          return SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject);
        })
      : scores;
    return (
      "<div class='parent-score-list'>" +
      displayScores.map(function (score) {
        const grade3 = isGrade3Class(student.class_name);
        const grade3Math = isGrade3Math(student.class_name, score.subject);
        let resultText = "";
        if (score.grade_level === "請假") {
          resultText = gradeTag("請假");
        } else if (score.grade_level === "缺考") {
          resultText = "<span class=\"parent-score-number\">" + (grade3 && !grade3Math ? "0 題" : "0 分") + "</span> " + gradeTag("缺考");
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
        const classHighest = findClassHighestScore(student, exam, score);
        const isMakeupScore = String(score.scope || "").includes("補考");
        const ownScoreValue = grade3 && !grade3Math
          ? score.correct_count
          : score.score;
        const isClassHighest =
          !isMakeupScore &&
          score.grade_level !== "請假" &&
          score.grade_level !== "缺考" &&
          ownScoreValue !== null &&
          ownScoreValue !== undefined &&
          classHighest &&
          classHighest.highest_score !== null &&
          classHighest.highest_score !== undefined &&
          Number(ownScoreValue) === Number(classHighest.highest_score);
        if (isClassHighest) {
          resultText =
            "<span class='parent-score-crowned'>" +
              "<span class='parent-highest-crown' role='img' aria-label='班級最高分'>" +
                "<svg viewBox='0 0 32 27' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>" +
                  "<defs>" +
                    "<linearGradient id='crownGold' x1='0' y1='0' x2='0.9' y2='1'><stop offset='0' stop-color='#FFF2A6'/><stop offset='.42' stop-color='#F6C844'/><stop offset='1' stop-color='#C98216'/></linearGradient>" +
                    "<linearGradient id='crownBand' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#FFE68A'/><stop offset='1' stop-color='#D9951D'/></linearGradient>" +
                  "</defs>" +
                  "<path d='M3 21 1.8 7.2 9 12.2 15.8 2.8 23 12.2 30.2 7.2 29 21Z' fill='url(#crownGold)' stroke='#A96812' stroke-width='1.15' stroke-linejoin='round'/>" +
                  "<path d='m3.5 19.2 5.2-5.1 3.3 5.1H3.5Zm12.3 0 3.3-5.1 5.2 5.1h-8.5Z' fill='#FFE78A' opacity='.72'/>" +
                  "<path d='M2.8 21h26.4v3.1H2.8z' rx='1' fill='url(#crownBand)' stroke='#A96812' stroke-width='.9'/>" +
                  "<path d='m16 7.1 2.5 3.1-2.5 3.1-2.5-3.1Z' fill='#D93636' stroke='#9D2028' stroke-width='.7'/>" +
                  "<path d='m8.2 11.1 1.9 2.2-1.9 2.2-1.9-2.2Z' fill='#38A96A' stroke='#187344' stroke-width='.65'/>" +
                  "<path d='m23.8 11.1 1.9 2.2-1.9 2.2-1.9-2.2Z' fill='#38A96A' stroke='#187344' stroke-width='.65'/>" +
                  "<path d='M16 1v-1.4M1.2 5.2 0 4.1M30.8 5.2 32 4.1' stroke='#F4C94F' stroke-width='1.2' stroke-linecap='round'/>" +
                  "<path d='m16 1.1.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2Z' fill='#FFF3B0'/>" +
                "</svg>" +
              "</span>" +
              resultText +
            "</span>";
        }
        const highestText = !isMakeupScore && classHighest && classHighest.highest_score != null
          ? escapeHtml(classHighest.highest_score) +
            (classHighest.value_unit === "題" ? " 題" : " 分") +
            (grade3 && classHighest.highest_grade_level
              ? " " + gradeTag(classHighest.highest_grade_level)
              : "")
          : "—";
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
              (isMakeupScore ? "" :
                "<div class='parent-subject-result-label' style='margin-top:7px'>班級最高</div>" +
                "<div class='parent-subject-result-value' style='font-size:14px;color:#315d86;font-weight:800'>" + highestText + "</div>") +
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
              : "<div class='empty'>本週考試成績將於週六 18:00 開放查詢。</div>"
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
        buildParentAttendanceSummary(student) +
        examCards +
      "</div>"
    );
  }).join("");

  content.innerHTML =
    "<div class='topbar'>" +
      "<div class='parent-brand'><h1>小象文教機構 成績查詢系統</h1></div>" +
    "</div>" +
    "<main class='dashboard'>" +
      studentCards +
    "</main>" +
    "<div class='footer'>© 小象文教機構</div>" +
    buildParentBottomNav();

  bindParentActionButtons();

  content.querySelectorAll(".parent-review-btn").forEach(function (button) {
    button.addEventListener("click", async function () {
      if (button.disabled) return;

      const studentId = button.dataset.reviewStudent;
      const examId = button.dataset.reviewExam;
      if (!studentId || !examId) return;

      button.disabled = true;
      button.textContent = "正在儲存……";
      const sessionGeneration = appSessionGeneration;
      const sessionUserId = currentUser && currentUser.id;

      try {
        const result = await db
          .from("score_review_records")
          .insert({
            exam_id: examId,
            student_id: studentId,
            guardian_id: currentUser.id
          });

        if (result.error && result.error.code !== "23505") {
          throw new Error(result.error.message);
        }
        if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;

        button.textContent = "已完成本週成績查閱";
        button.disabled = true;
      } catch (error) {
        if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
        button.disabled = false;
        button.textContent = "我已查閱本週成績";
        alert("儲存檢閱紀錄失敗：" + (error && error.message ? error.message : "請確認網路連線後重試。"));
      }
    });
  });

  // 家長已登入時，若最新考試尚未到週六 18:00，於開放時間自動重新載入一次。
  // 只安排最近一個未來發布時間，避免長時間輪詢或重複計時器。
  const nowTimestamp = Date.now();
  const nextExamReleaseTimestamp = latestThreeExams.reduce(function (nextTimestamp, exam) {
    const releaseTimestamp = getExamReleaseTimestamp(exam);
    return releaseTimestamp !== null && releaseTimestamp > nowTimestamp &&
      (!nextTimestamp || releaseTimestamp < nextTimestamp)
      ? releaseTimestamp
      : nextTimestamp;
  }, null);

  if (nextExamReleaseTimestamp) {
    parentExamReleaseRefreshTimer = window.setTimeout(function () {
      parentExamReleaseRefreshTimer = null;
      if (currentProfile && currentProfile.role === "parent" && currentUser) {
        renderParentDashboard().catch(function (error) {
          console.error("家長成績開放後自動更新失敗：", error);
        });
      }
    }, Math.max(0, nextExamReleaseTimestamp - Date.now()));
  }
}
