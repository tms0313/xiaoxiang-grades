
// ========================================
// 小象文教機構｜成績管理系統
// 完整版 app.js
// ========================================

const db = supabaseClient;

// ========================================
// 頁面樣式
// ========================================

const style = document.createElement("style");

style.textContent = `
.dashboard {
  width: min(1200px, 94%);
  margin: 30px auto;
  background: #fff;
  padding: 28px;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,.08);
}

.dashboard h1 {
  color:#17365d;
  margin-bottom:8px;
}

.dashboard h2 {
  color:#17365d;
  border-bottom:2px solid #d9b66f;
  padding-bottom:10px;
  margin-top:10px;
}

.dashboard .topbar {
  display:flex;
  justify-content:space-between;
  align-items:center;
  flex-wrap:wrap;
  gap:12px;
}

.dashboard .user-info {
  color:#666;
  font-size:14px;
}

.dashboard button {
  background:#17365d;
  color:white;
  border:0;
  border-radius:7px;
  padding:10px 16px;
  cursor:pointer;
  margin:4px 4px 4px 0;
}

.dashboard button:hover {
  opacity:.88;
}

.dashboard button.secondary {
  background:#777;
}

.dashboard input,
.dashboard select {
  width:100%;
  padding:11px;
  margin:6px 0 14px;
  border:1px solid #ccc;
  border-radius:7px;
  box-sizing:border-box;
}

.dashboard label {
  display:block;
  font-weight:600;
}

.dashboard .panel {
  background:#f7f9fc;
  padding:18px;
  border-radius:10px;
  margin-top:18px;
}

.dashboard table {
  width:100%;
  border-collapse:collapse;
  margin-top:12px;
  background:white;
}

.dashboard th,
.dashboard td {
  border:1px solid #ddd;
  padding:10px;
  text-align:left;
  white-space:nowrap;
}

.dashboard th {
  background:#edf1f7;
  color:#17365d;
}

.dashboard .notice {
  color:#666;
  font-size:14px;
}

.dashboard .success {
  color:#187344;
}

.dashboard .error {
  color:#b42318;
}

.dashboard .form-grid {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:12px;
}

.dashboard .table-wrap {
  width:100%;
  overflow-x:auto;
}

@media(max-width:600px) {
  .dashboard {
    padding:16px;
    margin:12px auto;
  }

  .dashboard table {
    font-size:13px;
  }

  .dashboard th,
  .dashboard td {
    padding:7px;
  }
}
`;

document.head.appendChild(style);

// ========================================
// 全域變數
// ========================================

let currentUser = null;
let currentProfile = null;

let studentsCache = [];
let examsCache = [];

let overviewRows = [];

// ========================================
// 共用函式
// ========================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(message, type = "") {
  const area = document.getElementById("appMessage");

  if (area) {
    area.textContent = message;
    area.className = "notice " + type;
  }
}

// ========================================
// 登入畫面
// ========================================

function loginPage() {
  document.body.innerHTML = `
    <main class="login-page">
      <section class="login-card">
        <div class="logo">小象</div>

        <p class="school-name">
          小象文教機構・七堵校區
        </p>

        <h1>成績管理系統</h1>

        <p class="subtitle">
          學生學習紀錄與成績查詢平台
        </p>

        <form id="loginForm">

          <label for="email">電子郵件</label>

          <input
            id="email"
            type="email"
            placeholder="請輸入電子郵件"
            autocomplete="username"
            required
          >

          <label for="password">登入密碼</label>

          <input
            id="password"
            type="password"
            placeholder="請輸入密碼"
            autocomplete="current-password"
            required
          >

          <button type="submit">登入系統</button>

          <p id="message" role="status"></p>

        </form>

        <footer>© 小象文教機構 七堵校區</footer>
      </section>
    </main>
  `;

  document
    .getElementById("loginForm")
    .addEventListener("submit", login);
}

// ========================================
// 登入處理
// ========================================

