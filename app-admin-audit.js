// ==================================================
// 13. 登入紀錄
// ==================================================

async function renderLoginLogs() {
  const content = $("adminContent");

  content.innerHTML =
    "<h2 class='section-title'>登入紀錄</h2>" +
    "<div class='empty'>正在讀取登入紀錄……</div>";

  try {
    // 先取得最近 200 筆登入紀錄，再只查這批紀錄涉及的帳號，避免傳輸整張 profiles。
    const logsResult = await db.from("login_events")
      .select("user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (logsResult.error) throw logsResult.error;

    const logs = logsResult.data || [];
    const loggedUserIds = Array.from(new Set(
      logs.map(log => String(log.user_id)).filter(Boolean)
    ));
    let profilesById = new Map();
    if (loggedUserIds.length) {
      const profilesResult = await db.from("profiles")
        .select("id, role, email")
        .in("id", loggedUserIds);
      if (profilesResult.error) throw profilesResult.error;
      profilesById = new Map((profilesResult.data || []).map(profile => [String(profile.id), profile]));
    }
    const studentsById = studentsByIdCache;
    const studentNamesByGuardian = new Map();

    // 每位家長的綁定學生姓名只整理一次，避免每筆登入紀錄重複 map／Set。
    guardianLinksCache.forEach(link => {
      const guardianId = String(link.guardian_id);
      const student = studentsById.get(String(link.student_id));
      if (!student) return;
      if (!studentNamesByGuardian.has(guardianId)) studentNamesByGuardian.set(guardianId, new Set());
      studentNamesByGuardian.get(guardianId).add(student.full_name);
    });
    const linkedStudentNamesByGuardian = new Map();
    studentNamesByGuardian.forEach((names, guardianId) => {
      linkedStudentNamesByGuardian.set(guardianId, Array.from(names).join("、"));
    });

    // 日期格式器與教師名稱索引在整次渲染共用，避免每筆登入紀錄重複建立。
    const logDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
    });
    const logDateDisplayFormatter = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric"
    });
    const logTimeDisplayFormatter = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    const teacherNamesByEmail = {
      "black951165@gmail.com": "王炫老師",
      "tingning1995120@gmail.com": "溫老師",
      "nice0220@hotmail.com": "林一老師"
    };

    const rows = logs.map(function (log) {
      const profile = profilesById.get(String(log.user_id));

      let loginIdentity = "未知帳號";
      let loginRoleLabel = "未知";
      let loginRoleBadgeClass = "login-role-unknown";

      if (profile && profile.role === "admin") {
        loginRoleLabel = "管理員";
        loginRoleBadgeClass = "login-role-admin";
        loginIdentity = "";
      } else if (profile && profile.role === "teacher") {
        loginRoleLabel = "老師";
        loginRoleBadgeClass = "login-role-teacher";
        const teacherEmail = String(profile.email || "").trim().toLowerCase();
        loginIdentity = teacherNamesByEmail[teacherEmail] || profile.email || "教師帳號";
      } else {
        if (profile && profile.role === "parent") {
          loginRoleLabel = "家長";
          loginRoleBadgeClass = "login-role-parent";
        }
        loginIdentity = linkedStudentNamesByGuardian.get(String(log.user_id)) || "尚未綁定學生";
      }

      const logDate = log.created_at ? new Date(log.created_at) : null;
      const dateKey = logDate ? logDateKeyFormatter.format(logDate) : "";
      const displayTime = logDate
        ? logDateDisplayFormatter.format(logDate) + "　　" + logTimeDisplayFormatter.format(logDate)
        : "—";
      const searchText = [
        loginRoleLabel, loginIdentity, profile && profile.email, log.user_id
      ].filter(Boolean).join(" ").toLocaleLowerCase();

      return "<tr data-log-search='" + escapeHtml(searchText) + "' data-log-date='" + escapeHtml(dateKey) + "'><td><span class=\"login-role-badge " + loginRoleBadgeClass + "\">" + escapeHtml(loginRoleLabel) + "</span>" +
        (loginIdentity ? " " + escapeHtml(loginIdentity) : "") + "</td><td>" +
        escapeHtml(displayTime) + "</td></tr>";
    }).join("");

    content.innerHTML =
      "<h2 class='section-title'>登入紀錄</h2>" +
      "<div class='toolbar' style='display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap'>" +
        "<p class='muted' style='margin:0'>最近 200 筆登入紀錄（包含管理員、家長及教師）。</p>" +
        "<button class='btn btn-danger btn-small' type='button' id='clearLoginLogsButton'>清除全部登入紀錄</button>" +
      "</div>" +
      "<div class='login-log-legend'>" +
        "<span class='login-log-legend-item'><i class='login-log-legend-swatch login-log-legend-admin'></i>管理員</span>" +
        "<span class='login-log-legend-item'><i class='login-log-legend-swatch login-log-legend-parent'></i>家長</span>" +
        "<span class='login-log-legend-item'><i class='login-log-legend-swatch login-log-legend-teacher'></i>老師</span>" +
      "</div>" +
      "<div class='toolbar' style='display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0'>" +
        "<input id='loginLogKeyword' type='search' class='form-control' placeholder='搜尋家長／教師' style='flex:1;min-width:160px' autocomplete='off'>" +
        "<span id='loginLogResultCount' class='muted' style='white-space:nowrap'></span>" +
      "</div>" +
      "<div class='table-wrap'><table class='login-log-table'><thead><tr><th>登入身分</th><th>登入時間</th></tr></thead>" +
      "<tbody id='loginLogRows'>" + (rows || "<tr><td colspan='2' class='empty'>目前沒有登入紀錄</td></tr>") +
      "</tbody></table></div>";

    const clearButton = $("clearLoginLogsButton");
    if (clearButton) clearButton.addEventListener("click", clearAllLoginLogs);

    const keywordInput = $("loginLogKeyword");
    const resultCount = $("loginLogResultCount");
    const logRows = Array.from(content.querySelectorAll("#loginLogRows tr[data-log-search]"));
    const applyLogFilters = function () {
      const keyword = String(keywordInput && keywordInput.value || "").trim().toLocaleLowerCase();
      let visibleCount = 0;
      logRows.forEach(row => {
        const matchesKeyword = !keyword || String(row.dataset.logSearch || "").includes(keyword);
        row.hidden = !matchesKeyword;
        if (matchesKeyword) visibleCount += 1;
      });
      if (resultCount) resultCount.textContent = "符合 " + visibleCount + "／" + logs.length + " 筆";
    };
    if (keywordInput) keywordInput.addEventListener("input", applyLogFilters);
    applyLogFilters();
  } catch (error) {
    content.innerHTML =
      "<h2 class='section-title'>登入紀錄</h2>" +
      "<p class='system-message error'>讀取失敗：" + escapeHtml(error.message) + "</p>";
  }
}

