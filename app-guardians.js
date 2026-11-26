
let parentPasswordStatusesCache = new Map();
let parentPasswordStatusRequestId = 0;
let parentPasswordStatusLoadState = "idle";

function getParentPasswordStatusPresentation(status) {
  const presentations = {
    not_logged_in_pending: { label: "尚未登入／待更改", className: "is-pending" },
    logged_in_pending: { label: "已登入／待更改", className: "is-warning" },
    completed: { label: "已完成更改", className: "is-complete" },
    never_logged_in_unknown: { label: "從未登入／無法判定", className: "is-unknown" },
    legacy_unknown: { label: "舊帳號／無法判定", className: "is-unknown" },
    pending_login_unknown: { label: "待更改／登入時間不明", className: "is-warning" },
    auth_missing: { label: "登入帳號不存在", className: "is-error" }
  };
  return presentations[status] || {
    label: parentPasswordStatusLoadState === "error" ? "讀取失敗" : "查詢中",
    className: parentPasswordStatusLoadState === "error" ? "is-error" : "is-loading"
  };
}

function parentPasswordStatusBadge(parentId) {
  const status = parentPasswordStatusesCache.get(String(parentId));
  const presentation = getParentPasswordStatusPresentation(status);
  return "<span class='parent-password-status " + presentation.className +
    "' data-parent-password-status='" + escapeHtml(parentId) + "'>" +
    escapeHtml(presentation.label) + "</span>";
}

function applyParentPasswordStatusResults() {
  document.querySelectorAll("[data-parent-password-status]").forEach(function (element) {
    const status = parentPasswordStatusesCache.get(String(element.dataset.parentPasswordStatus));
    const presentation = getParentPasswordStatusPresentation(status);
    element.className = "parent-password-status " + presentation.className;
    element.textContent = presentation.label;
  });

  const summary = $("parentPasswordStatusSummary");
  if (!summary) return;

  if (parentPasswordStatusLoadState === "error") {
    summary.textContent = "密碼狀態讀取失敗，請稍後重新整理。";
    return;
  }

  const counts = {
    not_logged_in_pending: 0,
    logged_in_pending: 0,
    completed: 0,
    unknown: 0
  };
  profilesCache.forEach(function (profile) {
    if (profile.role !== "parent") return;
    const status = parentPasswordStatusesCache.get(String(profile.id));
    if (status === "not_logged_in_pending") counts.not_logged_in_pending += 1;
    else if (status === "logged_in_pending" || status === "pending_login_unknown") counts.logged_in_pending += 1;
    else if (status === "completed") counts.completed += 1;
    else counts.unknown += 1;
  });

  summary.textContent =
    "尚未登入／待更改 " + counts.not_logged_in_pending + " 位　｜　" +
    "已登入／待更改 " + counts.logged_in_pending + " 位　｜　" +
    "已完成更改 " + counts.completed + " 位　｜　" +
    "無法判定 " + counts.unknown + " 位";
}

async function loadParentPasswordStatuses() {
  const requestId = ++parentPasswordStatusRequestId;
  try {
    const result = await db.functions.invoke("admin-parent-password-status", {
      body: {}
    });
    if (requestId !== parentPasswordStatusRequestId) return;
    if (result.error) {
      throw new Error(result.data && result.data.error
        ? result.data.error
        : result.error.message);
    }

    const data = result.data || {};
    if (data.success !== true || !Array.isArray(data.parentStatuses)) {
      throw new Error(data.error || "密碼狀態資料格式不正確。");
    }

    parentPasswordStatusesCache = new Map(
      data.parentStatuses.map(function (item) {
        return [String(item.parentId), item.status];
      })
    );
    parentPasswordStatusLoadState = "success";
    applyParentPasswordStatusResults();
  } catch (error) {
    if (requestId !== parentPasswordStatusRequestId) return;
    console.error("讀取家長密碼狀態失敗：", error);
    parentPasswordStatusLoadState = "error";
    applyParentPasswordStatusResults();
  }
}

/* ==================================================
   小象文教機構｜家長帳號及學生綁定管理
   保留原有函式名稱、Supabase 呼叫與帳號安全流程。
   依賴 app.js 提供的資料快取與共用函式；由 index.html 在 app.js 前載入。
   ================================================== */
// ==================================================
// 11. 家長帳號建立、家長及學生綁定
// ==================================================