async function login(event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const message = document.getElementById("message");

  message.textContent = "登入中，請稍候……";

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    message.textContent = "登入失敗：" + error.message;
    return;
  }

  currentUser = data.user;

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id,email,display_name,role")
    .eq("id", currentUser.id)
    .single();

  if (profileError || !profile) {
    message.textContent = "無法讀取帳號權限，請聯絡管理員。";
    await db.auth.signOut();
    return;
  }

  currentProfile = profile;

  // 記錄登入時間
  const { error: loginError } = await db
    .from("login_events")
    .insert({
      user_id: currentUser.id
    });

  if (loginError) {
    console.error("登入紀錄寫入失敗：", loginError.message);
  }

  renderDashboard();
}

// ========================================
// 登入後主畫面
// ========================================

function renderDashboard() {
  const roleNames = {
    admin: "管理員",
    teacher: "老師",
    parent: "家長"
  };

  document.body.innerHTML = `
    <main class="dashboard">

      <div class="topbar">

        <div>
          <h1>小象文教機構｜成績管理系統</h1>

          <div class="user-info">
            ${escapeHTML(
              currentProfile.display_name || currentProfile.email
            )}
            ・${roleNames[currentProfile.role] || "使用者"}
          </div>
        </div>

        <button id="logoutBtn" class="secondary">
          登出
        </button>

      </div>

      <p id="appMessage" class="notice"></p>

      <div id="mainContent">
        ${
          currentProfile.role === "parent"
            ? parentView()
            : staffView()
        }
      </div>

    </main>
  `;

  document
    .getElementById("logoutBtn")
    .addEventListener("click", logout);

  if (currentProfile.role === "parent") {
    loadParentScores();
  } else {
    loadStaffData();
  }
}

// ========================================
// 管理員及老師畫面
// ========================================

function staffView() {
  return `

    <!-- 一、學生資料管理 -->

    <section class="panel">

      <h2>一、學生資料管理</h2>

      <form id="studentForm">

        <div class="form-grid">

          <div>
            <label>學生姓名</label>
            <input
              name="full_name"
              required
              placeholder="請輸入學生姓名"
            >
          </div>

          <div>
            <label>學生編號</label>
            <input
              name="student_code"
              required
              placeholder="例如：A001"
            >
          </div>

          <div>
            <label>班級</label>

            <select name="class_name" required>
              <option value="國一班">國一班</option>
              <option value="國二班">國二班</option>
              <option value="國三班">國三班</option>
            </select>
          </div>

        </div>

        <button type="submit">新增學生</button>

      </form>

      <div id="studentList"></div>

    </section>


    <!-- 二、周考場次管理 -->

    <section class="panel">

      <h2>二、周考場次管理</h2>

      <form id="examForm">

        <div class="form-grid">

          <div>
            <label>開始日期</label>
            <input
              type="date"
              name="start_date"
              required
            >
          </div>

          <div>
            <label>結束日期</label>
            <input
              type="date"
              name="end_date"
              required
            >
          </div>

        </div>

        <button type="submit">建立周考場次</button>

      </form>

      <div id="examList"></div>

    </section>


    <!-- 三、學生成績登錄 -->

    <section class="panel">

      <h2>三、學生成績登錄</h2>

      <form id="scoreForm">

        <label>選擇學生</label>

        <select
          name="student_id"
          id="scoreStudent"
          required
        ></select>

        <label>選擇考試場次</label>

        <select
          name="exam_id"
          id="scoreExam"
          required
        ></select>

        <label>科目</label>

        <select name="subject" required>
          <option value="國文">國文</option>
          <option value="英文">英文</option>
          <option value="自然">自然</option>
        </select>

        <label>考試範圍</label>

        <input
          type="text"
          name="scope"
          placeholder="例如：第三課～第五課"
        >

        <label>成績（0～100）</label>

        <input
          type="number"
          name="score"
          min="0"
          max="100"
          required
        >

        <button type="submit">儲存成績</button>

      </form>

    </section>


    <!-- 四、全校成績總覽 -->

    <section class="panel">

      <h2>四、全校成績總覽</h2>

      <div class="form-grid">

        <div>
          <label>選擇班級</label>

          <select id="overviewClass">
            <option value="國一班">國一班</option>
            <option value="國二班">國二班</option>
            <option value="國三班">國三班</option>
          </select>
        </div>

        <div>
          <label>選擇考試場次</label>

          <select id="overviewExam"></select>
        </div>

      </div>

      <button type="button" id="queryOverviewBtn">
        查詢全班成績
      </button>

      <button type="button" id="exportOverviewBtn">
        匯出 Excel CSV
      </button>

      <div id="overviewResult">
        <p class="notice">
          請選擇班級及考試場次後查詢。
        </p>
      </div>

    </section>


    <!-- 五、家長帳號綁定 -->

    <section class="panel">

      <h2>五、家長帳號綁定</h2>

      <p class="notice">
        請先在 Supabase 建立家長登入帳號，
        再輸入該帳號的電子郵件進行綁定。
      </p>

      <form id="bindForm">

        <label>家長電子郵件</label>

        <input
          type="email"
          name="email"
          required
        >

        <label>要綁定的學生</label>

        <select
          name="student_id"
          id="bindStudent"
          required
        ></select>

        <button type="submit">
          綁定家長與學生
        </button>

      </form>

    </section>


    <!-- 六、家長登入紀錄 -->

    <section class="panel">

      <h2>六、家長登入紀錄</h2>

      <div id="loginList"></div>

    </section>

  `;
}

