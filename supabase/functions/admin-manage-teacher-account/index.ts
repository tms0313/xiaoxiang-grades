import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function makeTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const random = new Uint32Array(14);
  crypto.getRandomValues(random);
  return Array.from(random, value => alphabet[value % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization");

    if (!authorization) return json({ success: false, error: "Unauthorized" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) return json({ success: false, error: "登入驗證失敗" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (profileError || !callerProfile || callerProfile.role !== "admin") {
      return json({ success: false, error: "只有管理員可以管理教師帳號" }, 403);
    }

    const body = await req.json();
    const action = String(body.action || "");
    const teacherId = String(body.teacherId || "").trim();

    if (!["reset_password", "delete"].includes(action)) {
      return json({ success: false, error: "不支援的教師帳號操作" }, 400);
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teacherId)) {
      return json({ success: false, error: "教師帳號 ID 格式錯誤" }, 400);
    }

    const { data: teacherProfile, error: teacherError } = await adminClient
      .from("profiles")
      .select("id, email, role")
      .eq("id", teacherId)
      .maybeSingle();

    if (teacherError || !teacherProfile || teacherProfile.role !== "teacher") {
      return json({ success: false, error: "找不到教師帳號，或該帳號不是教師角色" }, 404);
    }

    if (action === "reset_password") {
      const temporaryPassword = makeTemporaryPassword();
      const { error: updateError } = await adminClient.auth.admin.updateUserById(teacherId, {
        password: temporaryPassword
      });

      if (updateError) {
        return json({ success: false, error: "重設教師密碼失敗：" + updateError.message }, 400);
      }

      return json({
        success: true,
        action,
        email: teacherProfile.email,
        temporaryPassword
      });
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(teacherId);
    if (deleteAuthError) {
      return json({ success: false, error: "刪除教師登入帳號失敗：" + deleteAuthError.message }, 400);
    }

    // Explicit cleanup also covers projects where profile-related foreign keys are not cascading.
    const { error: assignmentDeleteError } = await adminClient
      .from("teacher_assignments")
      .delete()
      .eq("teacher_id", teacherId);

    if (assignmentDeleteError) {
      return json({ success: false, error: "登入帳號已刪除，但清除授課權限時發生錯誤：" + assignmentDeleteError.message }, 500);
    }

    const { error: profileDeleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", teacherId)
      .eq("role", "teacher");

    if (profileDeleteError) {
      return json({ success: false, error: "登入帳號已刪除，但清除教師資料時發生錯誤：" + profileDeleteError.message }, 500);
    }

    return json({
      success: true,
      action,
      email: teacherProfile.email
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "未知錯誤"
    }, 500);
  }
});