function renderGuardians() {
  const content = $("adminContent");
  const studentsById = studentsByIdCache;
  const parentsById = parentProfilesByIdCache;
  const firstLinkedStudentByGuardian = new Map();
  const linkedStudentIds = new Set();
  const boundGuardianIds = new Set();

  guardianLinksCache.forEach(function (link) {
    const guardianId = String(link.guardian_id);
    const studentId = String(link.student_id);
    linkedStudentIds.add(studentId);
    boundGuardianIds.add(guardianId);
    if (!firstLinkedStudentByGuardian.has(guardianId)) {
      firstLinkedStudentByGuardian.set(guardianId, studentsById.get(studentId) || null);
    }
  });

  const parentOptions = profilesCache.map(function (profile) {
    const loginIdentity = profile.email || profile.phone || "未設定登入帳號";
    const linkedStudent = firstLinkedStudentByGuardian.get(String(profile.id));
    const parentLabel = linkedStudent
      ? linkedStudent.full_name + "家長"
      : (profile.display_name || loginIdentity);
    return "<option value='" + escapeHtml(profile.id) + "'>" +
      escapeHtml(parentLabel + "｜" + loginIdentity) +
      "</option>";
  }).join("");

  // 家長綁定的學生下拉選單固定依國一、國二、國三排序；同班學生維持原有資料順序。
  const activeStudents = activeStudentsCache.slice().sort(function (a, b) {
    const aRank = classOrder.indexOf(a.class_name);
    const bRank = classOrder.indexOf(b.class_name);
    const normalizedARank = aRank < 0 ? classOrder.length : aRank;
    const normalizedBRank = bRank < 0 ? classOrder.length : bRank;
    return normalizedARank - normalizedBRank;
  });
  const studentOptions = activeStudents.map(function (student) {
    return "<option value='" + escapeHtml(student.id) + "'>" +
      escapeHtml(student.class_name + "｜" + student.student_code + "｜" + student.full_name) +
      "</option>";
  }).join("");

  // 靜態列資料只建立一次；搜尋時只比對預先整理好的文字，避免每次輸入都重建所有 HTML。
  const guardianRowItems = [];

  guardianLinksCache.forEach(function (link) {
    const parent = parentsById.get(String(link.guardian_id));
    const student = studentsById.get(String(link.student_id));
    if (!student) return;

    const loginIdentity = parent ? (parent.email || parent.phone || "") : "";
    const parentName = student.full_name + "家長";
    const searchText = [
      student.full_name,
      student.student_code,
      student.class_name,
      loginIdentity,
      parentName
    ].join(" ").toLocaleLowerCase();

    guardianRowItems.push({
      className: student.class_name,
      searchText: searchText,
      html:
        "<tr>" +
          "<td>" + escapeHtml(student.class_name) + "</td>" +
          "<td>" + escapeHtml(student.full_name) + "</td>" +
          "<td>" + (parent
            ? "<strong>" + escapeHtml(parentName) + "</strong><br><span class='muted'>" + escapeHtml(loginIdentity || "—") + "</span>"
            : "—") + "</td>" +
          "<td><span class='guardian-status-bound'>已綁定</span></td>" +
          "<td>" + (parent ? parentPasswordStatusBadge(parent.id) : "—") + "</td>" +
          "<td class='action-cell'>" +
            "<div class='action-buttons'>" +
              (parent ? "<button class='btn btn-small' data-edit-parent='" + escapeHtml(parent.id) + "'>修改</button>" : "") +
              "<button class='btn btn-danger btn-small' data-unbind='" +
                escapeHtml(link.guardian_id) + "|" +
                escapeHtml(link.student_id) + "'>解除</button>" +
              (parent ? "<button class='btn btn-small' data-reset-parent='" + escapeHtml(parent.id) + "'>重設密碼</button>" : "") +
              (parent ? "<button class='btn btn-danger btn-small' data-delete-parent='" + escapeHtml(parent.id) + "'>刪除帳號</button>" : "") +
            "</div>" +
          "</td>" +
        "</tr>"
    });
  });

  profilesCache.forEach(function (parent) {
    if (parent.role !== "parent") return;
    const parentId = String(parent.id);
    if (boundGuardianIds.has(parentId)) return;

    const loginIdentity = parent.email || parent.phone || "";
    const parentName = parent.display_name || loginIdentity || "未設定家長";
    guardianRowItems.push({
      className: "",
      searchText: [parentName, loginIdentity, "尚未綁定學生"].join(" ").toLocaleLowerCase(),
      html:
        "<tr class='guardian-unbound-row'>" +
          "<td>—</td>" +
          "<td>—</td>" +
          "<td><strong>" + escapeHtml(parentName) + "</strong><br><span class='muted'>" + escapeHtml(loginIdentity || "—") + "</span></td>" +
          "<td><span class='guardian-status-unbound'>尚未綁定學生</span></td>" +
          "<td>" + parentPasswordStatusBadge(parent.id) + "</td>" +
          "<td class='action-cell'><div class='action-buttons'>" +
            "<button class='btn btn-small' data-edit-parent='" + escapeHtml(parent.id) + "'>修改</button>" +
            "<button class='btn btn-small' data-reset-parent='" + escapeHtml(parent.id) + "'>重設密碼</button>" +
            "<button class='btn btn-danger btn-small' data-delete-parent='" + escapeHtml(parent.id) + "'>刪除帳號</button>" +
          "</div></td>" +
        "</tr>"
    });
  });

  activeStudents.forEach(function (student) {
    if (linkedStudentIds.has(String(student.id))) return;
    guardianRowItems.push({
      className: student.class_name,
      searchText: [
        student.full_name,
        student.student_code,
        student.class_name,
        "尚未綁定家長"
      ].join(" ").toLocaleLowerCase(),
      html:
        "<tr class='guardian-unbound-row'>" +
          "<td>" + escapeHtml(student.class_name) + "</td>" +
          "<td>" + escapeHtml(student.full_name) + "</td>" +
          "<td>—</td>" +
          "<td><span class='guardian-status-unbound'>尚未綁定家長</span></td>" +
          "<td>—</td>" +
          "<td class='action-cell'>請建立家長帳號並完成綁定</td>" +
        "</tr>"
    });
  });

  // 預先建立班級索引；選定班級時只掃描該班列資料，全部班級仍沿用原始順序。
  // 全部班級檢視時固定依國一、國二、國三排列；未綁定家長（無班級）排在最後。
  // 使用穩定排序，班級內原有資料順序不變。
  guardianRowItems.sort(function (a, b) {
    const aIndex = a.className ? classOrder.indexOf(a.className) : classOrder.length;
    const bIndex = b.className ? classOrder.indexOf(b.className) : classOrder.length;
    const aRank = aIndex < 0 ? classOrder.length : aIndex;
    const bRank = bIndex < 0 ? classOrder.length : bIndex;
    return aRank - bRank;
  });

  const guardianRowsByClass = new Map();
  guardianRowItems.forEach(function (item) {
    if (!item.className) return;
    if (!guardianRowsByClass.has(item.className)) guardianRowsByClass.set(item.className, []);
    guardianRowsByClass.get(item.className).push(item);
  });

  function buildGuardianRows() {
    const selectedClass = $("guardianClass") ? $("guardianClass").value : "";
    const keyword = $("guardianKeyword")
      ? $("guardianKeyword").value.trim().toLocaleLowerCase()
      : "";
    const candidates = selectedClass
      ? (guardianRowsByClass.get(selectedClass) || [])
      : guardianRowItems;
    const rows = [];

    candidates.forEach(function (item) {
      if (keyword && !item.searchText.includes(keyword)) return;
      rows.push(item.html);
    });

    return { html: rows.join(""), count: rows.length };
  }

  content.innerHTML =
    "<h2 class='section-title'>家長帳號管理</h2>" +

    "<div class='panel'><h3>新增家長帳號</h3>" +
      "<p class='muted'>可選擇使用 Email 或手機號碼建立家長帳號。手機帳號不需要簡訊驗證。</p>" +
      "<form id='createParentForm'><div class='form-grid'>" +
        "<div class='field'><label>帳號類型</label><select id='newParentAccountType'><option value='email'>Email 登入</option><option value='phone'>手機號碼登入</option></select></div>" +
        "<div class='field'><label>家長 Email／手機號碼</label><input id='newParentAccount' type='text' placeholder='請輸入 Email 或 0912345678' autocomplete='off' required></div>" +
        "<div class='field'><label>綁定學生</label><select id='newParentStudent' required><option value=''>請選擇學生</option>" + studentOptions + "</select></div>" +
      "</div>" +
      "<p class='muted'>系統會產生一次性隨機臨時密碼。家長首次登入時，必須先設定自己的新密碼。</p>" +
      "<button class='btn btn-success' type='submit' id='createParentButton'>建立家長帳號</button>" +
      "</form></div>" +

    "<div class='panel'><h3>既有家長帳號與學生綁定</h3>" +
      "<form id='guardianForm'><div class='form-grid'>" +
        "<div class='field'><label>家長帳號</label><select id='guardianParent' required><option value=''>請選擇家長</option>" + parentOptions + "</select></div>" +
        "<div class='field'><label>學生</label><select id='guardianStudent' required><option value=''>請選擇學生</option>" + studentOptions + "</select></div>" +
      "</div><button class='btn btn-success' type='submit' id='saveGuardianBindingButton'>建立綁定</button></form></div>" +

    "<div class='panel'>" +
      "<h3>既有家長帳號與學生綁定清單</h3>" +
      "<p class='muted'>密碼狀態依系統追蹤紀錄判斷。舊帳號若缺少歷史紀錄，會顯示「無法判定」，不會推測是否仍使用原密碼。</p>" +
      "<div id='parentPasswordStatusSummary' class='parent-password-status-summary'>密碼狀態統計載入中…</div>" +
      "<div class='toolbar guardian-filter-toolbar'>" +
        "<label for='guardianClass'><strong>班級：</strong></label>" +
        "<select id='guardianClass'>" +
          "<option value=''>全部班級</option>" +
          "<option value='國一班'>國一班</option>" +
          "<option value='國二班'>國二班</option>" +
          "<option value='國三班'>國三班</option>" +
        "</select>" +
        "<label for='guardianKeyword'><strong>搜尋：</strong></label>" +
        "<input id='guardianKeyword' type='search' placeholder='姓名、學生編號或家長帳號' aria-label='搜尋家長或學生' style='min-width:220px;flex:1'>" +
        "<span id='guardianResultCount' class='muted' style='font-size: 14px'></span>" +
      "</div>" +
      "<div class='table-wrap'><table class='guardian-management-table'>" +
        "<thead><tr><th>班級</th><th>學生姓名</th><th>家長名稱／帳號</th><th>綁定狀態</th><th>密碼狀態</th><th>操作</th></tr></thead>" +
        "<tbody id='guardianRows'>" +
          (buildGuardianRows().html || "<tr><td colspan='6' class='empty'>目前沒有家長帳號資料</td></tr>") +
        "</tbody>" +
      "</table></div>" +
    "</div>";

  $("createParentForm").addEventListener("submit", createParentAccount);
  $("guardianForm").addEventListener("submit", saveGuardianBinding);

  function refreshGuardianRows() {
    const result = buildGuardianRows();
    $("guardianRows").innerHTML =
      result.html || "<tr><td colspan='6' class='empty'>沒有符合條件的家長或學生</td></tr>";
    const counter = $("guardianResultCount");
    if (counter) counter.textContent = "符合條件 " + result.count + " 筆";
  }

  $("guardianClass").addEventListener("change", refreshGuardianRows);
  $("guardianKeyword").addEventListener("input", refreshGuardianRows);
  refreshGuardianRows();
  loadParentPasswordStatuses();

  content.onclick = async function (event) {
    const editButton = event.target.closest("[data-edit-parent]");
    const unbindButton = event.target.closest("[data-unbind]");
    const resetButton = event.target.closest("[data-reset-parent]");
    const deleteButton = event.target.closest("[data-delete-parent]");

    if (editButton) {
      await editParentAccount(editButton.dataset.editParent);
      return;
    }

    if (unbindButton) {
      const parts = unbindButton.dataset.unbind.split("|");
      await removeGuardianBinding(parts[0], parts[1]);
      return;
    }

    if (resetButton) {
      await resetParentPassword(resetButton.dataset.resetParent);
      return;
    }

    if (deleteButton) {
      await deleteParentAccount(deleteButton.dataset.deleteParent);
    }
  };
}

