
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  try {
    if (req.method !== "POST") {
      return json({ success: false, error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return json({ success: false, error: "未提供登入驗證資料" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 驗證目前登入者
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } =
      await userClient.auth.getUser(token);

    if (userError || !userData.user) {
      return json({ success: false, error: "登入驗證失敗" }, 401);
    }

    const adminId = userData.user.id;

    // 確認操作者是管理員
    const { data: adminProfile, error: adminProfileError } =
      await adminClient
        .from("profiles")
        .select("role")
        .eq("id", adminId)
        .maybeSingle();

    if (
      adminProfileError ||
      !adminProfile ||
      adminProfile.role !== "admin"
    ) {
      return json({ success: false, error: "沒有管理員權限" }, 403);
    }

    const body = await req.json();
    const parentId = String(body.parentId || "").trim();

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId)
    ) {
      return json({ success: false, error: "家長帳號 ID 格式錯誤" }, 400);
    }

    if (parentId === adminId) {
      return json({ success: false, error: "不能刪除目前登入的管理員" }, 400);
    }

    // 確認目標帳號存在且為家長
    const { data: parentProfile, error: parentError } =
      await adminClient
        .from("profiles")
        .select("id, role, display_name")
        .eq("id", parentId)
        .maybeSingle();

    if (parentError) throw parentError;

    if (!parentProfile) {
      return json({ success: false, error: "找不到這位家長帳號" }, 404);
    }

    if (parentProfile.role !== "parent") {
      return json({ success: false, error: "只能刪除家長帳號" }, 400);
    }

    // 若同時具有教師權限，必須先處理教師權限
    const { data: extraTeacherRole, error: roleError } =
      await adminClient
        .from("profile_roles")
        .select("role")
        .eq("user_id", parentId)
        .eq("role", "teacher")
        .maybeSingle();

    if (roleError) throw roleError;

    if (extraTeacherRole) {
      return json({
        success: false,
        error: "此帳號同時具有教師權限，請先移除教師權限後再刪除。",
      }, 409);
    }

    // 永久刪除 Supabase Auth 帳號
    // 相關 profiles、家長綁定等資料依資料庫外鍵設定處理
    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(parentId);

    if (deleteError) {
      throw deleteError;
    }

    return json({
      success: true,
      parentId,
      message: "家長帳號已刪除",
    });

  } catch (error) {
    console.error("admin-delete-parent-account error:", error);

    return json({
      success: false,
      error: error instanceof Error
        ? error.message
        : "刪除家長帳號時發生錯誤",
    }, 500);
  }
});
