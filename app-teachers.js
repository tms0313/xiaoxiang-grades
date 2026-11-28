/* ==================================================
   小象文教機構｜教師帳號及授課權限管理
   保留原有全域函式名稱、Supabase 操作及權限資料流程。
   依賴 app.js 提供的資料快取與共用函式；由 index.html 在 app.js 前載入。
   ================================================== */
function renderTeacherManagement() {
  const content = $("adminContent");
  const teacherById = teacherProfilesByIdCache;
  const teacherOptions = teacherProfilesCache.map(function (profile) {
    return "<option value='" + escapeHtml(profile.id) + "'>" +
      escapeHtml(profile.email || profile.display_name || profile.id) +
      "</option>";
  }).join("");

  const selectedTeacherId = $("teacherAccountSelect")
    ? $("teacherAccountSelect").value
    : "";

  const assignmentSubjectOrder = { "國文": 1, "英文": 2, "自然": 3 };
  const assignmentClassOrder = { "國一班": 1, "國二班": 2, "國三班": 3 };
  const sortTeacherAssignments = function (items) {
    return items.slice().sort(function (a, b) {
      const subjectA = assignmentSubjectOrder[a.subject] || 99;
      const subjectB = assignmentSubjectOrder[b.subject] || 99;
      if (subjectA !== subjectB) return subjectA - subjectB;
      const classA = assignmentClassOrder[a.class_name] || 99;
      const classB = assignmentClassOrder[b.class_name] || 99;
      if (classA !== classB) return classA - classB;
      return 0;
    });
  };

  const assignmentRows = sortTeacherAssignments(teacherAssignmentsCache
    .filter(item => !selectedTeacherId || String(item.teacher_id) === String(selectedTeacherId)))
    .map(function (item) {
      const teacher = teacherById.get(String(item.teacher_id));
      return "<tr data-teacher-assignment-row='" + escapeHtml(item.id) + "'>" +
        "<td>" + escapeHtml(teacher ? teacher.email : "教師帳號") + "</td>" +
        "<td>" + escapeHtml(item.class_name) + "</td>" +
        "<td>" + escapeHtml(item.subject) + "</td>" +
        "<td><button class='btn btn-danger btn-small' data-delete-teacher-assignment='" + escapeHtml(item.id) + "'>移除綁定</button></td>" +
      "</tr>";
    }).join("");

  content.innerHTML =
    "<h2 class='section-title'>教師管理</h2>" +
    "<div class='panel'><h3>建立教師帳號</h3>" +
      "<p class='muted'>輸入教師 Email，系統會建立教師登入帳號並產生臨時密碼。教師登入後可自行修改密碼。</p>" +
      "<form id='createTeacherForm'><div class='form-grid'>" +
        "<div class='field'><label>教師 Email（登入帳號）</label><input id='newTeacherEmail' type='email' autocomplete='off' placeholder='請輸入教師 Email' required></div>" +
      "</div><button class='btn btn-success' type='submit' id='createTeacherButton'>建立教師帳號</button></form>" +
    "</div>" +
    "<div class='panel'><h3>教師帳號管理</h3>" +
      "<p class='muted'>教師帳號建立後，管理員會私下提供登入資訊。教師首次登入或密碼重設後，必須先更改為至少 8 個字元的新密碼，才能查詢成績。</p>" +
      "<div class='table-wrap'><table class='teacher-account-table'><thead><tr><th>教師登入 Email</th><th>操作</th></tr></thead>" +
      "<tbody id='teacherAccountRows'>" +
        (teacherProfilesCache.map(function (profile) {
          const actions = "<button class='btn btn-small' data-reset-teacher='" + escapeHtml(profile.id) + "'>重設密碼</button>" +
            "<button class='btn btn-danger btn-small' data-delete-teacher='" + escapeHtml(profile.id) + "'>刪除帳號</button>";
          return "<tr><td>" + escapeHtml(profile.email || profile.display_name || "—") + "</td>" +
            "<td class='action-cell'><div class='action-buttons'>" + actions + "</div></td></tr>";
        }).join("") || "<tr><td colspan='2' class='empty'>目前沒有教師帳號</td></tr>") +
      "</tbody></table></div>" +
    "</div>" +
    "<div class='panel' id='teacherAssignmentPanel'><h3>設定授課班級與科目</h3>" +
      (teacherProfilesCache.length
        ? "<form id='teacherAssignmentForm'><div class='form-grid'>" +
            "<div class='field'><label>教師帳號</label><select id='teacherAccountSelect' required><option value=''>請選擇教師</option>" + teacherOptions + "</select></div>" +
            "<div class='field'><label>授課班級</label><select id='teacherClassSelect' required><option value=''>請選擇班級</option><option>國一班</option><option>國二班</option><option>國三班</option></select></div>" +
            "<div class='field'><label>授課科目</label><select id='teacherSubjectSelect' required><option value=''>請選擇科目</option>" + SUBJECTS.map(subject => "<option value='" + escapeHtml(subject) + "'>" + escapeHtml(subject) + "</option>").join("") + "</select></div>" +
          "</div><button class='btn btn-success' type='submit' id='saveTeacherAssignmentButton'>新增授課權限</button></form>"
        : "<div class='empty'>目前尚無教師帳號，請先建立教師帳號。</div>") +
    "</div>" +
    "<div class='panel'><h3>教師授課權限清單</h3>" +
      "<div class='toolbar'><label for='teacherAssignmentFilter'><strong>教師：</strong></label><select id='teacherAssignmentFilter'><option value=''>全部教師</option>" + teacherOptions + "</select></div>" +
      "<div class='table-wrap'><table class='teacher-assignment-table'><thead><tr><th>教師帳號</th><th>班級</th><th>科目</th><th>操作</th></tr></thead>" +
      "<tbody id='teacherAssignmentRows'>" + (assignmentRows || "<tr><td colspan='4' class='empty'>目前沒有授課權限設定</td></tr>") + "</tbody></table></div>" +
    "</div>";

  $("createTeacherForm").addEventListener("submit", createTeacherAccount);
  if ($("teacherAssignmentForm")) {
    $("teacherAssignmentForm").addEventListener("submit", saveTeacherAssignment);
    $("teacherAccountSelect").addEventListener("change", function () {
      $("teacherAssignmentFilter").value = this.value;
      refreshTeacherAssignmentRows();
    });
  }
  $("teacherAssignmentFilter").addEventListener("change", refreshTeacherAssignmentRows);

  function refreshTeacherAssignmentRows() {
    const selected = $("teacherAssignmentFilter").value;
    const rows = sortTeacherAssignments(teacherAssignmentsCache
      .filter(item => !selected || String(item.teacher_id) === String(selected)))
      .map(function (item) {
        const teacher = teacherById.get(String(item.teacher_id));
        return "<tr data-teacher-assignment-row='" + escapeHtml(item.id) + "'><td>" + escapeHtml(teacher ? teacher.email : "教師帳號") + "</td>" +
          "<td>" + escapeHtml(item.class_name) + "</td><td>" + escapeHtml(item.subject) + "</td>" +
          "<td><button class='btn btn-danger btn-small' data-delete-teacher-assignment='" + escapeHtml(item.id) + "'>移除綁定</button></td></tr>";
      }).join("");
    $("teacherAssignmentRows").innerHTML = rows || "<tr><td colspan='4' class='empty'>目前沒有授課權限設定</td></tr>";
  }

  content.onclick = async function (event) {
    const resetButton = event.target.closest("[data-reset-teacher]");
    if (resetButton) {
      const profile = teacherById.get(String(resetButton.dataset.resetTeacher));
      if (profile) await manageTeacherAccount("reset_password", profile.id, profile.email || "");
      return;
    }

    const deleteButton = event.target.closest("[data-delete-teacher]");
    if (deleteButton) {
      const profile = teacherById.get(String(deleteButton.dataset.deleteTeacher));
      if (profile) await manageTeacherAccount("delete", profile.id, profile.email || "");
      return;
    }

    const assignmentButton = event.target.closest("[data-delete-teacher-assignment]");
    if (assignmentButton) {
      await deleteTeacherAssignment(assignmentButton.dataset.deleteTeacherAssignment, assignmentButton);
      return;
    }

  };
}