// ==================================================
// 11-1. 刪除尚未綁定學生的家長帳號
// ==================================================

async function deleteUnboundParentAccount(parentId) {
  const parent = parentProfilesByIdCache.get(String(parentId));

  if (!parent) {
    showMessage("找不到這位家長的帳號資料，請重新整理。", "error");
    return;
  }

  const hasBinding = guardiansWithBindingsCache.has(String(parentId));

  if (hasBinding) {
    showMessage("這個家長帳號仍有學生綁定，請先解除所有綁定後再刪除。", "error");
    return;
  }

  if (!confirm(
    "確定要永久刪除這個未綁定的家長帳號嗎？\n\n" +
    "家長姓名：" + (parent.display_name || "未設定姓名") + "\n" +
    "登入 Email：" + (parent.email || "—") + "\n\n" +
    "此操作會同時刪除 Supabase Auth 登入帳號及 profiles 資料，且無法復原。"
  )) return;

  try {
    const result = await db.functions.invoke(
      "admin-delete-parent-account",
      { body: { parentId: parentId } }
    );

    if (result.error) {
      throw new Error(
        result.data && result.data.error
          ? result.data.error
          : result.error.message
      );
    }

    const data = result.data || {};
    if (!data.success) {
      throw new Error(data.error || "家長帳號刪除失敗。");
    }

    // 未綁定家長刪除成功後，只移除該筆家長快取並重建索引。
    profilesCache = profilesCache.filter(
      profile => String(profile.id) !== String(parentId)
    );
    rebuildAdminEntityIndexes();
    renderGuardians();
    showMessage("家長登入帳號及資料已成功刪除。", "success");

  } catch (error) {
    console.error("刪除家長帳號失敗：", error);
    showMessage("刪除家長帳號失敗：" + error.message, "error");
  }
}