// ========================================
// 家長畫面
// ========================================

function parentView() {
  return `
    <section class="panel">

      <h2>孩子的學習成績</h2>

      <p class="notice">
        以下僅顯示已與此家長帳號綁定的學生資料。
      </p>

      <div id="parentScores">
        正在讀取成績……
      </div>

    </section>
  `;
}

// ========================================
// 載入管理資料
// ========================================

async function loadStaffData() {

  const [studentResult, examResult] = await Promise.all([

    db.from("students")
      .select("id,student_code,full_name,class_name")
      .order("class_name")
      .order("student_code"),

    db.from("exams")
      .select("id,title,start_date,end_date")
      .order("start_date", { ascending: false })

  ]);

  if (studentResult.error || examResult.error) {

    showMessage(
      "讀取資料失敗：" +
      (
        studentResult.error?.message ||
        examResult.error?.message
      ),
      "error"
    );

    return;
  }

  studentsCache = studentResult.data || [];
  examsCache = examResult.data || [];

  // 學生列表

  document.getElementById("studentList").innerHTML =
    studentsCache.length

      ? `
        <div class="table-wrap">
          <table>

            <tr>
              <th>編號</th>
              <th>姓名</th>
              <th>班級</th>
            </tr>

            ${studentsCache.map(s => `
              <tr>
                <td>${escapeHTML(s.student_code)}</td>
                <td>${escapeHTML(s.full_name)}</td>
                <td>${escapeHTML(s.class_name)}</td>
              </tr>
            `).join("")}

          </table>
        </div>
      `

      : `<p class="notice">目前尚未建立學生資料。</p>`;


  // 考試場次列表

  document.getElementById("examList").innerHTML =
    examsCache.length

      ? `
        <div class="table-wrap">
          <table>

            <tr>
              <th>考試場次</th>
              <th>開始日期</th>
              <th>結束日期</th>
            </tr>

            ${examsCache.map(e => `
              <tr>
                <td>${escapeHTML(e.title)}</td>
                <td>${escapeHTML(e.start_date)}</td>
                <td>${escapeHTML(e.end_date)}</td>
              </tr>
            `).join("")}

          </table>
        </div>
      `

      : `<p class="notice">目前尚未建立考試場次。</p>`;


  // 學生下拉選單

  const studentOptions = studentsCache.map(s => `
    <option value="${escapeHTML(s.id)}">
      ${escapeHTML(s.class_name)}｜${escapeHTML(s.full_name)}
    </option>
  `).join("");


  // 考試下拉選單

  const examOptions = examsCache.map(e => `
    <option value="${escapeHTML(e.id)}">
      ${escapeHTML(e.title)}
    </option>
  `).join("");


  document.getElementById("scoreStudent").innerHTML =
    studentOptions || `<option value="">請先新增學生</option>`;

  document.getElementById("bindStudent").innerHTML =
    studentOptions || `<option value="">請先新增學生</option>`;

  document.getElementById("scoreExam").innerHTML =
    examOptions || `<option value="">請先建立考試場次</option>`;


  // 全校成績總覽考試場次

  const overviewExam = document.getElementById("overviewExam");

  if (overviewExam) {
    overviewExam.innerHTML =
      examOptions || `<option value="">目前沒有考試場次</option>`;
  }


  // 管理員查看登入紀錄

  if (currentProfile.role === "admin") {

    loadLoginEvents();

  } else {

    document.getElementById("loginList").textContent =
      "僅管理員可以查看家長登入紀錄。";

  }


  // 表單事件

  document.getElementById("studentForm")
    .addEventListener("submit", addStudent);

  document.getElementById("examForm")
    .addEventListener("submit", addExam);

  document.getElementById("scoreForm")
    .addEventListener("submit", saveScore);

  document.getElementById("bindForm")
    .addEventListener("submit", bindGuardian);


  // 成績總覽按鈕

  setupOverviewControls();

}

