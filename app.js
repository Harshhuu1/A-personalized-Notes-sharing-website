const page = document.documentElement.dataset.page || "user";

const state = {
  settings: null,
  notes: [],
  requests: [],
  adminToken: sessionStorage.getItem("notenvault-admin-token") || "",
  selectedNoteId: "",
  publicRefreshHandle: null,
};

const userEls = {
  siteNameLabel: document.getElementById("siteNameLabel"),
  siteTaglineLabel: document.getElementById("siteTaglineLabel"),
  upiText: document.getElementById("upiText"),
  upiLabel: document.getElementById("upiLabel"),
  featuredNoteTitle: document.getElementById("featuredNoteTitle"),
  qrPreview: document.getElementById("qrPreview"),
  catalog: document.getElementById("notes"),
  paymentSelect: document.getElementById("paymentNote"),
  paymentForm: document.getElementById("paymentForm"),
  paymentResult: document.getElementById("paymentResult"),
  accessCodeInput: document.getElementById("accessCodeInput"),
  openAccessBtn: document.getElementById("openAccessBtn"),
  saveAccessBtn: document.getElementById("saveAccessBtn"),
  noteViewer: document.getElementById("noteViewer"),
};

const adminEls = {
  adminSiteNameLabel: document.getElementById("adminSiteNameLabel"),
  loginForm: document.getElementById("adminLogin"),
  adminCodeInput: document.getElementById("adminCode"),
  adminStatusText: document.getElementById("adminStatusText"),
  loginTokenText: document.getElementById("loginTokenText"),
  adminLockNotice: document.getElementById("adminLockNotice"),
  logoutBtn: document.getElementById("logoutBtn"),
  settingsForm: document.getElementById("settingsForm"),
  siteNameInput: document.getElementById("siteNameInput"),
  taglineInput: document.getElementById("taglineInput"),
  upiIdInput: document.getElementById("upiIdInput"),
  adminCodeSettingInput: document.getElementById("adminCodeSettingInput"),
  accessPinInput: document.getElementById("accessPinInput"),
  qrForm: document.getElementById("qrForm"),
  qrInput: document.getElementById("qrInput"),
  adminQrPreview: document.getElementById("adminQrPreview"),
  noteForm: document.getElementById("noteForm"),
  noteIdInput: document.getElementById("noteIdInput"),
  noteSelect: document.getElementById("noteSelect"),
  noteTitleInput: document.getElementById("noteTitleInput"),
  noteCategoryInput: document.getElementById("noteCategoryInput"),
  notePriceInput: document.getElementById("notePriceInput"),
  noteSummaryInput: document.getElementById("noteSummaryInput"),
  noteBodyInput: document.getElementById("noteBodyInput"),
  noteFileInput: document.getElementById("noteFileInput"),
  noteFileHint: document.getElementById("noteFileHint"),
  notesList: document.getElementById("notesList"),
  requestList: document.getElementById("requestList"),
  notesCount: document.getElementById("notesCount"),
  pendingCountTop: document.getElementById("pendingCountTop"),
  approvedCountTop: document.getElementById("approvedCountTop"),
  pendingCount: document.getElementById("pendingCount"),
  approvedCount: document.getElementById("approvedCount"),
};

init();

async function init() {
  const bootstrapPromise = loadBootstrap().catch((error) => {
    console.error("Bootstrap failed", error);
    state.settings = {
      siteName: "NoteVault",
      tagline: "Sell notes securely",
      upiId: "yourname@upi",
      qrDataUrl: "assets/qr-placeholder.svg",
      accessPin: "VIEW2026",
    };
    state.notes = [];
  });

  if (page === "user") {
    bindUserEvents();
    renderUser();
    startPublicRefresh();
    await bootstrapPromise;
    renderUser();
  } else {
    bindAdminEvents();
    renderAdminLocked();
    void bootstrapPromise.then(() => {
      if (!state.adminToken) {
        renderAdminLocked();
      }
    });
    if (state.adminToken) {
      try {
        await bootstrapPromise;
        await loadAdminBootstrap();
      } catch {
        clearAdminSession();
        renderAdminLocked();
      }
    }
  }
}

async function loadBootstrap() {
  const response = await fetchJson("/api/bootstrap");
  state.settings = response.settings;
  state.notes = response.notes;
  state.selectedNoteId = state.notes[0]?.id || "";
}