async function createTeacherAccount(event) {
  event.preventDefault();
  const email = $("newTeacherEmail").value.trim().toLowerCase();
  const button = $("createTeacherButton");
  if (!email) return;

  if (!confirm("確定建立教師帳號？\n\n登入帳號：" + email + "\n角色：教師")) return;
  button.disabled = true;
  button.textContent = "建立中……";

  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const result = await db.functions.invoke("admin-create-teacher-account", {
      body: { email: email }
    });
    if (result.error) {
      throw new Error(result.data && result.data.error ? result.data.error : result.error.message);
    }
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    const data = result.data || {};
    if (!data.success || !data.temporaryPassword) {
      throw new Error(data.error || "教師帳號建立結果不完整，請確認 Edge Function 已部署。");
    }
    await loadAdminData();
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    renderTeacherManagement();
    const copyPassword = confirm(
      "教師帳號建立成功！\n\n登入帳號：" + (data.email || email) +
      "\n臨時密碼：" + data.temporaryPassword +
      "\n\n請將臨時密碼透過 LINE 提供給教師；教師首次登入必須先更改為至少 8 個字元的新密碼。\n\n按「確定」複製臨時密碼。"
    );
    if (copyPassword) {
      try { await navigator.clipboard.writeText(data.temporaryPassword); showMessage("教師臨時密碼已複製。", "success"); }
      catch (copyError) { showMessage("教師臨時密碼：" + data.temporaryPassword, "success"); }
    }
    showMessage("教師帳號「" + email + "」已建立。", "success");
  } catch (error) {
    showMessage("建立教師帳號失敗：" + error.message, "error");
  } finally {
    const currentButton = $("createTeacherButton");
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = "建立教師帳號";
    }
  }
}