// ==================================================
// 11-2. 修改家長姓名及 Email
// ==================================================

async function editParentAccount(parentId) {
  const parent = parentProfilesByIdCache.get(String(parentId));

  if (!parent) {
    showMessage("找不到這位家長的帳號資料，請重新整理。", "error");
    return;
  }

  const displayNameInput = prompt(
    "請輸入家長姓名：",
    parent.display_name || ""
  );

  if (displayNameInput === null) return;

  const displayName = displayNameInput.trim();

  if (!displayName) {
    showMessage("家長姓名不可空白。", "error");
    return;
  }

  const isPhoneAccount = Boolean(parent.phone) || !parent.email;
  let email = "";
  let phone = "";

  if (isPhoneAccount) {
    const phoneInput = prompt(
      "請輸入家長登入手機號碼：",
      parent.phone || ""
    );

    if (phoneInput === null) return;

    phone = phoneInput.trim().replace(/[\\s()-]/g, "");

    if (!/^09\\d{8}$/.test(phone) &&
        !/^8869\\d{8}$/.test(phone) &&
        !/^\\+8869\\d{8}$/.test(phone)) {
      showMessage("請輸入有效的台灣手機號碼，例如 0912345678。", "error");
      return;
    }

    if (/^09\\d{8}$/.test(phone)) {
      phone = "+886" + phone.substring(1);
    } else if (/^8869\\d{8}$/.test(phone)) {
      phone = "+" + phone;
    }

    const duplicate = profilesCache.find(function (item) {
      return String(item.id) !== String(parentId) &&
        String(item.phone || "").replace(/[\\s()-]/g, "") === phone;
    });

    if (duplicate) {
      showMessage("這支手機號碼已經被其他家長帳號使用。", "error");
      return;
    }
  } else {
    const emailInput = prompt(
      "請輸入家長登入 Email：",
      parent.email || ""
    );

    if (emailInput === null) return;

    email = emailInput.trim().toLowerCase();

    const emailPattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

    if (!emailPattern.test(email)) {
      showMessage("請輸入有效的 Email 地址。", "error");
      return;
    }

    const duplicate = profilesCache.find(function (item) {
      return String(item.id) !== String(parentId) &&
        String(item.email || "").toLowerCase() === email;
    });

    if (duplicate) {
      showMessage("這個 Email 已經被其他家長帳號使用。", "error");
      return;
    }
  }

  const accountLabel = isPhoneAccount ? "手機號碼" : "Email";
  const oldAccount = isPhoneAccount
    ? (parent.phone || "—")
    : (parent.email || "—");
  const newAccount = isPhoneAccount ? phone : email;

  if (!confirm(
    "確認修改家長資料嗎？\n\n" +
    "原姓名：" + (parent.display_name || "—") + "\n" +
    "新姓名：" + displayName + "\n\n" +
    "原" + accountLabel + "：" + oldAccount + "\n" +
    "新" + accountLabel + "：" + newAccount + "\n\n" +
    "家長密碼及學生綁定不會變更。"
  )) return;

  try {
    const result = await db.functions.invoke(
      "admin-update-parent-account",
      {
        body: isPhoneAccount
          ? {
              parentId: parentId,
              displayName: displayName,
              phone: phone
            }
          : {
              parentId: parentId,
              displayName: displayName,
              email: email
            }
      }
    );

    if (result.error) {
      throw new Error(
        result.data && result.data.error
          ? result.data.error
          : result.error.message
      );
    }

    const data = result.data || {};

    if (!data.success) {
      throw new Error(data.error || "家長資料更新失敗。");
    }

    // 家長資料更新只同步該筆 profiles 快取，學生與成績資料無須重載。
    profilesCache = profilesCache.map(function (profile) {
      if (String(profile.id) !== String(parentId)) return profile;
      return {
        ...profile,
        display_name: displayName,
        ...(isPhoneAccount
          ? { phone: phone }
          : { email: email })
      };
    });
    rebuildAdminEntityIndexes();
    renderGuardians();

    showMessage(
      "家長姓名及登入" + accountLabel + "已成功更新。",
      "success"
    );

  } catch (error) {
    console.error("修改家長資料失敗：", error);
    showMessage("修改家長資料失敗：" + error.message, "error");
  }
}