function startPublicRefresh() {
  refreshPublicData();
  if (state.publicRefreshHandle) {
    clearInterval(state.publicRefreshHandle);
  }

  state.publicRefreshHandle = setInterval(() => {
    if (!document.hidden) {
      refreshPublicData();
    }
  }, 30000);

  window.addEventListener("focus", refreshPublicData);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshPublicData();
    }
  });
}

async function refreshPublicData() {
  const selectedNoteId = userEls.paymentSelect?.value || "";
  try {
    await loadBootstrap();
    renderUserLabels();
    if (selectedNoteId && userEls.paymentSelect) {
      userEls.paymentSelect.value = selectedNoteId;
    }
  } catch (error) {
    console.warn("Failed to refresh public data", error);
  }
}

function renderUser() {
  const settings = state.settings || {};

  setText(userEls.siteNameLabel, settings.siteName || "NoteVault");
  setText(userEls.siteTaglineLabel, settings.tagline || "Sell notes securely");
  setText(userEls.upiText, `UPI ID: ${settings.upiId || "yourname@upi"}`);
  setText(userEls.upiLabel, `UPI ID: ${settings.upiId || "yourname@upi"}`);
  if (userEls.qrPreview) {
    userEls.qrPreview.src = settings.qrDataUrl || "assets/qr-placeholder.svg";
  }
  if (userEls.featuredNoteTitle) {
    userEls.featuredNoteTitle.textContent = state.notes[0]?.title || "No notes yet";
  }

  if (userEls.paymentSelect) {
    userEls.paymentSelect.innerHTML = state.notes
      .map((note) => `<option value="${escapeHTML(note.id)}">${escapeHTML(note.title)} - ${escapeHTML(note.price)}</option>`)
      .join("");
  }

  if (userEls.catalog) {
    if (!state.notes.length) {
      userEls.catalog.innerHTML = `
        <div class="panel note-card">
          <span class="eyebrow">Catalog</span>
          <h3>No notes yet</h3>
          <p>Use the admin dashboard to add your first note bundle.</p>
        </div>
      `;
      return;
    }

    userEls.catalog.innerHTML = state.notes
      .map((note) => {
        const previewLabel = note.bodyType === "text" ? "Text note" : note.bodyType.toUpperCase();
        const fileLabel = note.fileName ? `File: ${note.fileName}` : "No file attached";
        return `
          <article class="panel note-card">
            <div class="note-meta">
              <span class="tag">${escapeHTML(note.category)}</span>
              <span class="tag">${escapeHTML(note.price)}</span>
              <span class="tag">${escapeHTML(previewLabel)}</span>
              <span class="tag">${escapeHTML(fileLabel)}</span>
            </div>
            <h3>${escapeHTML(note.title)}</h3>
            <p>${escapeHTML(note.summary)}</p>
            <div class="note-actions">
              <button class="button primary" type="button" data-buy="${escapeHTML(note.id)}">Buy now</button>
            </div>
          </article>
        `;
      })
      .join("");

    userEls.catalog.querySelectorAll("[data-buy]").forEach((button) => {
      button.addEventListener("click", () => {
        if (userEls.paymentSelect) {
          userEls.paymentSelect.value = button.dataset.buy;
        }
        location.hash = "#payment";
      });
    });
  }

  const savedCode = localStorage.getItem("notenvault-access-code");
  if (savedCode && userEls.accessCodeInput) {
    userEls.accessCodeInput.value = savedCode;
  }

  if (userEls.noteViewer) {
    userEls.noteViewer.innerHTML = `
      <div class="viewer-empty">
        <div>
          <h3>Enter your access code</h3>
          <p>Once approved, your note will open here without a download button.</p>
        </div>
      </div>
    `;
  }
}

function bindUserEvents() {
  if (userEls.paymentForm) {
    userEls.paymentForm.addEventListener("submit", submitPaymentRequest);
  }

  if (userEls.openAccessBtn) {
    userEls.openAccessBtn.addEventListener("click", openAccessCode);
  }

  if (userEls.saveAccessBtn) {
    userEls.saveAccessBtn.addEventListener("click", () => {
      if (userEls.accessCodeInput) {
        localStorage.setItem("notenvault-access-code", userEls.accessCodeInput.value.trim());
      }
    });
  }
}