// ========================================
// 新增學生
// ========================================

async function addStudent(event) {

  event.preventDefault();

  const form = new FormData(event.target);

  const record = {

    full_name: form.get("full_name").trim(),

    student_code: form.get("student_code").trim(),

    class_name: form.get("class_name")

  };

  const { error } = await db
    .from("students")
    .insert(record);

  if (error) {

    showMessage(
      "新增學生失敗：" + error.message,
      "error"
    );

    return;
  }

  showMessage("學生新增成功！", "success");

  event.target.reset();

  await loadStaffData();

}

// ========================================
// 建立考試場次
// ========================================

async function addExam(event) {

  event.preventDefault();

  const form = new FormData(event.target);

  const start = form.get("start_date");
  const end = form.get("end_date");

  if (end < start) {

    showMessage(
      "結束日期不能早於開始日期。",
      "error"
    );

    return;
  }

  const formatDate = date => {

    const d = new Date(date + "T00:00:00");

    return `${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;

  };

  const title =
    `${formatDate(start)}～${formatDate(end)}周考`;

  const { error } = await db
    .from("exams")
    .insert({

      title,

      start_date: start,

      end_date: end

    });

  if (error) {

    showMessage(
      "建立考試場次失敗：" + error.message,
      "error"
    );

    return;
  }

  showMessage(
    "考試場次建立成功：" + title,
    "success"
  );

  event.target.reset();

  await loadStaffData();

}

// ========================================
// 儲存學生成績
// ========================================

async function saveScore(event) {

  event.preventDefault();

  const form = new FormData(event.target);

  const score = Number(form.get("score"));

  const scope = (form.get("scope") || "").trim();

  if (!Number.isFinite(score) || score < 0 || score > 100) {

    showMessage(
      "成績必須介於 0 到 100 分。",
      "error"
    );

    return;
  }

  const record = {

    student_id: form.get("student_id"),

    exam_id: form.get("exam_id"),

    subject: form.get("subject"),

    scope,

    score

  };

  const { error } = await db
    .from("scores")
    .upsert(record, {
      onConflict: "student_id,exam_id,subject"
    });

  if (error) {

    showMessage(
      "成績儲存失敗：" + error.message,
      "error"
    );

    return;
  }

  showMessage(
    "成績與考試範圍儲存成功！",
    "success"
  );

  event.target.reset();

}

// ========================================
// 家長帳號綁定
// ========================================

async function bindGuardian(event) {

  event.preventDefault();

  const form = new FormData(event.target);

  const email = form.get("email").trim().toLowerCase();

  const studentId = form.get("student_id");

  // 搜尋家長帳號

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id,email,role")
    .eq("email", email);

  if (profileError) {

    showMessage(
      "搜尋家長帳號失敗：" + profileError.message,
      "error"
    );

    return;
  }

  if (!profiles || profiles.length === 0) {

    showMessage(
      "找不到此電子郵件的帳號，請先建立家長帳號。",
      "error"
    );

    return;
  }

  const guardian = profiles[0];

  if (guardian.role !== "parent") {

    showMessage(
      "此帳號不是家長帳號，無法進行綁定。",
      "error"
    );

    return;
  }

  // 建立家長與學生的關聯

  const { error } = await db
    .from("guardian_students")
    .upsert({

      guardian_id: guardian.id,

      student_id: studentId

    }, {
      onConflict: "guardian_id,student_id",
      ignoreDuplicates: true
    });

  if (error) {

    showMessage(
      "綁定失敗：" + error.message,
      "error"
    );

    return;
  }

  showMessage(
    "家長與學生綁定成功！",
    "success"
  );

  event.target.reset();

}

// ========================================
// 家長登入紀錄
// ========================================

async function loadLoginEvents() {

  const area = document.getElementById("loginList");

  if (!area) return;

  const { data: events, error } = await db
    .from("login_events")
    .select("id,user_id,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {

    area.textContent =
      "讀取登入紀錄失敗：" + error.message;

    return;
  }

  if (!events || events.length === 0) {

    area.textContent = "目前尚無登入紀錄。";

    return;
  }

  const userIds = [
    ...new Set(events.map(e => e.user_id))
  ];

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id,email,display_name,role")
    .in("id", userIds);

  if (profileError) {

    area.textContent =
      "讀取帳號資料失敗：" + profileError.message;

    return;
  }

  const profileMap = {};

  (profiles || []).forEach(p => {
    profileMap[p.id] = p;
  });

  const parentEvents = events.filter(e =>
    profileMap[e.user_id]?.role === "parent"
  );

  if (parentEvents.length === 0) {

    area.textContent = "目前尚無家長登入紀錄。";

    return;
  }

  area.innerHTML = `
    <div class="table-wrap">
      <table>

        <tr>
          <th>家長帳號</th>
          <th>登入時間</th>
        </tr>

        ${parentEvents.map(e => {

          const profile = profileMap[e.user_id];

          return `
            <tr>
              <td>
                ${escapeHTML(
                  profile.display_name || profile.email
                )}
              </td>

              <td>
                ${escapeHTML(
                  new Date(e.created_at).toLocaleString("zh-TW")
                )}
              </td>
            </tr>
          `;

        }).join("")}

      </table>
    </div>
  `;

}

// ========================================
// 家長查詢成績
// ========================================

async function loadParentScores() {

  const area = document.getElementById("parentScores");

  const { data: scores, error } = await db
    .from("scores")
    .select(`
      id,
      subject,
      score,
      scope,
      created_at,
      students(full_name,class_name),
      exams(title,start_date,end_date)
    `)
    .order("created_at", { ascending: false });

  if (error) {

    area.textContent =
      "讀取成績失敗：" + error.message;

    return;
  }

  if (!scores || scores.length === 0) {

    area.textContent =
      "目前尚無成績資料，或尚未綁定學生。";

    return;
  }

  area.innerHTML = `
    <div class="table-wrap">
      <table>

        <tr>
          <th>學生</th>
          <th>班級</th>
          <th>考試場次</th>
          <th>科目</th>
          <th>考試範圍</th>
          <th>成績</th>
        </tr>

        ${scores.map(s => `
          <tr>

            <td>
              ${escapeHTML(s.students?.full_name || "")}
            </td>

            <td>
              ${escapeHTML(s.students?.class_name || "")}
            </td>

            <td>
              ${escapeHTML(s.exams?.title || "")}
            </td>

            <td>
              ${escapeHTML(s.subject)}
            </td>

            <td>
              ${escapeHTML(s.scope || "未填寫")}
            </td>

            <td>
              <strong>${escapeHTML(s.score)}</strong>
            </td>

          </tr>
        `).join("")}

      </table>
    </div>
  `;

}

// ========================================
// 全校成績總覽：按鈕設定
// ========================================

function setupOverviewControls() {

  const queryBtn =
    document.getElementById("queryOverviewBtn");

  const exportBtn =
    document.getElementById("exportOverviewBtn");

  if (queryBtn) {

    queryBtn.onclick = queryOverviewScores;

  }

  if (exportBtn) {

    exportBtn.onclick = exportOverviewCSV;

  }

}

// ========================================
// 全校成績總覽：查詢
// ========================================

async function queryOverviewScores() {

  const className =
    document.getElementById("overviewClass").value;

  const examId =
    document.getElementById("overviewExam").value;

  const resultArea =
    document.getElementById("overviewResult");

  if (!examId) {

    resultArea.textContent = "請先建立考試場次。";

    return;
  }

  resultArea.textContent = "正在讀取成績……";

  // 取得指定班級學生

  const { data: students, error: studentError } = await db
    .from("students")
    .select("id,student_code,full_name,class_name")
    .eq("class_name", className)
    .order("student_code");

  if (studentError) {

    resultArea.textContent =
      "讀取學生資料失敗：" + studentError.message;

    return;
  }

  if (!students || students.length === 0) {

    overviewRows = [];

    resultArea.textContent =
      "這個班級目前沒有學生資料。";

    return;
  }

  const studentIds = students.map(s => s.id);

  // 取得該場考試成績

  const { data: scores, error: scoreError } = await db
    .from("scores")
    .select("student_id,subject,score,scope")
    .eq("exam_id", examId)
    .in("student_id", studentIds);

  if (scoreError) {

    resultArea.textContent =
      "讀取成績失敗：" + scoreError.message;

    return;
  }

  const scoreMap = {};

  (scores || []).forEach(s => {

    if (!scoreMap[s.student_id]) {
      scoreMap[s.student_id] = {};
    }

    scoreMap[s.student_id][s.subject] = s;

  });

  // 整理所有學生資料

  overviewRows = students.map(student => {

    const records = scoreMap[student.id] || {};

    return {

      student_code: student.student_code,

      full_name: student.full_name,

      class_name: student.class_name,

      chinese: records["國文"]?.score ?? "",

      chinese_scope: records["國文"]?.scope || "",

      english: records["英文"]?.score ?? "",

      english_scope: records["英文"]?.scope || "",

      science: records["自然"]?.score ?? "",

      science_scope: records["自然"]?.scope || ""

    };

  });

  renderOverviewTable();

}

// ========================================
// 全校成績總覽：顯示表格
// ========================================

function renderOverviewTable() {

  const resultArea =
    document.getElementById("overviewResult");

  if (!overviewRows.length) {

    resultArea.textContent =
      "目前沒有可顯示的成績。";

    return;
  }

  resultArea.innerHTML = `

    <p>共 ${overviewRows.length} 位學生</p>

    <div class="table-wrap">

      <table>

        <thead>

          <tr>
            <th>學生編號</th>
            <th>學生姓名</th>
            <th>國文</th>
            <th>國文範圍</th>
            <th>英文</th>
            <th>英文範圍</th>
            <th>自然</th>
            <th>自然範圍</th>
          </tr>

        </thead>

        <tbody>

          ${overviewRows.map(s => `

            <tr>

              <td>${escapeHTML(s.student_code)}</td>

              <td>${escapeHTML(s.full_name)}</td>

              <td>
                ${escapeHTML(
                  s.chinese === "" ? "—" : s.chinese
                )}
              </td>

              <td>
                ${escapeHTML(s.chinese_scope || "—")}
              </td>

              <td>
                ${escapeHTML(
                  s.english === "" ? "—" : s.english
                )}
              </td>

              <td>
                ${escapeHTML(s.english_scope || "—")}
              </td>

              <td>
                ${escapeHTML(
                  s.science === "" ? "—" : s.science
                )}
              </td>

              <td>
                ${escapeHTML(s.science_scope || "—")}
              </td>

            </tr>

          `).join("")}

        </tbody>

      </table>

    </div>

  `;

}

// ========================================
// 全校成績總覽：匯出 CSV
// ========================================

function exportOverviewCSV() {

  if (!overviewRows.length) {

    alert("請先查詢成績，再進行匯出。");

    return;
  }

  const headers = [

    "班級",

    "學生編號",

    "學生姓名",

    "國文",

    "國文範圍",

    "英文",

    "英文範圍",

    "自然",

    "自然範圍"

  ];

  const rows = overviewRows.map(s => [

    s.class_name,

    s.student_code,

    s.full_name,

    s.chinese,

    s.chinese_scope,

    s.english,

    s.english_scope,

    s.science,

    s.science_scope

  ]);

  const csvCell = value =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csv = "\uFEFF" + [

    headers,

    ...rows

  ].map(row =>

    row.map(csvCell).join(",")

  ).join("\r\n");

  const blob = new Blob([csv], {

    type: "text/csv;charset=utf-8;"

  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;

  link.download = "小象成績總覽.csv";

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);

}

// ========================================
// 登出
// ========================================

async function logout() {

  await db.auth.signOut();

  currentUser = null;

  currentProfile = null;

  studentsCache = [];

  examsCache = [];

  overviewRows = [];

  loginPage();

}

// ========================================
// 啟動網站
// ========================================

loginPage();