async function clearAllLoginLogs() {
  const confirmed = confirm(
    "確定要清除全部登入紀錄嗎？\n\n將會清除管理員、家長及教師的所有登入紀錄。\n此操作無法復原，且不會影響任何學生資料或成績。"
  );
  if (!confirmed) return;

  const button = $("clearLoginLogsButton");
  if (button) {
    button.disabled = true;
    button.textContent = "清除中…";
  }

  try {
    const result = await db.from("login_events")
      .delete({ count: "exact" })
      .not("created_at", "is", null);
    if (result.error) throw result.error;

    const remaining = await db.from("login_events").select("*", { count: "exact", head: true });
    if (remaining.error) throw remaining.error;
    if ((remaining.count || 0) > 0) {
      throw new Error("仍有 " + remaining.count + " 筆登入紀錄未清除，請確認資料表是否允許管理員刪除。");
    }

    await renderLoginLogs();
    showMessage("已清除管理員、家長及教師的全部登入紀錄；學生資料與成績不受影響。", "success");
  } catch (error) {
    await renderLoginLogs();
    showMessage("清除登入紀錄失敗：" + error.message, "error");
  }
}

// ==================================================
// 13-1. 學生週考檢閱紀錄
// ==================================================

async function renderStudentReviewRecords(selectedExamId) {
  const content = $("adminContent");
  // 考試日期索引已於管理資料載入時排序，匯出頁直接共用，避免每次進入頁面重複複製與排序。
  const examList = examsByDateDescCache;
  const activeStudents = explicitlyActiveStudentsCache;
  const currentExamId = selectedExamId ||
    (examList.length ? String(examList[0].id) : "");

  content.innerHTML =
    "<h2 class='section-title'>學生週考檢閱紀錄</h2>" +
    "<div class='toolbar' style='align-items:flex-end'>" +
      "<div class='field' style='margin:0;min-width:220px;flex:1'>" +
        "<label for='reviewExamSelect'>考試週期</label>" +
        "<select id='reviewExamSelect' style='width:100%;padding:10px;border:1px solid #ccd4df;border-radius:8px'>" +
          examList.map(function(exam) {
            return "<option value='" + escapeHtml(exam.id) + "' " +
              (String(exam.id) === currentExamId ? "selected" : "") + ">" +
              escapeHtml(formatDateRange(exam)) + "</option>";
          }).join("") +
        "</select>" +
      "</div>" +
      "<div class='field' style='margin:0;min-width:150px;flex:1'>" +
        "<label for='reviewClassSelect'>班級</label>" +
        "<select id='reviewClassSelect' style='width:100%;padding:10px;border:1px solid #ccd4df;border-radius:8px'>" +
          "<option value=''>全部班級</option>" +
          "<option value='國一班'>國一班</option>" +
          "<option value='國二班'>國二班</option>" +
          "<option value='國三班'>國三班</option>" +
        "</select>" +
      "</div>" +
      "<button class='btn btn-secondary' id='reviewRefreshButton' type='button'>重新整理</button>" +
    "</div>" +
    "<div id='reviewRecordContent' class='empty'>正在讀取檢閱紀錄……</div>";

  const examSelect = $("reviewExamSelect");
  const classSelect = $("reviewClassSelect");
  const refreshButton = $("reviewRefreshButton");
  const recordContent = $("reviewRecordContent");

  if (!examList.length) {
    recordContent.innerHTML = "目前沒有考試週期資料。";
    examSelect.disabled = true;
    classSelect.disabled = true;
    refreshButton.disabled = true;
    return;
  }

  let cachedReviewExamId = "";
  let cachedReviewMap = new Map();

  async function loadRecords(forceReload) {
    const selectedExamId = examSelect.value;
    recordContent.innerHTML = "<div class='empty'>正在讀取檢閱紀錄……</div>";
    refreshButton.disabled = true;

    try {
      if (forceReload || cachedReviewExamId !== selectedExamId) {
        const result = await db
          .from("score_review_records")
          .select("student_id, reviewed_at")
          .eq("exam_id", selectedExamId);

        if (result.error) throw result.error;

        cachedReviewMap = new Map(
          (result.data || []).map(record => [String(record.student_id), record])
        );
        cachedReviewExamId = selectedExamId;
      }

      const reviewMap = cachedReviewMap;
      const selectedClass = classSelect.value;
      let visibleCount = 0;
      let eligibleCount = 0;
      let noScoreCount = 0;
      let reviewedCount = 0;
      const rowHtml = [];
      const reviewClassOrder = { "國一班": 1, "國二班": 2, "國三班": 3 };
      const sortedReviewStudents = activeStudents.slice().sort(function(a, b) {
        const classA = String(a.class_name || "");
        const classB = String(b.class_name || "");
        const orderA = reviewClassOrder[classA] || 99;
        const orderB = reviewClassOrder[classB] || 99;
        if (orderA !== orderB) return orderA - orderB;
        if (orderA === 99 && classA !== classB) return classA.localeCompare(classB, "zh-Hant");
        return 0;
      });

      sortedReviewStudents.forEach(function(student) {
        if (selectedClass && student.class_name !== selectedClass) return;

        visibleCount++;
        const hasWeeklyScore = scoresCache.some(function(score) {
          return String(score.student_id) === String(student.id) &&
            String(score.exam_id) === String(selectedExamId);
        });
        const record = hasWeeklyScore ? reviewMap.get(String(student.id)) : null;
        if (!hasWeeklyScore) {
          noScoreCount++;
        } else {
          eligibleCount++;
          if (record) reviewedCount++;
        }

        const status = !hasWeeklyScore
          ? "<span class='review-status-badge' style='display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 7px;border-radius:6px;color:#000000;font-size: 18px;line-height:30px;font-weight:800;white-space:nowrap'>無成績</span>"
          : record
            ? "<span class='review-status-badge' style='display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 7px;border-radius:6px;background:#e3f5e9;color:#20683d;font-size: 18px;line-height:30px;font-weight:800;white-space:nowrap'>已檢閱</span>"
            : "<span class='review-status-badge' style='display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 7px;border-radius:6px;background:#fde8e8;color:#a32626;font-size: 18px;line-height:30px;font-weight:800;white-space:nowrap'>未檢閱</span>";
        const reviewedAt = hasWeeklyScore && record && record.reviewed_at
          ? new Date(record.reviewed_at).toLocaleString("zh-TW", {
              timeZone: "Asia/Taipei",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            })
          : "—";

        rowHtml.push("<tr>" +
          "<td>" + escapeHtml(student.class_name || "—") + "</td>" +
          "<td>" + escapeHtml(student.student_code || "—") + "</td>" +
          "<td>" + escapeHtml(student.full_name || "—") + "</td>" +
          "<td>" + status + "</td>" +
          "<td>" + escapeHtml(reviewedAt) + "</td>" +
        "</tr>");
      });

      const pendingCount = eligibleCount - reviewedCount;
      const completionRate = eligibleCount
        ? Math.round(reviewedCount / eligibleCount * 100)
        : 0;
      const rows = rowHtml.join("");

      recordContent.innerHTML =
        "<div class='grid' style='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:8px 0 18px'>" +
          "<div class='panel' style='margin:0;padding:7px 10px;text-align:center'><div class='muted' style='line-height:1.2'>已檢閱</div><div style='font-size: 20px;line-height:1.2;font-weight:900;color:#27845b'>" + reviewedCount + "</div></div>" +
          "<div class='panel' style='margin:0;padding:7px 10px;text-align:center'><div class='muted' style='line-height:1.2'>未檢閱</div><div style='font-size: 20px;line-height:1.2;font-weight:900;color:#bd4242'>" + pendingCount + "</div></div>" +
          "<div class='panel' style='margin:0;padding:7px 10px;text-align:center'><div class='muted' style='line-height:1.2'>完成率</div><div style='font-size: 20px;line-height:1.2;font-weight:900;color:#315d86'>" + completionRate + "%</div></div>" +
        "</div>" +
        "<p class='muted'>目前在學學生共 " + visibleCount + " 人；有週考成績 " + eligibleCount + " 人，無成績 " + noScoreCount + " 人（無成績不列入檢閱人數及完成率計算）。</p>" +
        "<div class='table-wrap'><table class='student-record-table' style='min-width:620px'><thead><tr>" +
          "<th>班級</th><th>學生編號</th><th>學生姓名</th><th>檢閱狀態</th><th>檢閱時間</th>" +
        "</tr></thead><tbody>" +
          (rows || "<tr><td colspan='5' class='empty'>此班級目前沒有在學學生。</td></tr>") +
        "</tbody></table></div>";
    } catch (error) {
      recordContent.innerHTML =
        "<div class='system-message error' style='display:block'>讀取檢閱紀錄失敗：" +
        escapeHtml(error.message) + "</div>";
    } finally {
      refreshButton.disabled = false;
    }
  }

  examSelect.addEventListener("change", function () {
    loadRecords();
  });
  classSelect.addEventListener("change", function () {
    loadRecords();
  });
  refreshButton.addEventListener("click", function () {
    loadRecords(true);
  });
  await loadRecords();
}

// ==================================================
