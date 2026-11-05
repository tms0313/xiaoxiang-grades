// ========================================
// 小象文教機構｜成績管理系統
// ========================================

const db = supabaseClient;

const style = document.createElement("style");
style.textContent = `
.dashboard {
  width: min(1100px, 94%);
  margin: 30px auto;
  background: #fff;
  padding: 28px;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(0,0,0,.08);
}
.dashboard h1 { color:#17365d; margin-bottom:8px; }
.dashboard h2 {
  color:#17365d;
  border-bottom:2px solid #d9b66f;
  padding-bottom:10px;
  margin-top:28px;
}
.dashboard .topbar {
  display:flex;
  justify-content:space-between;
  align-items:center;
  flex-wrap:wrap;
  gap:12px;
}
.dashboard .user-info { color:#666; font-size:14px; }
.dashboard button {
  background:#17365d;
  color:white;
  border:0;
  border-radius:7px;
  padding:10px 16px;
  cursor:pointer;
  margin:4px 4px 4px 0;
}
.dashboard button:hover { opacity:.88; }
.dashboard button.secondary { background:#777; }
.dashboard input, .dashboard select {
  width:100%;
  padding:11px;
  margin:6px 0 14px;
  border:1px solid #ccc;
  border-radius:7px;
  box-sizing:border-box;
}
.dashboard label { display:block; font-weight:600; }
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
.dashboard th, .dashboard td {
  border:1px solid #ddd;
  padding:10px;
  text-align:left;
}
.dashboard th { background:#edf1f7; color:#17365d; }
.dashboard .notice { color:#666; font-size:14px; }
.dashboard .success { color:#187344; }
.dashboard .error { color:#b42318; }
.dashboard .form-grid {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:12px;
}
@media(max-width:600px) {
  .dashboard { padding:16px; margin:12px auto; }
  .dashboard table { font-size:13px; }
  .dashboard th, .dashboard td { padding:7px; }
}
`;
document.head.appendChild(style);

let currentUser = null;
let currentProfile = null;
let studentsCache = [];
let examsCache = [];

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
    area.className = type;
  }
}

