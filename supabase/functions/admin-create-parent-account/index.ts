
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INITIAL_PASSWORD = "123456";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  let adminClient: any = null;
  let createdUserId: string | null = null;

  try {
    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return respond({ error: "未提供登入憑證" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return respond({ error: "登入驗證失敗" }, 401);
    }

    adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 確認執行者具有管理員權限
    const { data: adminProfile, error: adminError } =
      await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (
      adminError ||
      !adminProfile ||
      adminProfile.role !== "admin"
    ) {
      return respond({ error: "沒有管理員權限" }, 403);
    }

    const body = await req.json();

    const emailInput = String(body.email || "")
      .trim()
      .toLowerCase();

    const phoneInput = String(body.phone || "").trim();
    const displayName = String(body.displayName || "").trim();
    const studentId = String(body.studentId || "").trim();

    let email: string | null = null;
    let phone: string | null = null;
    let internalEmail = "";

    // 判斷使用手機或 Email 建立帳號
    if (phoneInput) {
      // 手機號碼統一轉成台灣國際格式
      phone = phoneInput.replace(/[\s()-]/g, "");

      if (/^09\d{8}$/.test(phone)) {
        phone = "+886" + phone.substring(1);
      } else if (/^8869\d{8}$/.test(phone)) {
        phone = "+" + phone;
      }

      if (!/^\+8869\d{8}$/.test(phone)) {
        return respond({
          error: "手機號碼格式錯誤，請輸入 09xxxxxxxx",
        }, 400);
      }

      // 手機帳號使用內部 Email 別名
      internalEmail =
        phone.replace(/^\+/, "") + "@phone-login.invalid";

      // 檢查手機是否已被使用
      const { data: existingPhone, error: phoneError } =
        await adminClient
          .from("profiles")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();

      if (phoneError) {
        throw new Error(
          "檢查手機號碼失敗：" + phoneError.message
        );
      }

      if (existingPhone) {
        return respond({
          error: "這支手機號碼已經建立過家長帳號。",
        }, 409);
      }

    } else {
      email = emailInput;

      if (
        !email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        return respond({
          error: "Email 格式錯誤",
        }, 400);
      }

      internalEmail = email;
    }

    if (!displayName) {
      return respond({
        error: "請輸入家長姓名",
      }, 400);
    }

    if (!studentId) {
      return respond({
        error: "請選擇要綁定的學生",
      }, 400);
    }

    // 確認學生存在
    const { data: student, error: studentError } =
      await adminClient
        .from("students")
        .select("id")
        .eq("id", studentId)
        .single();

    if (studentError || !student) {
      return respond({
        error: "找不到指定學生",
      }, 404);
    }

    // 使用 Email Provider 建立帳號
    // 手機帳號使用內部別名，不使用 Phone Auth
    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email: internalEmail,
        password: INITIAL_PASSWORD,
        email_confirm: true,
      });

    if (createError || !created.user) {
      return respond({
        error:
          "建立登入帳號失敗：" +
          (createError?.message || "無法取得使用者資料"),
      }, 400);
    }

    createdUserId = created.user.id;

    // 建立或更新 Profile
    // 避免 Auth Trigger 已先建立 Profile 時發生主鍵重複
    const { error: profileError } =
      await adminClient
        .from("profiles")
        .upsert(
          {
            id: createdUserId,
            email: email,
            phone: phone,
            display_name: displayName,
            role: "parent",
          },
          {
            onConflict: "id",
          }
        );

    if (profileError) {
      throw new Error(
        "建立家長資料失敗：" + profileError.message
      );
    }

    // 自動綁定學生
    const { error: bindingError } =
      await adminClient
        .from("guardian_students")
        .insert({
          guardian_id: createdUserId,
          student_id: studentId,
        });

    if (bindingError) {
      throw new Error(
        "綁定學生失敗：" + bindingError.message
      );
    }

    // 建立成功
    return respond({
      success: true,
      userId: createdUserId,
      email: email,
      phone: phone,
      displayName: displayName,
      initialPassword: INITIAL_PASSWORD,
      studentId: studentId,
      message: "家長帳號建立成功",
    });

  } catch (error) {
    console.error(
      "admin-create-parent-account error:",
      error
    );

    // 發生錯誤時清理已建立的資料
    if (adminClient && createdUserId) {
      try {
        await adminClient
          .from("guardian_students")
          .delete()
          .eq("guardian_id", createdUserId);

        await adminClient
          .from("profiles")
          .delete()
          .eq("id", createdUserId);

        await adminClient.auth.admin.deleteUser(
          createdUserId
        );
      } catch (cleanupError) {
        console.error(
          "清理家長帳號失敗:",
          cleanupError
        );
      }
    }

    return respond({
      error: error instanceof Error
        ? error.message
        : "系統發生錯誤",
    }, 500);
  }
});