// ==================================================
// 11-3. 呼叫 Edge Function 建立家長帳號
// ==================================================

async function createParentAccount(event) {
  event.preventDefault();

  const accountType = $("newParentAccountType").value;
  const accountInput = $("newParentAccount").value.trim();
  const studentId = $("newParentStudent").value;
  const button = $("createParentButton");

  let email = null;
  let phone = null;
  let loginLabel = accountInput;

  try {
    if (accountType === "phone") {
      phone = normalizeTaiwanMobile(accountInput);
      loginLabel = phone;
    } else {
      email = accountInput.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("請輸入有效的 Email 地址。");
      }
      loginLabel = email;
    }
  } catch (error) {
    showMessage(error.message, "error");
    return;
  }

  const displayName = loginLabel;

  // 先比對目前已載入的家長帳號，避免重複呼叫 Edge Function。
  const duplicateParent = profilesCache.find(function (profile) {
    if (accountType === "phone") {
      const existingPhone = profile.phone
        ? normalizeTaiwanMobile(profile.phone)
        : "";
      return existingPhone && existingPhone === phone;
    }
    return String(profile.email || "").trim().toLowerCase() === email;
  });

  if (duplicateParent) {
    showMessage(
      "此 " + (accountType === "phone" ? "手機號碼" : "Email") +
      " 已經建立過家長帳號，請勿重複建立。若要新增學生，請至「家長綁定」將既有家長帳號與學生綁定。",
      "error"
    );
    return;
  }

  if (!studentId) {
    showMessage("請選擇要綁定的學生。", "error");
    return;
  }

  const student = studentsByIdCache.get(String(studentId));
  if (!student) {
    showMessage("找不到所選學生，請重新整理後再試。", "error");
    return;
  }

  if (!confirm(
    "請確認以下家長帳號資料：\n\n" +
    "帳號類型：" + (accountType === "phone" ? "手機號碼" : "Email") + "\n" +
    "登入帳號：" + loginLabel + "\n" +
    "綁定學生：" + student.full_name + "\n" +
    "班級：" + student.class_name + "\n" +
    "初始密碼：系統將自動產生一次性隨機密碼，首次登入必須修改。\n\n" +
    "確認建立家長帳號嗎？"
  )) return;

  button.disabled = true;
  button.textContent = "建立中……";

  try {
    const result = await db.functions.invoke(
      "admin-create-parent-account",
      {
        body: { email, phone, displayName, studentId }
      }
    );

    if (result.error) {
      throw new Error(
        result.data && result.data.error
          ? result.data.error
          : result.error.message
      );
    }

    const data = result.data || {};
    if (!data.success || !data.initialPassword) {
      throw new Error(data.error || "帳號建立結果不完整，請確認 Supabase Edge Function。");
    }

    await loadAdminData();
    renderGuardians();

    const passwordText = data.initialPassword;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(passwordText);
        copied = true;
      }
    } catch (copyError) {
      console.warn("複製初始密碼失敗：", copyError);
    }

    alert(
      "家長帳號建立成功！\n\n" +
      "登入帳號：" + loginLabel + "\n" +
      "綁定學生：" + student.full_name + "\n" +
      "初始密碼：" + passwordText + "\n\n" +
      (copied
        ? "初始密碼已複製，可以直接貼到 LINE 傳給家長。"
        : "請記下初始密碼，並透過 LINE 提供給家長。")
    );

    showMessage(
      "家長帳號「" + loginLabel + "」已建立，並完成「" + student.full_name + "」的學生綁定。",
      "success"
    );

  } catch (error) {
    console.error("建立家長帳號失敗：", error);

    let detail = error.message || "未知錯誤";
    // Edge Function 可能以非 2xx 回應包裝重複帳號錯誤，嘗試讀取伺服器回傳的明確訊息。
    try {
      const response = error.context;
      if (response && typeof response.clone === "function") {
        const payload = await response.clone().json();
        detail = payload.error || payload.message || detail;
      }
    } catch (parseError) {
      // 保留原始錯誤訊息，不影響主要錯誤處理。
    }

    const normalizedDetail = String(detail).toLowerCase();
    const duplicateError =
      /already exists|already registered|duplicate|user already|email.*(exist|registered)|phone.*(exist|registered)|已存在|重複/.test(normalizedDetail);

    if (duplicateError) {
      showMessage(
        "此 " + (accountType === "phone" ? "手機號碼" : "Email") +
        " 已經建立過家長帳號，請勿重複建立。若要新增學生，請至「家長綁定」使用既有家長帳號。",
        "error"
      );
    } else {
      showMessage("建立家長帳號失敗：" + detail, "error");
    }
  } finally {
    const currentButton = $("createParentButton");
    if (currentButton) {
      currentButton.disabled = false;
      currentButton.textContent = "建立家長帳號";
    }
  }
}

