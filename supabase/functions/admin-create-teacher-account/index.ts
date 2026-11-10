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
      return json({ success: false, error: "只有管理員可以建立教師帳號" }, 403);
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: "請提供有效的教師 Email" }, 400);
    }

    const initialPassword = "123456";

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { role: "teacher" },
      app_metadata: { must_change_password: true }
    });

    if (createError || !created.user) {
      return json({ success: false, error: createError?.message || "建立教師登入帳號失敗" }, 400);
    }

    const { error: upsertError } = await adminClient
      .from("profiles")
      .upsert({
        id: created.user.id,
        email,
        display_name: email,
        role: "teacher"
      }, { onConflict: "id" });

    if (upsertError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ success: false, error: "建立教師資料失敗：" + upsertError.message }, 500);
    }

    return json({
      success: true,
      email,
      teacherId: created.user.id,
      initialPassword
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : "未知錯誤"
    }, 500);
  }
});
