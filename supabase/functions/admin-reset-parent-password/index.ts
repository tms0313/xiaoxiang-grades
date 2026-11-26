import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function generateTemporaryPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const randomValues = new Uint32Array(18);
  crypto.getRandomValues(randomValues);

  return Array.from(
    randomValues,
    (value) => chars[value % chars.length],
  ).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "只接受 POST 請求" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse({ error: "請先登入管理員帳號" }, 401);
    }

    // 驗證目前登入者
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "登入驗證失敗，請重新登入" }, 401);
    }

    // 確認目前登入者是管理員
    const { data: adminProfile, error: profileError } =
      await userClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (profileError || adminProfile?.role !== "admin") {
      return jsonResponse({ error: "只有管理員可以重設家長密碼" }, 403);
    }

    // 取得要重設密碼的家長帳號
    const body = await req.json();
    const parentUserId = body.parentUserId;

    if (
      typeof parentUserId !== "string" ||
      parentUserId.length < 10
    ) {
      return jsonResponse({ error: "家長帳號資料不正確" }, 400);
    }

    // 確認目標帳號確實是家長
    const { data: parentProfile, error: parentError } =
      await userClient
        .from("profiles")
        .select("id, role")
        .eq("id", parentUserId)
        .single();

    if (parentError || !parentProfile || parentProfile.role !== "parent") {
      return jsonResponse({ error: "找不到此家長帳號，或帳號身分不正確" }, 404);
    }

    // 使用伺服器端管理權限重設密碼
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const temporaryPassword = generateTemporaryPassword();
    const { data: authParent, error: getParentError } =
      await adminClient.auth.admin.getUserById(parentUserId);

    if (getParentError || !authParent.user) {
      return jsonResponse({
        error: "無法讀取家長登入帳號：" + (getParentError?.message || "找不到帳號"),
      }, 400);
    }

    const passwordChangeRequiredAt = new Date().toISOString();
    const { error: resetError } =
      await adminClient.auth.admin.updateUserById(
        parentUserId,
        {
          password: temporaryPassword,
          app_metadata: {
            ...(authParent.user.app_metadata || {}),
            must_change_password: true,
            password_change_required_at: passwordChangeRequiredAt,
          },
        },
      );

    if (resetError) {
      return jsonResponse({
        error: "重設密碼失敗：" + resetError.message,
      }, 500);
    }

    return jsonResponse({
      success: true,
      temporaryPassword,
      message: "家長臨時密碼已重設",
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "系統發生錯誤",
    }, 500);
  }
});