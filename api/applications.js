
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const allowedStatuses = [
  "Registered",
  "Documents Pending",
  "Documents Reviewing",
  "Correction Required",
  "Ready for Submission",
  "Submitted",
  "Decision Pending",
  "Decision Received",
  "Completed"
];

function respond(res, status, data) {
  return res.status(status).json(data);
}

function dbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function mapApplication(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    visaType: row.visa_type,
    status: row.status,
    note: row.note || "",
    updatedAt: row.updated_at
      ? row.updated_at.replace("T", " ").slice(0, 16)
      : ""
  };
}

function isAdmin(req) {
  const password = req.headers["x-admin-password"];
  return Boolean(
    ADMIN_PASSWORD &&
    password &&
    password === ADMIN_PASSWORD
  );
}

module.exports = async function handler(req, res) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !ADMIN_PASSWORD) {
      return respond(res, 500, {
        error: "Server тохиргоо дутуу байна."
      });
    }

    // Шинэ хүсэлт бүртгэх
    if (req.method === "POST") {
      const { fullName, phone, visaType } = req.body || {};

      if (
        typeof fullName !== "string" ||
        typeof phone !== "string" ||
        typeof visaType !== "string" ||
        !fullName.trim() ||
        !phone.trim() ||
        !visaType.trim() ||
        fullName.length > 120 ||
        phone.length > 30 ||
        visaType.length > 100
      ) {
        return respond(res, 400, {
          error: "Мэдээллээ шалгана уу."
        });
      }

      const id = `VT-${new Date().getFullYear()}-${Date.now()}`;
      const now = new Date().toISOString();

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/visa_applications`,
        {
          method: "POST",
          headers: dbHeaders({
            Prefer: "return=representation"
          }),
          body: JSON.stringify({
            id,
            full_name: fullName.trim(),
            phone: phone.trim(),
            visa_type: visaType.trim(),
            status: "Registered",
            note: "Таны визний хүсэлт амжилттай бүртгэгдлээ. Бичиг баримтыг шалгаж эхэлнэ.",
            created_at: now,
            updated_at: now
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error("Supabase insert error:", result);
        return respond(res, 500, {
          error: "Хүсэлт хадгалахад алдаа гарлаа."
        });
      }

      return respond(res, 201, {
        application: mapApplication(result[0])
      });
    }

    // Хүсэлт хайх эсвэл админы жагсаалт авах
    if (req.method === "GET") {
      const url = new URL(req.url, "https://example.com");
      const isAdminRequest = url.searchParams.get("admin") === "1";

      let endpoint;

      if (isAdminRequest) {
        if (!isAdmin(req)) {
          return respond(res, 401, {
            error: "Админы нэвтрэлт шаардлагатай."
          });
        }

        endpoint =
          `${SUPABASE_URL}/rest/v1/visa_applications` +
          "?select=*&order=created_at.desc";
      } else {
        const id = (url.searchParams.get("id") || "").trim();
        const phone = (url.searchParams.get("phone") || "").trim();

        if (
          !/^VT-[0-9]{4}-[0-9]+$/i.test(id) ||
          !phone ||
          phone.length > 30
        ) {
          return respond(res, 400, {
            error: "Бүртгэлийн ID болон утасны дугаараа оруулна уу."
          });
        }

        endpoint =
          `${SUPABASE_URL}/rest/v1/visa_applications` +
          `?select=id,full_name,visa_type,status,note,updated_at` +
          `&id=eq.${encodeURIComponent(id)}` +
          `&phone=eq.${encodeURIComponent(phone)}` +
          "&limit=1";
      }

      const response = await fetch(endpoint, {
        headers: dbHeaders()
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Supabase read error:", result);
        return respond(res, 500, {
          error: "Мэдээлэл авахад алдаа гарлаа."
        });
      }

      if (isAdminRequest) {
        return respond(res, 200, {
          applications: result.map(mapApplication)
        });
      }

      return respond(res, 200, {
        application: result.length ? mapApplication(result[0]) : null
      });
    }

    // Админ төлөв шинэчлэх
    if (req.method === "PATCH") {
      if (!isAdmin(req)) {
        return respond(res, 401, {
          error: "Админы нэвтрэлт шаардлагатай."
        });
      }

      const { id, status, note } = req.body || {};

      if (
        typeof id !== "string" ||
        !id ||
        !allowedStatuses.includes(status) ||
        typeof note !== "string" ||
        note.length > 2000
      ) {
        return respond(res, 400, {
          error: "Шинэчлэх мэдээлэл буруу байна."
        });
      }

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/visa_applications?id=eq.${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: dbHeaders({
            Prefer: "return=representation"
          }),
          body: JSON.stringify({
            status,
            note,
            updated_at: new Date().toISOString()
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error("Supabase update error:", result);
        return respond(res, 500, {
          error: "Төлөв шинэчлэхэд алдаа гарлаа."
        });
      }

      return respond(res, 200, {
        application: result.length ? mapApplication(result[0]) : null
      });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return respond(res, 405, {
      error: "Энэ хүсэлтийн төрөл зөвшөөрөгдөөгүй."
    });

  } catch (error) {
    console.error("API error:", error);
    return respond(res, 500, {
      error: "Серверийн алдаа гарлаа."
    });
  }
};