async function submitPaymentRequest(event) {
  event.preventDefault();
  const noteId = userEls.paymentSelect?.value;
  const buyerName = userEls.paymentForm.querySelector("#buyerName")?.value.trim();
  const txnId = userEls.paymentForm.querySelector("#txnId")?.value.trim();
  const buyerContact = userEls.paymentForm.querySelector("#buyerContact")?.value.trim();

  if (!noteId || !buyerName || !txnId || !buyerContact) return;

  try {
    const response = await fetchJson("/api/requests", {
      method: "POST",
      body: JSON.stringify({ noteId, buyerName, txnId, buyerContact }),
    });

    if (userEls.paymentResult) {
      userEls.paymentResult.textContent = `Request sent. Save this access code: ${response.accessCode}`;
    }

    if (userEls.accessCodeInput) {
      userEls.accessCodeInput.value = response.accessCode;
      localStorage.setItem("notenvault-access-code", response.accessCode);
    }

    userEls.paymentForm.reset();
    if (userEls.paymentSelect) {
      userEls.paymentSelect.value = noteId;
    }
  } catch (error) {
    if (userEls.paymentResult) {
      userEls.paymentResult.textContent = error.message || "Could not submit request.";
    }
  }
}

async function openAccessCode() {
  const code = userEls.accessCodeInput?.value.trim();
  if (!code) return;

  localStorage.setItem("notenvault-access-code", code);

  try {
    const response = await fetchJson(`/api/access/${encodeURIComponent(code)}`);
    renderApprovedNote(response.note, response.request);
  } catch (error) {
    renderAccessError(error.message || "Access not approved yet.");
  }
}

function renderApprovedNote(note, request) {
  if (!userEls.noteViewer || !note) return;

  const content = renderNoteBody(note);
  userEls.noteViewer.innerHTML = `
    <div class="viewer-content">
      <span class="eyebrow">Unlocked</span>
      <h3>${escapeHTML(note.title)}</h3>
      <div class="locked-note">
        Access approved for ${escapeHTML(request.buyerName)}.
      </div>
      <div class="blurb">${content}</div>
    </div>
  `;
}

function renderAccessError(message) {
  if (!userEls.noteViewer) return;

  userEls.noteViewer.innerHTML = `
    <div class="viewer-empty">
      <div>
        <h3>Access not ready</h3>
        <p>${escapeHTML(message)}</p>
      </div>
    </div>
  `;
}

