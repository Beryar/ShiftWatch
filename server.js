const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "CHANGE-ME";

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "storage");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DATA_FILE = path.join(DATA_DIR, "data.json");
const INITIAL_FILE = path.join(__dirname, "initial-data.json");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json({ limit: "1mb" }));

// فایل‌های PWA در ریشه Repository هستند
app.use(express.static(__dirname));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = readJson(INITIAL_FILE);
    writeJson(DATA_FILE, initial);
  }
}

ensureDataFile();

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true
  });

  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: ""
  });

  const out = [];
  const pad = n => String(n).padStart(2, "0");

  for (let i = 22; i < rows.length; i++) {
    const row = rows[i];
    let v = row[0];

    if (v instanceof Date && !isNaN(v)) {
      const iso =
        v.getFullYear() + "-" +
        pad(v.getMonth() + 1) + "-" +
        pad(v.getDate());

      out.push({
        date: iso,
        weekday: row[1] || "",
        employerDay: row[2] || "",
        employerNight: row[3] || "",
        contractorEvening: row[4] || "",
        contractorNight: row[5] || ""
      });

    } else if (typeof v === "number") {
      const dc = new Date(
        Date.UTC(1899, 11, 30) + v * 86400000
      );

      const iso =
        dc.getUTCFullYear() + "-" +
        pad(dc.getUTCMonth() + 1) + "-" +
        pad(dc.getUTCDate());

      out.push({
        date: iso,
        weekday: row[1] || "",
        employerDay: row[2] || "",
        employerNight: row[3] || "",
        contractorEvening: row[4] || "",
        contractorNight: row[5] || ""
      });
    }
  }

  if (out.length < 20) {
    throw new Error(
      "ساختار فایل Excel قابل تشخیص نیست. ساختار باید مشابه فایل اولیه باشد."
    );
  }

  return out;
}

function auth(req, res, next) {
  const pass = req.get("X-Admin-Password") || "";

  if (!pass || pass !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: "رمز مدیر نادرست است."
    });
  }

  next();
}

app.get("/api/data", (req, res) => {
  try {
    res.json(readJson(DATA_FILE));
  } catch (e) {
    res.status(500).json({
      error: "اطلاعات مرکزی در دسترس نیست."
    });
  }
});

app.post(
  "/api/admin/upload",
  auth,
  upload.single("file"),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "فایل Excel ارسال نشده است."
        });
      }

      const data = parseExcel(req.file.buffer);

      const payload = {
        updatedAt: new Date().toLocaleString("fa-IR", {
          dateStyle: "short",
          timeStyle: "short"
        }),
        data
      };

      writeJson(DATA_FILE, payload);

      res.json(payload);

    } catch (e) {
      res.status(400).json({
        error: e.message
      });
    }
  }
);

app.post("/api/admin/reset", auth, (req, res) => {
  try {
    const initial = readJson(INITIAL_FILE);

    if (fs.existsSync(DATA_FILE)) {
      fs.copyFileSync(
        DATA_FILE,
        DATA_FILE + ".backup.json"
      );
    }

    writeJson(DATA_FILE, initial);

    res.json(initial);

  } catch (e) {
    res.status(500).json({
      error: "بازیابی نسخه اولیه ممکن نیست."
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// صفحه اصلی PWA
app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

app.listen(PORT, () => {
  console.log(
    `Shift PWA running on port ${PORT}`
  );
});
