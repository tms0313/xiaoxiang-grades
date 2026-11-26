import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 僅依伺服器端 app_metadata 與登入時間分類，不讀取或回傳密碼。
function classifyParentPasswordStatus(user: any) {
  const metadata = user.app_metadata || {};

  if (metadata.must_change_password === true) {
    const requiredAt = Date.parse(metadata.password_change_required_at || "");
    if (!Number.isFinite(requiredAt)) return "pending_login_unknown";

    const lastSignInAt = Date.parse(user.last_sign_in_at || "");
    if (Number.isFinite(lastSignInAt) && lastSignInAt >= requiredAt) {
      return "logged_in_pending";
    }
    return "not_logged_in_pending";
  }

  if (metadata.must_change_password === false) return "completed";

  return user.last_sign_in_at
    ? "legacy_unknown"
    : "never_logged_in_unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "只接受 POST 請求" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse({ success: false, error: "請先登入管理員帳號" }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData.user) {
      return jsonResponse({ success: false, error: "登入驗證失敗" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (profileError || callerProfile?.role !== "admin") {
      return jsonResponse({ success: false, error: "只有管理員可以查詢家長密碼狀態" }, 403);
    }

    const { data: parentProfiles, error: parentsError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("role", "parent");

    if (parentsError) {
      throw new Error("讀取家長帳號清單失敗：" + parentsError.message);
    }

    const authUsers: any[] = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) {
        throw new Error("讀取登入狀態失敗：" + error.message);
      }

      const pageUsers = data?.users || [];
      authUsers.push(...pageUsers);
      if (pageUsers.length < perPage) break;
      page += 1;
    }

    const usersById = new Map(authUsers.map((user) => [String(user.id), user]));
    const parentStatuses = (parentProfiles || []).map((profile) => {
      const authUser = usersById.get(String(profile.id));
      return {
        parentId: String(profile.id),
        status: authUser
          ? classifyParentPasswordStatus(authUser)
          : "auth_missing",
      };
    });

    return jsonResponse({
      success: true,
      parentStatuses,
    });
  } catch (error) {
    console.error("admin-parent-password-status error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "查詢家長密碼狀態失敗",
    }, 500);
  }
});