// ==================================================
// 11-4. 原有手動建立家長綁定
// ==================================================

async function saveGuardianBinding(event) {
  event.preventDefault();

  const button = $("saveGuardianBindingButton");
  if (!button || button.disabled) return;

  const guardianId = $("guardianParent").value;
  const studentId = $("guardianStudent").value;
  if (!guardianId || !studentId) {
    showMessage("請先選擇家長帳號及學生。", "error");
    return;
  }

  const exists = guardianStudentBindingKeysCache.has(
    JSON.stringify([String(guardianId), String(studentId)])
  );

  if (exists) {
    showMessage("這筆家長與學生綁定已存在，請勿重複建立。", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "建立中……";
  try {
    const result = await db.from("guardian_students").insert({
      guardian_id: guardianId,
      student_id: studentId
    });

    if (result.error) {
      if (result.error.code === "23505") {
        throw new Error("這筆家長與學生綁定已存在，請重新整理清單確認。");
      }
      throw result.error;
    }

    // 新增綁定只影響家長綁定快取，無須重新載入整套管理端資料。
    guardianLinksCache.push({ guardian_id: guardianId, student_id: studentId });
    rebuildGuardianBindingIndexes();
    renderGuardians();
    showMessage("家長與學生已成功綁定。", "success");

  } catch (error) {
    showMessage("建立綁定失敗：" + error.message, "error");
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "建立綁定";
    }
  }
}

async function removeGuardianBinding(guardianId, studentId) {
  if (!confirm("確定解除這筆家長與學生的綁定？")) return;

  try {
    const result = await db
      .from("guardian_students")
      .delete()
      .eq("guardian_id", guardianId)
      .eq("student_id", studentId);

    if (result.error) throw result.error;

    // 解除綁定只同步對應的本機關聯資料與索引。
    guardianLinksCache = guardianLinksCache.filter(link =>
      !(String(link.guardian_id) === String(guardianId) &&
        String(link.student_id) === String(studentId))
    );
    rebuildGuardianBindingIndexes();
    renderGuardians();
    showMessage("已解除綁定。", "success");

  } catch (error) {
    showMessage("解除綁定失敗：" + error.message, "error");
  }
}


// ==================================================
// 12. 家長密碼管理
// ==================================================

function renderPasswords() {
  const content = $("adminContent");
  const studentsById = studentsByIdCache;
  const linksByGuardian = new Map();

  guardianLinksCache.forEach(function (link) {
    const guardianId = String(link.guardian_id);
    const student = studentsById.get(String(link.student_id));
    if (!student) return;
    if (!linksByGuardian.has(guardianId)) linksByGuardian.set(guardianId, []);
    linksByGuardian.get(guardianId).push(student);
  });

  const rows = profilesCache.map(function (profile) {
    const loginAccount = profile.email || profile.phone || "—";
    const linkedStudents = linksByGuardian.get(String(profile.id)) || [];
    const linkedStudentNames = Array.from(new Set(linkedStudents.map(student => student.full_name)));
    const searchableText = [
      profile.display_name || "",
      profile.email || "",
      profile.phone || "",
      ...linkedStudents.flatMap(student => [
        student.full_name || "",
        student.student_code || "",
        student.class_name || ""
      ])
    ].join(" ").toLocaleLowerCase();

    return "<tr data-parent-search='" + escapeHtml(searchableText) + "'>" +
      "<td>" + escapeHtml(profile.display_name || "未設定姓名") + "</td>" +
      "<td>" + escapeHtml(loginAccount) + "</td>" +
      "<td>" + (linkedStudentNames.length
        ? linkedStudentNames.map(escapeHtml).join("、")
        : "<span class='muted'>尚未綁定學生</span>") + "</td>" +
      "<td><div class='action-buttons'>" +
        "<button class='btn btn-small' data-reset-parent='" + escapeHtml(profile.id) + "'>重設密碼</button>" +
        "<button class='btn btn-danger btn-small' data-delete-parent='" + escapeHtml(profile.id) + "'>刪除帳號</button>" +
      "</div></td>" +
      "</tr>";
  }).join("");

  content.innerHTML =
    "<h2 class='section-title'>家長帳號管理</h2>" +
    "<p class='muted'>可重設家長登入密碼，或刪除不再使用的家長帳號。刪除前請確認家長姓名及綁定學生；刪除帳號後會解除該家長的所有學生綁定，但學生資料及成績會保留。</p>" +
    "<div class='toolbar parent-account-filter-toolbar'>" +
      "<label for='parentAccountKeyword'><strong>搜尋：</strong></label>" +
      "<input id='parentAccountKeyword' type='search' placeholder='家長姓名、Email、手機或學生姓名／編號' aria-label='搜尋家長帳號或已綁定學生' style='min-width:240px;flex:1'>" +
      "<span id='parentAccountResultCount' class='muted' style='font-size: 14px'></span>" +
    "</div>" +
    "<div class='table-wrap password-table-wrap'><table class='password-management-table'>" +
      "<thead><tr><th>家長姓名</th><th>登入帳號（Email／手機）</th><th>已綁定學生</th><th>操作</th></tr></thead>" +
      "<tbody id='parentAccountRows'>" + (rows || "<tr><td colspan='4' class='empty'>目前沒有家長帳號</td></tr>") + "</tbody>" +
    "</table></div>";

  const searchInput = $("parentAccountKeyword");
  const resultCount = $("parentAccountResultCount");
  const accountRows = Array.from(content.querySelectorAll("tr[data-parent-search]"));

  function applyParentAccountSearch() {
    const keyword = searchInput.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    accountRows.forEach(function (row) {
      const matched = !keyword || row.dataset.parentSearch.includes(keyword);
      row.hidden = !matched;
      if (matched) visibleCount += 1;
    });
    resultCount.textContent = "符合條件 " + visibleCount + "／" + accountRows.length + " 位家長";
  }

  searchInput.addEventListener("input", applyParentAccountSearch);
  applyParentAccountSearch();

  content.onclick = async function (event) {
    const resetButton = event.target.closest("[data-reset-parent]");
    if (resetButton) {
      await resetParentPassword(resetButton.dataset.resetParent);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-parent]");
    if (deleteButton) {
      await deleteParentAccount(deleteButton.dataset.deleteParent);
    }
  };
}

function getLinkedStudentNames(parentUserId) {
  const studentsById = studentsByIdCache;
  const names = new Set();
  guardianLinksCache.forEach(function (link) {
    if (String(link.guardian_id) !== String(parentUserId)) return;
    const student = studentsById.get(String(link.student_id));
    if (student && student.full_name) names.add(student.full_name);
  });
  return Array.from(names);
}

async function resetParentPassword(parentUserId) {
  const parent = parentProfilesByIdCache.get(String(parentUserId));
  if (!parent) {
    showMessage("找不到這筆家長帳號資料，請重新整理後再試。", "error");
    return;
  }

  const linkedStudentNames = getLinkedStudentNames(parentUserId);
  const loginAccount = parent.email || parent.phone || "未設定";
  if (!confirm(
    "確定重設這位家長的登入密碼嗎？\n\n" +
    "家長姓名：" + (parent.display_name || "未命名") + "\n" +
    "登入帳號：" + loginAccount + "\n" +
    "綁定學生：" + (linkedStudentNames.length ? linkedStudentNames.join("、") : "尚未綁定") + "\n\n" +
    "重設後，請將系統回傳的臨時密碼提供給家長。"
  )) return;

  const button = Array.from(document.querySelectorAll("[data-reset-parent]"))
    .find(item => String(item.dataset.resetParent) === String(parentUserId));
  if (button) {
    button.disabled = true;
    button.textContent = "重設中…";
  }

  try {
    const result = await db.functions.invoke("admin-reset-parent-password", {
      body: { parentUserId: parentUserId }
    });
    if (result.error) {
      const detail = result.data && result.data.error ? result.data.error : result.error.message;
      throw new Error(detail || "重設家長密碼失敗。");
    }

    const data = result.data || {};
    if (data.success !== true) {
      throw new Error(data.error || "伺服器未確認密碼重設成功，請確認後再試。");
    }

    const temporaryPassword = [
      data.temporaryPassword,
      data.tempPassword,
      data.initialPassword
    ].find(value => typeof value === "string" && value.trim());

    if (!temporaryPassword) {
      throw new Error("伺服器未回傳有效的臨時密碼。為避免提供錯誤密碼，系統不會顯示重設成功，請先確認帳號狀態。");
    }

    if (button) {
      button.disabled = false;
      button.textContent = "重設密碼";
    }
    showMessage("家長密碼已重設。臨時密碼：" + temporaryPassword.trim() + "。請將臨時密碼提供給家長。", "success");
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "重設密碼";
    }
    showMessage("重設家長密碼失敗：" + error.message, "error");
  }
}