function renderNoteBody(note) {
  if (note.bodyType === "image" && note.fileDataUrl) {
    return `<img class="note-media" src="${escapeAttr(note.fileDataUrl)}" alt="${escapeAttr(note.title)}" />`;
  }

  if (note.bodyType === "pdf" && note.fileDataUrl) {
    return `<iframe class="note-media note-pdf" src="${escapeAttr(note.fileDataUrl)}" title="${escapeAttr(note.title)}"></iframe>`;
  }

  const body = note.bodyText || "";
  return body
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHTML(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function renderAdmin() {
  if (!state.settings) return;

  setText(adminEls.adminSiteNameLabel, state.settings.siteName || "NoteVault");
  fillAdminState();
  fillSettingsForm();
  fillNoteSelect();
  renderAdminNotes();
  renderAdminRequests();
  syncCounters();

  if (state.settings.qrDataUrl) {
    adminEls.adminQrPreview.src = state.settings.qrDataUrl;
  }

  setAdminUnlockedUI(Boolean(state.adminToken));
}

function renderAdminLocked() {
  fillAdminState();
  if (adminEls.adminLockNotice) {
    adminEls.adminLockNotice.textContent =
      "The dashboard is locked. Enter the admin code to reveal settings, notes, and requests.";
  }
  setAdminUnlockedUI(false);
  if (adminEls.adminQrPreview) {
    adminEls.adminQrPreview.src = state.settings?.qrDataUrl || "assets/qr-placeholder.svg";
  }
}

function fillAdminState() {
  setText(adminEls.adminStatusText, state.adminToken ? "Unlocked" : "Locked");
  setText(adminEls.loginTokenText, state.adminToken ? state.adminToken.slice(0, 8) : "No token");
}

function setAdminUnlockedUI(unlocked) {
  const controls = [
    adminEls.logoutBtn,
    adminEls.settingsForm,
    adminEls.qrForm,
    adminEls.noteForm,
    adminEls.noteSelect,
  ].filter(Boolean);

  controls.forEach((control) => {
    if ("disabled" in control) {
      control.disabled = !unlocked;
    }
  });

  document.querySelectorAll("[data-admin-gated]").forEach((section) => {
    section.classList.toggle("hidden", !unlocked);
    section.classList.toggle("gated", !unlocked);
    section.querySelectorAll("input, textarea, select, button").forEach((field) => {
      field.disabled = !unlocked;
    });
  });
}

function fillSettingsForm() {
  if (!adminEls.settingsForm) return;

  adminEls.siteNameInput.value = state.settings.siteName || "";
  adminEls.taglineInput.value = state.settings.tagline || "";
  adminEls.upiIdInput.value = state.settings.upiId || "";
  adminEls.adminCodeSettingInput.value = state.settings.adminCode || "";
  adminEls.accessPinInput.value = state.settings.accessPin || "";
}

function fillNoteSelect() {
  if (!adminEls.noteSelect) return;

  adminEls.noteSelect.innerHTML = [
    `<option value="">New note</option>`,
    ...state.notes.map((note) => {
      const suffix = note.fileName ? ` • ${note.fileName}` : "";
      return `<option value="${escapeAttr(note.id)}">${escapeHTML(note.title)}${escapeHTML(suffix)}</option>`;
    }),
  ].join("");
}

function renderAdminNotes() {
  if (adminEls.notesCount) adminEls.notesCount.textContent = String(state.notes.length);

  if (!adminEls.notesList) return;

  if (!state.notes.length) {
    adminEls.notesList.innerHTML = `<p class="helper-text">No notes yet.</p>`;
    return;
  }

  adminEls.notesList.innerHTML = state.notes
    .map(
      (note) => `
        <article class="request-item">
          <div>
            <strong class="request-title">${escapeHTML(note.title)}</strong>
            <p class="request-meta">${escapeHTML(note.category)} | ${escapeHTML(note.price)} | ${escapeHTML(note.bodyType)}${note.fileName ? ` | File: ${escapeHTML(note.fileName)}` : ""}</p>
          </div>
          <div class="request-actions">
            <button class="button tiny secondary" type="button" data-edit-note="${escapeAttr(note.id)}">Edit</button>
            <button class="button tiny danger" type="button" data-delete-note="${escapeAttr(note.id)}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  adminEls.notesList.querySelectorAll("[data-edit-note]").forEach((button) => {
    button.addEventListener("click", () => loadNoteIntoForm(button.dataset.editNote));
  });

  adminEls.notesList.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => deleteNote(button.dataset.deleteNote));
  });
}

function renderAdminRequests() {
  const pending = state.requests.filter((request) => request.status === "pending");
  const approved = state.requests.filter((request) => request.status === "approved");

  if (adminEls.pendingCountTop) adminEls.pendingCountTop.textContent = String(pending.length);
  if (adminEls.approvedCountTop) adminEls.approvedCountTop.textContent = String(approved.length);
  if (adminEls.pendingCount) adminEls.pendingCount.textContent = String(pending.length);
  if (adminEls.approvedCount) adminEls.approvedCount.textContent = String(approved.length);

  if (!adminEls.requestList) return;

  if (!state.requests.length) {
    adminEls.requestList.innerHTML = `<p class="helper-text">No payment requests yet.</p>`;
    return;
  }

  adminEls.requestList.innerHTML = state.requests
    .map((request) => {
      const note = state.notes.find((item) => item.id === request.noteId);
      return `
        <article class="request-item">
          <div>
            <strong class="request-title">${escapeHTML(request.buyerName)} - ${escapeHTML(note?.title || "Unknown note")}</strong>
            <p class="request-meta">
              ${escapeHTML(request.status)} | Txn: ${escapeHTML(request.txnId)} | ${escapeHTML(request.buyerContact)} | Access: ${escapeHTML(request.accessCode)}
            </p>
          </div>
          <div class="request-actions">
            <button class="button tiny secondary" type="button" data-approve="${escapeAttr(request.id)}">Approve</button>
            <button class="button tiny danger" type="button" data-reject="${escapeAttr(request.id)}">Reject</button>
          </div>
        </article>
      `;
    })
    .join("");

  adminEls.requestList.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => updateRequestStatus(button.dataset.approve, "approved"));
  });

  adminEls.requestList.querySelectorAll("[data-reject]").forEach((button) => {
    button.addEventListener("click", () => updateRequestStatus(button.dataset.reject, "rejected"));
  });
}

function bindAdminEvents() {
  if (adminEls.loginForm) {
    adminEls.loginForm.addEventListener("submit", loginAdmin);
  }
  if (adminEls.logoutBtn) {
    adminEls.logoutBtn.addEventListener("click", logoutAdmin);
  }
  if (adminEls.settingsForm) {
    adminEls.settingsForm.addEventListener("submit", saveSettings);
  }
  if (adminEls.qrForm) {
    adminEls.qrForm.addEventListener("submit", saveQr);
  }
  if (adminEls.noteForm) {
    adminEls.noteForm.addEventListener("submit", saveNote);
  }
  if (adminEls.noteSelect) {
    adminEls.noteSelect.addEventListener("change", () => {
      if (adminEls.noteSelect.value) {
        loadNoteIntoForm(adminEls.noteSelect.value);
      } else {
        clearNoteForm();
      }
    });
  }
}

async function loginAdmin(event) {
  event.preventDefault();
  const code = adminEls.adminCodeInput.value.trim();
  try {
    const response = await fetchJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    state.adminToken = response.token;
    sessionStorage.setItem("notenvault-admin-token", response.token);
    await loadAdminBootstrap();
  } catch (error) {
    clearAdminSession();
    renderAdminLocked();
    alert(error.message || "Login failed");
  }
}

async function loadAdminBootstrap() {
  const response = await fetchJson("/api/admin/bootstrap", {
    headers: adminHeaders(),
  });
  state.settings = response.settings;
  state.notes = response.notes;
  state.requests = response.requests;
  renderAdmin();
}

async function logoutAdmin() {
  clearAdminSession();
  renderAdminLocked();
}

function clearAdminSession() {
  state.adminToken = "";
  sessionStorage.removeItem("notenvault-admin-token");
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const response = await fetchJson("/api/settings", {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({
        siteName: adminEls.siteNameInput.value,
        tagline: adminEls.taglineInput.value,
        upiId: adminEls.upiIdInput.value,
        adminCode: adminEls.adminCodeSettingInput.value,
        accessPin: adminEls.accessPinInput.value,
        qrDataUrl: state.settings.qrDataUrl || "",
      }),
    });
    state.settings = { ...state.settings, ...response.settings };
    renderUserLabels();
    renderAdmin();
  } catch (error) {
    alert(error.message || "Could not save settings");
  }
}

async function saveQr(event) {
  event.preventDefault();
  const file = adminEls.qrInput.files[0];
  if (!file) return;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetchJson("/api/qr", {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({ qrDataUrl: dataUrl }),
    });
    state.settings = { ...state.settings, ...response.settings };
    if (adminEls.adminQrPreview) adminEls.adminQrPreview.src = dataUrl;
    renderUserLabels();
  } catch (error) {
    alert(error.message || "Could not save QR");
  }
}

async function saveNote(event) {
  event.preventDefault();
  const file = adminEls.noteFileInput.files[0];
  let bodyType = "text";
  let bodyText = adminEls.noteBodyInput.value || "";
  let fileDataUrl = "";
  let fileName = "";

  try {
    if (file) {
      fileName = file.name;
      if (file.type.startsWith("image/")) {
        bodyType = "image";
        fileDataUrl = await readFileAsDataUrl(file);
      } else if (file.type === "application/pdf") {
        bodyType = "pdf";
        fileDataUrl = await readFileAsDataUrl(file);
      } else {
        bodyType = "text";
        bodyText = await readFileAsText(file);
      }
    }

    const payload = {
      id: adminEls.noteIdInput.value || undefined,
      title: adminEls.noteTitleInput.value,
      category: adminEls.noteCategoryInput.value,
      price: adminEls.notePriceInput.value,
      summary: adminEls.noteSummaryInput.value,
      bodyType,
      bodyText,
      fileName,
      fileDataUrl,
    };

    await fetchJson("/api/notes", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(payload),
    });

    adminEls.noteForm.reset();
adminEls.noteIdInput.value = "";
if (adminEls.noteFileHint) adminEls.noteFileHint.textContent = "";
await loadAdminBootstrap();
  } catch (error) {
    alert(error.message || "Could not save note");
  }
}

async function deleteNote(id) {
  try {
    await fetchJson(`/api/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await loadAdminBootstrap();
  } catch (error) {
    alert(error.message || "Could not delete note");
  }
}

async function loadNoteIntoForm(id) {
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;
  adminEls.noteIdInput.value = note.id;
  adminEls.noteSelect.value = note.id;
  adminEls.noteTitleInput.value = note.title || "";
  adminEls.noteCategoryInput.value = note.category || "";
  adminEls.notePriceInput.value = note.price || "";
  adminEls.noteSummaryInput.value = note.summary || "";
  adminEls.noteBodyInput.value = note.bodyText || "";
if (adminEls.noteFileHint) {
  adminEls.noteFileHint.textContent = note.fileDataUrl
    ? `Currently attached: ${note.fileName || note.bodyType + " file"}. Leave the file field empty to keep it, or choose a new file to replace it.`
    : "No file currently attached to this note.";
}
}

function clearNoteForm() {
  adminEls.noteForm.reset();
  adminEls.noteIdInput.value = "";
  if (adminEls.noteFileHint) adminEls.noteFileHint.textContent = "";
}

async function updateRequestStatus(id, status) {
  try {
    await fetchJson(`/api/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    });
    await loadAdminBootstrap();
  } catch (error) {
    alert(error.message || "Could not update request");
  }
}

function renderUserLabels() {
  const settings = state.settings || {};
  setText(userEls.siteNameLabel, settings.siteName || "NoteVault");
  setText(userEls.siteTaglineLabel, settings.tagline || "Sell notes securely");
  setText(userEls.upiText, `UPI ID: ${settings.upiId || "yourname@upi"}`);
  setText(userEls.upiLabel, `UPI ID: ${settings.upiId || "yourname@upi"}`);
  if (userEls.qrPreview) {
    userEls.qrPreview.src = settings.qrDataUrl || "assets/qr-placeholder.svg";
  }
  if (userEls.featuredNoteTitle) {
    userEls.featuredNoteTitle.textContent = state.notes[0]?.title || "No notes yet";
  }
  if (userEls.paymentSelect) {
    userEls.paymentSelect.innerHTML = state.notes
      .map((note) => `<option value="${escapeAttr(note.id)}">${escapeHTML(note.title)} - ${escapeHTML(note.price)}</option>`)
      .join("");
  }
  if (userEls.catalog) {
    if (!state.notes.length) {
      userEls.catalog.innerHTML = `
        <div class="panel note-card">
          <span class="eyebrow">Catalog</span>
          <h3>No notes yet</h3>
          <p>Use the admin dashboard to add your first note bundle.</p>
        </div>
      `;
      return;
    }

    userEls.catalog.innerHTML = state.notes
      .map((note) => {
        const previewLabel = note.bodyType === "text" ? "Text note" : note.bodyType.toUpperCase();
        return `
          <article class="panel note-card">
            <div class="note-meta">
              <span class="tag">${escapeHTML(note.category)}</span>
              <span class="tag">${escapeHTML(note.price)}</span>
              <span class="tag">${escapeHTML(previewLabel)}</span>
            </div>
            <h3>${escapeHTML(note.title)}</h3>
            <p>${escapeHTML(note.summary)}</p>
            <div class="note-actions">
              <button class="button primary" type="button" data-buy="${escapeAttr(note.id)}">Buy now</button>
            </div>
          </article>
        `;
      })
      .join("");
    userEls.catalog.querySelectorAll("[data-buy]").forEach((button) => {
      button.addEventListener("click", () => {
        if (userEls.paymentSelect) userEls.paymentSelect.value = button.dataset.buy;
        location.hash = "#payment";
      });
    });
  }
}

function syncCounters() {
  const pending = state.requests.filter((request) => request.status === "pending").length;
  const approved = state.requests.filter((request) => request.status === "approved").length;
  if (adminEls.pendingCountTop) adminEls.pendingCountTop.textContent = String(pending);
  if (adminEls.approvedCountTop) adminEls.approvedCountTop.textContent = String(approved);
  if (adminEls.pendingCount) adminEls.pendingCount.textContent = String(pending);
  if (adminEls.approvedCount) adminEls.approvedCount.textContent = String(approved);
}

function adminHeaders() {
  return state.adminToken ? { "x-admin-token": state.adminToken } : {};
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || response.statusText);
  }

  return response.json();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function escapeHTML(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll("\n", " ");
}