function loginPage() {
  document.body.innerHTML = `
    <main class="login-page">
      <section class="login-card">
        <div class="logo">小象</div>
        <p class="school-name">小象文教機構・七堵校區</p>
        <h1>成績管理系統</h1>
        <p class="subtitle">學生學習紀錄與成績查詢平台</p>

        <form id="loginForm">
          <label for="email">電子郵件</label>
          <input id="email" type="email"
            placeholder="請輸入電子郵件" required>

          <label for="password">登入密碼</label>
          <input id="password" type="password"
            placeholder="請輸入密碼" required>

          <button type="submit">登入系統</button>
          <p id="message" role="status"></p>
        </form>
        <footer>© 小象文教機構 七堵校區</footer>
      </section>
    </main>
  `;

  document.getElementById("loginForm").addEventListener("submit", login);
}

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
  await db.from("login_events").insert({
    user_id: currentUser.id
  });

  renderDashboard();
}

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
            ${escapeHTML(currentProfile.display_name || currentProfile.email)}
            ・${roleNames[currentProfile.role] || "使用者"}
          </div>
        </div>
        <button id="logoutBtn" class="secondary">登出</button>
      </div>

      <p id="appMessage" class="notice"></p>

      <div id="mainContent">
        ${currentProfile.role === "parent"
          ? parentView()
          : staffView()}
      </div>
    </main>
  `;

  document.getElementById("logoutBtn").addEventListener("click", logout);

  if (currentProfile.role === "parent") {
    loadParentScores();
  } else {
    loadStaffData();
  }
}

function staffView() {
  return `
    <section class="panel">
      <h2>一、學生資料管理</h2>
      <form id="studentForm">
        <div class="form-grid">
          <div>
            <label>學生姓名</label>
            <input name="full_name" required placeholder="請輸入學生姓名">
          </div>
          <div>
            <label>學生編號</label>
            <input name="student_code" required placeholder="例如：A001">
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

    <section class="panel">
      <h2>二、周考場次管理</h2>
      <form id="examForm">
        <div class="form-grid">
          <div>
            <label>開始日期</label>
            <input type="date" name="start_date" required>
          </div>
          <div>
            <label>結束日期</label>
            <input type="date" name="end_date" required>
          </div>
        </div>
        <button type="submit">建立周考場次</button>
      </form>
      <div id="examList"></div>
    </section>

    <section class="panel">
      <h2>三、學生成績登錄</h2>
      <form id="scoreForm">
        <label>選擇學生</label>
        <select name="student_id" id="scoreStudent" required></select>

        <label>選擇考試場次</label>
        <select name="exam_id" id="scoreExam" required></select>

        <label>科目</label>
        <select name="subject" required>
          <option value="國文">國文</option>
          <option value="英文">英文</option>
          <option value="自然">自然</option>
        </select>

        <label>成績（0～100）</label>
        <input type="number" name="score" min="0" max="100" required>

        <button type="submit">儲存成績</button>
      </form>
    </section>

    <section class="panel">
      <h2>四、家長帳號綁定</h2>
      <p class="notice">
        請先在 Supabase 建立家長登入帳號，再輸入該帳號的電子郵件進行綁定。
      </p>
      <form id="bindForm">
        <label>家長電子郵件</label>
        <input type="email" name="email" required>

        <label>要綁定的學生</label>
        <select name="student_id" id="bindStudent" required></select>

        <button type="submit">綁定家長與學生</button>
      </form>
    </section>

    <section class="panel">
      <h2>五、家長登入紀錄</h2>
      <div id="loginList"></div>
    </section>
  `;
}

function parentView() {
  return `
    <section class="panel">
      <h2>孩子的學習成績</h2>
      <p class="notice">以下僅顯示已與此家長帳號綁定的學生資料。</p>
      <div id="parentScores">正在讀取成績……</div>
    </section>
  `;
}

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
      (studentResult.error?.message || examResult.error?.message),
      "error"
    );
    return;
  }

  studentsCache = studentResult.data || [];
  examsCache = examResult.data || [];

  document.getElementById("studentList").innerHTML =
    studentsCache.length
      ? `<table>
          <tr><th>編號</th><th>姓名</th><th>班級</th></tr>
          ${studentsCache.map(s => `
            <tr>
              <td>${escapeHTML(s.student_code)}</td>
              <td>${escapeHTML(s.full_name)}</td>
              <td>${escapeHTML(s.class_name)}</td>
            </tr>
          `).join("")}
        </table>`
      : `<p class="notice">目前尚未建立學生資料。</p>`;

  document.getElementById("examList").innerHTML =
    examsCache.length
      ? `<table>
          <tr><th>考試場次</th><th>開始日期</th><th>結束日期</th></tr>
          ${examsCache.map(e => `
            <tr>
              <td>${escapeHTML(e.title)}</td>
              <td>${escapeHTML(e.start_date)}</td>
              <td>${escapeHTML(e.end_date)}</td>
            </tr>
          `).join("")}
        </table>`
      : `<p class="notice">目前尚未建立考試場次。</p>`;

  const studentOptions = studentsCache.map(s =>
    `<option value="${escapeHTML(s.id)}">
      ${escapeHTML(s.class_name)}｜${escapeHTML(s.full_name)}
    </option>`
  ).join("");

  const examOptions = examsCache.map(e =>
    `<option value="${escapeHTML(e.id)}">
      ${escapeHTML(e.title)}
    </option>`
  ).join("");

  document.getElementById("scoreStudent").innerHTML =
    studentOptions || `<option value="">請先新增學生</option>`;

  document.getElementById("bindStudent").innerHTML =
    studentOptions || `<option value="">請先新增學生</option>`;

  document.getElementById("scoreExam").innerHTML =
    examOptions || `<option value="">請先建立考試場次</option>`;

  if (currentProfile.role === "admin") {
    loadLoginEvents();
  } else {
    document.getElementById("loginList").textContent =
      "僅管理員可以查看家長登入紀錄。";
  }

  document.getElementById("studentForm")
    .addEventListener("submit", addStudent);

  document.getElementById("examForm")
    .addEventListener("submit", addExam);

  document.getElementById("scoreForm")
    .addEventListener("submit", saveScore);

  document.getElementById("bindForm")
    .addEventListener("submit", bindGuardian);
}

async function addStudent(event) {
  event.preventDefault();

  const form = new FormData(event.target);
  const record = {
    full_name: form.get("full_name").trim(),
    student_code: form.get("student_code").trim(),
    class_name: form.get("class_name")
  };

  const { error } = await db.from("students").insert(record);

  if (error) {
    showMessage("新增學生失敗：" + error.message, "error");
    return;
  }

  showMessage("學生新增成功！", "success");
  event.target.reset();
  loadStaffData();
}

async function addExam(event) {
  event.preventDefault();

  const form = new FormData(event.target);
  const start = form.get("start_date");
  const end = form.get("end_date");

  if (end < start) {
    showMessage("結束日期不能早於開始日期。", "error");
    return;
  }

  const formatDate = date => {
    const d = new Date(date + "T00:00:00");
    return `${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;
  };

  const title = `${formatDate(start)}～${formatDate(end)}周考`;

  const { error } = await db.from("exams").insert({
    title,
    start_date: start,
    end_date: end
  });

  if (error) {
    showMessage("建立考試場次失敗：" + error.message, "error");
    return;
  }

  showMessage("考試場次建立成功：" + title, "success");
  event.target.reset();
  loadStaffData();
}

async function saveScore(event) {
  
async function saveScore(event) {
  event.preventDefault();

  const form = new FormData(event.target);
  const score = Number(form.get("score"));
  const scope = (form.get("scope") || "").trim();

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    showMessage("成績必須介於 0 到 100 分。", "error");
    return;
  }

  const record = {
    student_id: form.get("student_id"),
    exam_id: form.get("exam_id"),
    subject: form.get("subject"),
    scope,
    score
  };

  const { error } = await db.from("scores").upsert(record, {
    onConflict: "student_id,exam_id,subject"
  });

  if (error) {
    showMessage("成績儲存失敗：" + error.message, "error");
    return;
  }

  showMessage("成績與考試範圍儲存成功！", "success");
  event.target.reset();
}
