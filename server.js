const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const dataDir = path.join(root, "data");
const uploadsDir = path.join(dataDir, "uploads");
const dbPath = path.join(dataDir, "db.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const seedDb = {
  settings: {
    siteName: "NoteVault",
    tagline: "Sell notes securely",
    upiId: "yourname@upi",
    adminCode: "abheer@123",
    accessPin: "VIEW2026",
    qrDataUrl: "",
  },
  notes: [
    {
      id: "physics-formula-pack",
      title: "Physics Formula Pack",
      category: "Class 11-12",
      price: "INR 49",
      summary: "Core mechanics, electricity, and quick revision formulas packed into one clean sheet.",
      bodyType: "text",
      bodyText: "Mechanics\ns = ut + 1/2 at^2\nv^2 = u^2 + 2as\nF = ma\nWork = Force x Displacement\n\nElectricity\nV = IR\nP = VI\nQ = It\n\nTips\nRead the formulas slowly and keep one example question under each section.",
      fileName: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "chemistry-short-notes",
      title: "Chemistry Short Notes",
      category: "Board exam",
      price: "INR 59",
      summary: "Concise definitions, reactions, and memory-friendly chapter summaries for revision.",
      bodyType: "text",
      bodyText: "Atomic structure, periodicity, bonding, acids and bases, and quick reaction maps.\n\nUse this pack for one-day revision before exams.",
      fileName: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  requests: [],
};

ensureDb();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log("NoteVault running on http://localhost:" + (process.env.PORT || 3000));
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const db = readDb();
    sendJson(res, 200, {
      settings: sanitizeSettings(db.settings),
      notes: db.notes,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readJson(req);
    const db = readDb();
    if ((body.code || "").trim() !== getExpectedAdminCode(db)) {
      sendJson(res, 401, { error: "Invalid admin code" });
      return;
    }

    const token = crypto.randomUUID();
    const tokens = loadTokens();
    tokens[token] = { createdAt: Date.now() };
    saveTokens(tokens);
    sendJson(res, 200, { token });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/requests") {
    const body = await readJson(req);
    const db = readDb();
    const note = db.notes.find((item) => item.id === body.noteId);
    if (!note) {
      sendJson(res, 400, { error: "Unknown note" });
      return;
    }

    const request = {
      id: crypto.randomUUID(),
      noteId: note.id,
      buyerName: String(body.buyerName || "").trim(),
      buyerContact: String(body.buyerContact || "").trim(),
      txnId: String(body.txnId || "").trim(),
      accessCode: randomCode(),
      status: "pending",
      createdAt: new Date().toISOString(),
      approvedAt: "",
    };

    if (!request.buyerName || !request.buyerContact || !request.txnId) {
      sendJson(res, 400, { error: "Missing request fields" });
      return;
    }

    db.requests.unshift(request);
    writeDb(db);
    sendJson(res, 200, {
      requestId: request.id,
      accessCode: request.accessCode,
      status: request.status,
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/access/")) {
    const code = decodeURIComponent(url.pathname.split("/").pop() || "");
    const db = readDb();
    const request = db.requests.find((item) => item.accessCode === code && item.status === "approved");
    if (!request) {
      sendJson(res, 404, { error: "Access not approved yet" });
      return;
    }

    const note = db.notes.find((item) => item.id === request.noteId);
    sendJson(res, 200, {
      request: publicRequest(request),
      note,
      settings: sanitizeSettings(db.settings),
    });
    return;
  }

  const token = getToken(req);
  if (!isValidToken(token)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  const db = readDb();

  if (req.method === "GET" && url.pathname === "/api/admin/bootstrap") {
    sendJson(res, 200, { settings: sanitizeSettings(db.settings), notes: db.notes, requests: db.requests });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const body = await readJson(req);
    db.settings = {
      ...db.settings,
      siteName: String(body.siteName || db.settings.siteName).trim(),
      tagline: String(body.tagline || db.settings.tagline).trim(),
      upiId: String(body.upiId || db.settings.upiId).trim(),
      adminCode: String(body.adminCode || db.settings.adminCode).trim(),
      accessPin: String(body.accessPin || db.settings.accessPin).trim(),
      qrDataUrl: String(body.qrDataUrl || db.settings.qrDataUrl || ""),
    };
    writeDb(db);
    sendJson(res, 200, { settings: sanitizeSettings(db.settings) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/notes") {
    const body = await readJson(req);
    const now = new Date().toISOString();
    const note = {
      id: body.id || crypto.randomUUID(),
      title: String(body.title || "").trim(),
      category: String(body.category || "").trim(),
      price: String(body.price || "").trim(),
      summary: String(body.summary || "").trim(),
      bodyType: body.bodyType === "image" || body.bodyType === "pdf" ? body.bodyType : "text",
      bodyText: String(body.bodyText || ""),
      fileName: String(body.fileName || ""),
      fileDataUrl: String(body.fileDataUrl || ""),
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    if (!note.title || !note.category || !note.price || !note.summary) {
      sendJson(res, 400, { error: "Missing note fields" });
      return;
    }

    const index = db.notes.findIndex((item) => item.id === note.id);
    if (index >= 0) {
      const existing = db.notes[index];
      const merged = { ...existing, ...note };
      if (!note.fileDataUrl) {
        merged.bodyType = existing.bodyType;
        merged.fileDataUrl = existing.fileDataUrl;
        merged.fileName = existing.fileName;
        merged.bodyText = note.bodyText || existing.bodyText;
    }
      db.notes[index] = merged;
}     else {
        db.notes.unshift(note);
}
writeDb(db);
    sendJson(res, 200, { note });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/notes/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    db.notes = db.notes.filter((item) => item.id !== id);
    db.requests = db.requests.filter((item) => item.noteId !== id);
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/qr") {
    const body = await readJson(req);
    db.settings.qrDataUrl = String(body.qrDataUrl || "");
    writeDb(db);
    sendJson(res, 200, { settings: sanitizeSettings(db.settings) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/requests") {
    sendJson(res, 200, { requests: db.requests.map(publicRequest) });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/requests/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    const body = await readJson(req);
    const request = db.requests.find((item) => item.id === id);
    if (!request) {
      sendJson(res, 404, { error: "Request not found" });
      return;
    }

    request.status = body.status === "approved" ? "approved" : "rejected";
    request.approvedAt = request.status === "approved" ? new Date().toISOString() : "";
    writeDb(db);
    sendJson(res, 200, { request: publicRequest(request) });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(root, "index.html") : path.join(root, pathname.replace(/^\/+/, ""));
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(root)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(normalized).toLowerCase();
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(normalized).pipe(res);
}

function ensureDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(seedDb, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function loadTokens() {
  const file = path.join(dataDir, "tokens.json");
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "{}", "utf8");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveTokens(tokens) {
  const file = path.join(dataDir, "tokens.json");
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), "utf8");
}

function isValidToken(token) {
  if (!token) return false;
  const tokens = loadTokens();
  return Boolean(tokens[token]);
}

function getExpectedAdminCode(db) {
  return String(process.env.ADMIN_CODE || db.settings.adminCode || seedDb.settings.adminCode).trim();
}

function getToken(req) {
  return req.headers["x-admin-token"] || "";
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function randomCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function sanitizeSettings(settings) {
  return {
    siteName: settings.siteName,
    tagline: settings.tagline,
    upiId: settings.upiId,
    accessPin: settings.accessPin,
    qrDataUrl: settings.qrDataUrl || "",
  };
}

function publicRequest(request) {
  return {
    id: request.id,
    noteId: request.noteId,
    buyerName: request.buyerName,
    buyerContact: request.buyerContact,
    txnId: request.txnId,
    accessCode: request.accessCode,
    status: request.status,
    createdAt: request.createdAt,
    approvedAt: request.approvedAt || "",
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