async function deleteParentAccount(parentUserId) {
  const parent = parentProfilesByIdCache.get(String(parentUserId));

  if (!parent) {
    showMessage("找不到這筆家長帳號資料，請重新整理後再試。", "error");
    return;
  }

  const loginAccount = parent.email || parent.phone || "未設定";
  const linkedStudentNames = getLinkedStudentNames(parentUserId);
  const confirmed = confirm(
    "確定要永久刪除以下家長帳號？\n\n" +
    "家長姓名：" + (parent.display_name || "未命名") + "\n" +
    "登入帳號：" + loginAccount + "\n" +
    "綁定學生：" + (linkedStudentNames.length ? linkedStudentNames.join("、") : "尚未綁定") + "\n\n" +
    "刪除後：\n" +
    "1. 該家長將無法再登入。\n" +
    "2. 該家長與學生的綁定將解除。\n" +
    "3. 學生資料及考試成績會保留。\n\n" +
    "此操作無法復原，確定要刪除嗎？"
  );
  if (!confirmed) return;

  const button = document.querySelector("[data-delete-parent='" + parentUserId + "']");
  if (button) {
    button.disabled = true;
    button.textContent = "刪除中…";
  }

  try {
    const result = await db.functions.invoke("admin-delete-parent-account", {
      body: { parentId: parentUserId }
    });

    if (result.error) {
      const detail = result.data && result.data.error ? result.data.error : result.error.message;
      throw new Error(detail || "刪除家長帳號失敗。");
    }

    const data = result.data || {};
    if (!data.success) {
      throw new Error(data.error || "刪除家長帳號失敗。");
    }

    profilesCache = profilesCache.filter(function (profile) {
      return String(profile.id) !== String(parentUserId);
    });
    guardianLinksCache = guardianLinksCache.filter(function (link) {
      return String(link.guardian_id) !== String(parentUserId);
    });
    rebuildAdminEntityIndexes();
    rebuildGuardianBindingIndexes();
    renderGuardians();
    showMessage("家長帳號已刪除，學生資料及成績均已保留。", "success");
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "刪除帳號";
    }
    showMessage("刪除家長帳號失敗：" + error.message, "error");
  }
}

