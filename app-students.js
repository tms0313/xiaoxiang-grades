// ==================================================
// 9. 學生管理
// ==================================================

function renderStudents() {
  const content = $("adminContent");
  const filter = $("studentStatusFilter") ? $("studentStatusFilter").value : "active";
  const classFilter = $("studentClassFilter") ? $("studentClassFilter").value : "all";
  const subjectFilter = $("studentSubjectFilter") ? $("studentSubjectFilter").value : "all";
  const keywordFilter = $("studentKeywordFilter") ? $("studentKeywordFilter").value : "";

  // 修課科目索引於管理資料載入時建立，搜尋／篩選時直接重用。
  const getActiveSubjects = studentId =>
    activeSubjectsByStudentCache.get(String(studentId)) || [];

  // 將狀態、班級與修課科目條件合併為單次學生快取遍歷，
  // 避免先建立 matchingStudents 再建立 enrolledStudents 兩份中間陣列。
  const visibleStudents = [];
  studentsCache.forEach(function (student) {
    const active = student.is_active !== false;
    if ((filter === "active" ? !active : active)) return;
    if (classFilter !== "all" && student.class_name !== classFilter) return;
    if (subjectFilter !== "all" && !getActiveSubjects(student.id).some(function (item) {
      return item.subject === subjectFilter;
    })) return;
    visibleStudents.push(student);
  });

  // 學生管理清單依學生編號自然排序，確保 G101、G102、G103……按數字由小到大排列。
  const studentCodeCollator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base"
  });
  visibleStudents.sort(function (a, b) {
    return studentCodeCollator.compare(
      String(a.student_code || "").trim(),
      String(b.student_code || "").trim()
    ) || String(a.full_name || "").localeCompare(String(b.full_name || ""), "zh-Hant");
  });

  const rows = visibleStudents.map(function (student) {
    const active = student.is_active !== false;
    return "<tr data-student-search='" + escapeHtml((String(student.student_code || "") + " " + String(student.full_name || "")).toLocaleLowerCase()) + "'>" +
      "<td>" + escapeHtml(student.student_code) + "</td>" +
      "<td>" + escapeHtml(student.full_name) + "</td>" +
      "<td>" + escapeHtml(student.class_name) + "</td>" +
      "<td class='student-subject-cell'>" + (getActiveSubjects(student.id).map(item => escapeHtml(({ "國文":"國", "英文":"英", "數學":"數", "自然":"自" })[item.subject] || item.subject)).join("、") || "<span class='muted'>未設定</span>") + "</td>" +
      "<td>" + (active
        ? "<span class='student-status-active'>在學</span>"
        : "<span class='student-status-inactive'>離班</span>") + "</td>" +
      "<td class='student-action-cell action-cell'><div class='action-buttons'>" +
        "<button class='btn btn-small' data-edit-student='" + escapeHtml(student.id) + "'>修改</button>" +
        "<button class='btn " + (active ? "btn-danger" : "btn-success") + " btn-small student-status-action' data-toggle-student='" + escapeHtml(student.id) + "' title='" + (active ? "離班" : "重新啟用") + "' aria-label='" + (active ? "離班" : "重新啟用") + "'>" + (active ? "離班" : "<span class='student-status-enable-icon' aria-hidden='true'>↻</span><span>啟用</span>") + "</button>" +
      "</div></td></tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>學生管理</h2>" +
    "<div class='panel'><h3 id='studentFormTitle'>新增學生</h3>" +
      "<form id='studentForm'><input type='hidden' id='studentEditId'>" +
        "<div class='form-grid'>" +
          "<div class='field'><label>班級</label><select id='studentClass' required><option value=''>請選擇班級</option><option>國一班</option><option>國二班</option><option>國三班</option></select></div>" +
          "<div class='field'><label>學生編號</label><input id='studentCode' required readonly></div>" +
          "<div class='field'><label>學生姓名</label><input id='studentName' required></div>" +
        "</div>" +
        "<div class='field student-subject-field'><label>勾選科目</label><div class='student-subject-options'>" +
          SUBJECTS.map(subject => "<label class='student-subject-option'><input type='checkbox' name='studentSubject' value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</label>").join("") +
        "</div><small class='muted'>請勾選學生實際修讀的科目；未勾選的科目不會列入漏登檢查。日後修課異動可在此修改。</small></div>" +
        "<div class='toolbar' style='display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:nowrap;margin-top:12px'>" +
          "<button class='btn btn-success' type='submit' style='flex:1'>儲存學生資料</button>" +
          "<button class='btn btn-secondary' type='button' id='studentCancel' style='flex:1'>清除</button>" +
        "</div>" +
      "</form></div>" +
      "<div class='toolbar student-filter-toolbar'>" +
        "<label for='studentStatusFilter'><strong>學生狀態：</strong></label>" +
        "<select id='studentStatusFilter'><option value='active'>在學學生</option><option value='inactive'>離班學生</option></select>" +
        "<label for='studentClassFilter'><strong>班級：</strong></label>" +
        "<select id='studentClassFilter'><option value='all'>全部學生</option><option value='國一班'>國一班</option><option value='國二班'>國二班</option><option value='國三班'>國三班</option></select>" +
        "<label for='studentSubjectFilter'><strong>修課科目：</strong></label>" +
        "<select id='studentSubjectFilter'><option value='all'>全部科目</option>" +
          SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") +
        "</select>" +
        "<label for='studentKeywordFilter'><strong>搜尋：</strong></label>" +
        "<input id='studentKeywordFilter' class='student-search-input' type='search' placeholder='輸入姓名或學生編號' aria-label='搜尋學生姓名或學生編號'>" +
        "<button class='btn btn-small btn-secondary' type='button' id='studentClearFilters'>清除篩選</button>" +
        "<span id='studentSubjectCount' class='student-filter-count'>符合條件 " + visibleStudents.length + " 人</span>" +
      "</div>" +
      "<div class='table-wrap'><table class='student-management-table'>" +
        "<thead><tr><th>學生編號</th><th>姓名</th><th>班級</th><th>修課科目</th><th>狀態</th><th>操作</th></tr></thead>" +
        "<tbody>" + (rows || "<tr><td colspan='6' class='empty'>目前沒有符合條件的學生</td></tr>") + "</tbody>" +
      "</table></div>";

  $("studentStatusFilter").value = filter;
  $("studentClassFilter").value = classFilter;
  $("studentSubjectFilter").value = subjectFilter;
  $("studentKeywordFilter").value = keywordFilter;
  // 學生清單每次篩選重繪才會更換；搜尋時沿用已取得的列，避免重複 DOM 查詢與陣列建立。
  const studentRows = Array.from(content.querySelectorAll(".student-management-table tbody tr[data-student-search]"));
  function applyStudentKeyword() {
    const keyword = $("studentKeywordFilter").value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    studentRows.forEach(function (row) {
      const matched = !keyword || row.dataset.studentSearch.includes(keyword);
      row.hidden = !matched;
      if (matched) visibleCount++;
    });
    $("studentSubjectCount").textContent = "符合條件 " + visibleCount + " 人";
  }
  applyStudentKeyword();
  $("studentStatusFilter").addEventListener("change", renderStudents);
  $("studentClassFilter").addEventListener("change", renderStudents);
  $("studentSubjectFilter").addEventListener("change", renderStudents);
  $("studentKeywordFilter").addEventListener("input", applyStudentKeyword);
  $("studentClearFilters").addEventListener("click", function () {
    $("studentStatusFilter").value = "active";
    $("studentClassFilter").value = "all";
    $("studentSubjectFilter").value = "all";
    $("studentKeywordFilter").value = "";
    renderStudents();
  });
  $("studentForm").addEventListener("submit", saveStudent);
  $("studentClass").addEventListener("change", function () {
    if (!$("studentEditId").value) {
      $("studentCode").value = getNextStudentCode($("studentClass").value);
    }
  });
  $("studentCancel").addEventListener("click", clearStudentForm);

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-student]");
    const toggleButton = event.target.closest("[data-toggle-student]");
    if (editButton) editStudent(editButton.dataset.editStudent);
    if (toggleButton) await toggleStudentStatus(toggleButton.dataset.toggleStudent);
  };
}