async function manageTeacherAccount(action, teacherId, email) {
  const isDelete = action === "delete";

  if (isDelete) {
    const confirmed = confirm(
      "確定永久刪除這位教師的 Email 登入帳號？\n\n" +
      "教師帳號：" + email + "\n\n" +
      "刪除後將無法登入，該教師的所有授課權限也會一併移除。此操作無法復原。"
    );
    if (!confirmed) return;
  } else {
    if (!confirm("確定重設這位教師的登入密碼？\n\n教師帳號：" + email)) return;
  }

  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const result = await db.functions.invoke("admin-manage-teacher-account", {
      body: { action: action, teacherId: teacherId }
    });

    if (result.error) {
      throw new Error(result.data && result.data.error ? result.data.error : result.error.message);
    }

    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    const data = result.data || {};
    if (!data.success) throw new Error(data.error || "教師帳號操作失敗。");

    if (isDelete) {
      await loadAdminData();
      if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
      renderTeacherManagement();
      showMessage("教師帳號已刪除，授課權限也已清除。", "success");
      return;
    }

    if (!data.temporaryPassword) throw new Error("密碼已重設，但沒有取得臨時密碼。");

    const copied = confirm(
      "教師密碼已重設成功！\n\n" +
      "登入帳號：" + (data.email || email) + "\n" +
      "臨時密碼：" + data.temporaryPassword +
      "\n\n請將密碼透過 LINE 提供給教師；教師首次登入必須先更改密碼。\n\n按「確定」複製臨時密碼。"
    );

    if (copied) {
      try {
        await navigator.clipboard.writeText(data.temporaryPassword);
        showMessage("教師臨時密碼已複製。", "success");
      } catch (copyError) {
        showMessage("教師臨時密碼：" + data.temporaryPassword, "success");
      }
    } else {
      showMessage("臨時密碼已產生，請記下剛才顯示的密碼。", "success");
    }
  } catch (error) {
    showMessage((isDelete ? "刪除教師帳號" : "重設教師密碼") + "失敗：" + error.message, "error");
  }
}

