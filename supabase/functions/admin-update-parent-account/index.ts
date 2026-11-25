
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

// 統一台灣手機號碼格式
function normalizeTaiwanMobile(value: string): string {
  let phone = value.replace(/[\s()-]/g, "");

  if (/^09\d{8}$/.test(phone)) {
    phone = "+886" + phone.substring(1);
  } else if (/^8869\d{8}$/.test(phone)) {
    phone = "+" + phone;
  }

  if (!/^\+8869\d{8}$/.test(phone)) {
    throw new Error(
      "手機號碼格式錯誤，請輸入 0912345678。"
    );
  }

  return phone;
}

// 手機號碼轉成 Supabase Auth 內部 Email
function phoneLoginEmail(phone: string): string {
  return phone.replace(/^\+/, "") + "@phone-login.invalid";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "不支援的請求方式。" },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey) {
      throw new Error(
        "找不到 SUPABASE_SERVICE_ROLE_KEY 設定。"
      );
    }

    // 驗證管理員登入 Token
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(
        {
          success: false,
          error: "登入驗證失敗，請重新登入。",
        },
        401
      );
    }

    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        {
          success: false,
          error: "無法確認登入者身分。",
        },
        401
      );
    }

    // 建立管理員操作用戶端
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // 確認管理員權限
    const { data: adminProfile, error: adminError } =
      await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

    if (adminError) {
      throw new Error(
        "管理員身分查詢失敗：" + adminError.message
      );
    }

    if (!adminProfile || adminProfile.role !== "admin") {
      return jsonResponse(
        {
          success: false,
          error: "沒有管理員操作權限。",
        },
        403
      );
    }

    // 取得修改資料
    const body = await req.json();

    const parentId = String(body.parentId || "").trim();
    const displayName = String(body.displayName || "").trim();

    const emailInput = String(body.email || "")
      .trim()
      .toLowerCase();

    const phoneInput = String(body.phone || "").trim();

    if (!parentId || !displayName) {
      return jsonResponse(
        {
          success: false,
          error: "家長 ID 及姓名不可空白。",
        },
        400
      );
    }

    // 必須選擇 Email 或手機其中一種
    if (emailInput && phoneInput) {
      return jsonResponse(
        {
          success: false,
          error: "請只提供 Email 或手機號碼其中一種。",
        },
        400
      );
    }

    if (!emailInput && !phoneInput) {
      return jsonResponse(
        {
          success: false,
          error: "請輸入 Email 或手機號碼。",
        },
        400
      );
    }

    let newEmail: string | null = null;
    let newPhone: string | null = null;
    let newAuthEmail = "";

    // 判斷帳號類型
    if (phoneInput) {
      try {
        newPhone = normalizeTaiwanMobile(phoneInput);
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: error instanceof Error
              ? error.message
              : "手機號碼格式錯誤。",
          },
          400
        );
      }

      newAuthEmail = phoneLoginEmail(newPhone);

      // 檢查手機是否已被其他家長使用
      const { data: duplicatePhone, error: phoneError } =
        await adminClient
          .from("profiles")
          .select("id")
          .eq("phone", newPhone)
          .neq("id", parentId)
          .limit(1)
          .maybeSingle();

      if (phoneError) {
        throw new Error(
          "手機號碼重複檢查失敗：" + phoneError.message
        );
      }

      if (duplicatePhone) {
        return jsonResponse(
          {
            success: false,
            error: "這支手機號碼已被其他家長帳號使用。",
          },
          409
        );
      }

    } else {
      newEmail = emailInput;

      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(newEmail)) {
        return jsonResponse(
          {
            success: false,
            error: "Email 格式不正確。",
          },
          400
        );
      }

      newAuthEmail = newEmail;

      // 檢查 Email 是否已被其他家長使用
      const { data: duplicateEmail, error: emailError } =
        await adminClient
          .from("profiles")
          .select("id")
          .eq("email", newEmail)
          .neq("id", parentId)
          .limit(1)
          .maybeSingle();

      if (emailError) {
        throw new Error(
          "Email 重複檢查失敗：" + emailError.message
        );
      }

      if (duplicateEmail) {
        return jsonResponse(
          {
            success: false,
            error: "這個 Email 已被其他帳號使用。",
          },
          409
        );
      }
    }

    // 確認目標帳號確實是家長
    const { data: parentProfile, error: parentError } =
      await adminClient
        .from("profiles")
        .select(
          "id, email, phone, display_name, role"
        )
        .eq("id", parentId)
        .maybeSingle();

    if (parentError) {
      throw new Error(
        "家長資料查詢失敗：" + parentError.message
      );
    }

    if (!parentProfile || parentProfile.role !== "parent") {
      return jsonResponse(
        {
          success: false,
          error: "找不到這位家長帳號。",
        },
        404
      );
    }

    // 記錄原本的 Auth Email，以便失敗時還原
    const oldAuthEmail = parentProfile.email
      ? parentProfile.email
      : parentProfile.phone
        ? phoneLoginEmail(parentProfile.phone)
        : null;

    if (!oldAuthEmail) {
      throw new Error(
        "找不到原本的登入帳號資料，無法安全更新。"
      );
    }

    // 更新 Supabase Auth 登入 Email
    // 手機帳號更新時，實際更新的是內部 Email 別名
    const { error: authUpdateError } =
      await adminClient.auth.admin.updateUserById(
        parentId,
        {
          email: newAuthEmail,
          email_confirm: true,
        }
      );

    if (authUpdateError) {
      throw new Error(
        "更新登入帳號失敗：" +
        authUpdateError.message
      );
    }

    // 同步更新 profiles
    const { data: updatedProfile, error: profileUpdateError } =
      await adminClient
        .from("profiles")
        .update({
          email: newEmail,
          phone: newPhone,
          display_name: displayName,
        })
        .eq("id", parentId)
        .eq("role", "parent")
        .select("id")
        .maybeSingle();

    if (profileUpdateError || !updatedProfile) {
      // Profile 更新失敗，嘗試還原原本 Auth Email
      const { error: rollbackError } =
        await adminClient.auth.admin.updateUserById(
          parentId,
          {
            email: oldAuthEmail,
            email_confirm: true,
          }
        );

      if (rollbackError) {
        console.error(
          "Auth 帳號還原失敗：",
          rollbackError.message
        );
      }

      throw new Error(
        "家長資料更新失敗：" +
        (profileUpdateError?.message ||
          "找不到更新後的資料")
      );
    }

    console.log("家長資料更新成功：", {
      parentId,
      email: newEmail,
      phone: newPhone,
      displayName,
    });

    return jsonResponse({
      success: true,
      message: "家長資料已成功更新。",
      parentId,
      email: newEmail,
      phone: newPhone,
      displayName,
    });

  } catch (error) {
    console.error(
      "admin-update-parent-account 錯誤：",
      error
    );

    return jsonResponse(
      {
        success: false,
        error: error instanceof Error
          ? error.message
          : "系統發生未知錯誤。",
      },
      500
    );
  }
});