function getNextStudentCode(className) {
  const prefixMap = { "國一班": "G1", "國二班": "G2", "國三班": "G3" };
  const prefix = prefixMap[className];
  if (!prefix) return "";

  const maxNumber = studentsCache.reduce(function (max, student) {
    const code = String(student.student_code || "").trim().toUpperCase();
    const match = code.match(new RegExp("^" + prefix + "(\\d+)$"));
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  return prefix + String(maxNumber + 1).padStart(2, "0");
}

function clearStudentForm() {
  $("studentForm").reset();
  $("studentEditId").value = "";
  $("studentCode").readOnly = true;
  $("studentCode").value = getNextStudentCode($("studentClass").value);
  document.querySelectorAll("input[name='studentSubject']").forEach(checkbox => { checkbox.checked = false; });
  $("studentFormTitle").textContent = "新增學生";
}

function editStudent(id) {
  const student = studentsByIdCache.get(String(id));
  if (!student) return;

  $("studentEditId").value = student.id;
  $("studentCode").readOnly = false;
  $("studentCode").value = student.student_code || "";
  $("studentName").value = student.full_name || "";
  $("studentClass").value = student.class_name || "";
  const activeSubjectSet = new Set(
    (activeSubjectsByStudentCache.get(String(student.id)) || []).map(item => item.subject)
  );
  document.querySelectorAll("input[name='studentSubject']").forEach(function (checkbox) {
    checkbox.checked = activeSubjectSet.has(checkbox.value);
  });
  $("studentFormTitle").textContent = "修改學生資料";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveStudent(event) {
  event.preventDefault();

  const id = $("studentEditId").value;
  const payload = {
    student_code: $("studentCode").value.trim(),
    full_name: $("studentName").value.trim(),
    class_name: $("studentClass").value
  };

  if (!payload.student_code || !payload.full_name || !payload.class_name) {
    showMessage("請完整填寫學生編號、姓名及班級。", "error");
    return;
  }

  const normalizedCode = payload.student_code.toLocaleUpperCase();
  const duplicate = studentsCache.find(function (student) {
    return String(student.id) !== String(id) &&
      String(student.student_code || "").trim().toLocaleUpperCase() === normalizedCode;
  });
  if (duplicate) {
    showMessage("學生編號「" + payload.student_code + "」已被 " +
      (duplicate.full_name || "其他學生") + " 使用，請確認編號後再儲存。", "error");
    $("studentCode").focus();
    return;
  }

  const submitButton = $("studentForm").querySelector("button[type='submit']");
  const originalButtonText = submitButton ? submitButton.textContent : "";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "儲存中…";
  }

  try {
    let studentId = id;
    let savedStudent = null;
    if (id) {
      const result = await db.from("students").update(payload).eq("id", id);
      if (result.error) throw result.error;
      savedStudent = { ...studentsByIdCache.get(String(id)), ...payload };
    } else {
      const result = await db.from("students")
        .insert(Object.assign({ is_active: true }, payload))
        .select("id, student_code, full_name, class_name, is_active")
        .single();
      if (result.error) throw result.error;
      studentId = result.data.id;
      savedStudent = result.data;
    }

    const selectedSubjects = Array.from(document.querySelectorAll("input[name='studentSubject']:checked"))
      .map(checkbox => checkbox.value);
    const subjectRows = SUBJECTS.map(subject => ({
      student_id: studentId,
      subject: subject,
      is_active: selectedSubjects.includes(subject)
    }));

    const subjectResult = await db.from("student_subjects")
      .upsert(subjectRows, { onConflict: "student_id,subject" });
    if (subjectResult.error) throw subjectResult.error;

    // 學生資料及修課科目已成功寫入後，局部同步快取，避免再次讀取整套後台資料。
    if (id) {
      studentsCache = studentsCache.map(student =>
        String(student.id) === String(studentId) ? savedStudent : student
      );
    } else {
      studentsCache.push(savedStudent);
    }
    studentSubjectsCache = studentSubjectsCache.filter(item =>
      String(item.student_id) !== String(studentId)
    ).concat(subjectRows);
    rebuildAdminEntityIndexes();
    rebuildActiveSubjectsByStudentCache();

    clearStudentForm();
    renderStudents();
    showMessage(id ? "學生資料及修課科目已更新。" : "學生及修課科目已新增。", "success");

  } catch (error) {
    showMessage("學生資料儲存失敗：" + error.message, "error");
  } finally {
    if (submitButton && submitButton.isConnected) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText || "儲存學生資料";
    }
  }
}

async function toggleStudentStatus(id) {
  const student = studentsByIdCache.get(String(id));
  if (!student) {
    showMessage("找不到學生資料，請重新整理。", "error");
    return;
  }

  const currentlyActive = student.is_active !== false;
  const nextStatus = !currentlyActive;
  const action = nextStatus ? "重新啟用" : "停用";

  const warning = currentlyActive
    ? "\n\n停用後：\n・不會出現在成績登錄學生選單。\n・不會列入尚未登錄成績的學生檢查。\n・既有成績及家長綁定資料會保留。\n・家長仍可查詢過往已公布的成績。"
    : "\n\n啟用後，學生會重新出現在成績登錄及家長綁定選單。";

  if (!confirm("確定" + action + "學生「" + student.full_name + "」嗎？" + warning)) return;

  try {
    const result = await db.from("students")
      .update({ is_active: nextStatus })
      .eq("id", id);

    if (result.error) throw result.error;

    // 學生狀態變更只影響學生快取與依賴學生狀態的索引，不必重載整套管理資料。
    student.is_active = nextStatus;
    rebuildAdminEntityIndexes();
    renderStudents();
    showMessage("學生「" + student.full_name + "」已" + action + "。", "success");
  } catch (error) {
    showMessage(action + "學生失敗：" + error.message, "error");
  }
}

async function deleteStudent(id) {
  const student = studentsByIdCache.get(String(id));
  if (!student) return;

  if (!confirm("確定刪除學生「" + student.full_name + "」？\n\n若此學生仍有成績或家長綁定，資料庫可能會拒絕刪除。")) return;

  try {
    const result = await db.from("students").delete().eq("id", id);
    if (result.error) throw result.error;

    // 刪除學生後同步受影響的本地快取，避免重新載入整套管理資料。
    studentsCache = studentsCache.filter(item => String(item.id) !== String(id));
    studentSubjectsCache = studentSubjectsCache.filter(item => String(item.student_id) !== String(id));
    scoresCache = scoresCache.filter(item => {
      if (String(item.student_id) !== String(id)) return true;
      scoresByIdCache.delete(String(item.id));
      scoresByStudentExamSubjectScopeCache.delete(
        getScoreCompositeKey(item.student_id, item.exam_id, item.subject, item.scope)
      );
      return false;
    });
    guardianLinksCache = guardianLinksCache.filter(item => String(item.student_id) !== String(id));
    missingExclusionsCache = missingExclusionsCache.filter(item => String(item.student_id) !== String(id));
    rebuildAdminEntityIndexes();
    rebuildActiveSubjectsByStudentCache();
    rebuildGuardianBindingIndexes();
    invalidateAdminHighestPreviewCache();
    renderStudents();
    showMessage("學生資料已刪除。", "success");

  } catch (error) {
    showMessage("刪除失敗：" + error.message, "error");
  }
}