async function saveTeacherAssignment(event) {
  event.preventDefault();
  const button = $("saveTeacherAssignmentButton");
  if (!button || button.disabled) return;

  const assignmentPanel = $("teacherAssignmentPanel");
  const assignmentPanelTop = assignmentPanel
    ? assignmentPanel.getBoundingClientRect().top
    : null;
  const teacherId = $("teacherAccountSelect").value;
  const className = $("teacherClassSelect").value;
  const subject = $("teacherSubjectSelect").value;
  if (!teacherId || !className || !subject) {
    showMessage("請選擇教師、班級及科目。", "error");
    return;
  }

  const duplicate = teacherAssignmentsCache.some(item =>
    String(item.teacher_id) === String(teacherId) &&
    item.class_name === className &&
    item.subject === subject
  );
  if (duplicate) {
    showMessage("這位教師已經有相同班級及科目的授課權限，不需要重複新增。", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "新增中……";
  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const result = await db.from("teacher_assignments").insert({
      teacher_id: teacherId,
      class_name: className,
      subject: subject
    }).select("id, teacher_id, class_name, subject").single();
    if (result.error) {
      if (result.error.code === "23505") throw new Error("這位教師已經有相同的授課權限。");
      throw result.error;
    }
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    teacherAssignmentsCache.push(result.data);
    renderTeacherManagement();
    if ($("teacherAccountSelect")) $("teacherAccountSelect").value = teacherId;
    if ($("teacherClassSelect")) $("teacherClassSelect").value = className;
    if ($("teacherSubjectSelect")) $("teacherSubjectSelect").value = subject;
    showMessage("教師授課權限已新增。", "success", true);

    // 以「設定授課班級與科目」區塊作為定位基準，重新 render 後校正位置。
    requestAnimationFrame(function () {
      const refreshedPanel = $("teacherAssignmentPanel");
      if (refreshedPanel && assignmentPanelTop !== null) {
        const newTop = refreshedPanel.getBoundingClientRect().top;
        window.scrollBy({ top: newTop - assignmentPanelTop, behavior: "auto" });
      }
    });
  } catch (error) {
    showMessage("新增授課權限失敗：" + error.message, "error");
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "新增授課權限";
    }
  }
}

async function deleteTeacherAssignment(id, button) {
  if (!confirm("確定移除此筆教師授課權限？")) return;

  const currentRow = button ? button.closest("tr") : null;
  const nextRow = currentRow ? currentRow.nextElementSibling : null;
  const previousRow = currentRow ? currentRow.previousElementSibling : null;
  const anchorRowId = nextRow && nextRow.dataset.teacherAssignmentRow
    ? nextRow.dataset.teacherAssignmentRow
    : previousRow && previousRow.dataset.teacherAssignmentRow
      ? previousRow.dataset.teacherAssignmentRow
      : "";
  const anchorTop = currentRow ? currentRow.getBoundingClientRect().top : null;
  const assignmentPanel = currentRow ? currentRow.closest(".panel") : null;
  const panelTop = assignmentPanel ? assignmentPanel.getBoundingClientRect().top : null;

  const sessionGeneration = appSessionGeneration;
  const sessionUserId = currentUser && currentUser.id;
  try {
    const result = await db.from("teacher_assignments").delete().eq("id", id);
    if (result.error) throw result.error;
    if (!isCurrentAppSession(sessionGeneration, sessionUserId)) return;
    teacherAssignmentsCache = teacherAssignmentsCache.filter(
      item => String(item.id) !== String(id)
    );
    renderTeacherManagement();
    showMessage("教師授課權限已移除。", "success", true);

    requestAnimationFrame(function () {
      const refreshedRow = anchorRowId
        ? document.querySelector("[data-teacher-assignment-row='" + anchorRowId + "']")
        : null;
      if (refreshedRow && anchorTop !== null) {
        window.scrollBy({
          top: refreshedRow.getBoundingClientRect().top - anchorTop,
          behavior: "auto"
        });
      } else if (panelTop !== null) {
        const refreshedPanel = $("teacherAssignmentRows");
        const panel = refreshedPanel ? refreshedPanel.closest(".panel") : null;
        if (panel) {
          window.scrollBy({
            top: panel.getBoundingClientRect().top - panelTop,
            behavior: "auto"
          });
        }
      }
    });
  } catch (error) {
    showMessage("移除教師授課權限失敗：" + error.message, "error", true);
  }
}

