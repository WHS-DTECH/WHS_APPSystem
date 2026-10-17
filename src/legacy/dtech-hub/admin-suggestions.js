const suggestionsTableBody = document.querySelector("#suggestions-table tbody");
const suggestionsStatus = document.querySelector("#suggestions-status");
const ADMIN_SUGGESTIONS_AUTH_STORAGE_KEY = "hub_google_auth_v1";

function setSuggestionsStatus(message, isError = false) {
  if (!suggestionsStatus) return;
  suggestionsStatus.textContent = message;
  suggestionsStatus.style.color = isError ? "#bb3f3f" : "#2f4e73";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toISOString().slice(0, 10);
}

function createCell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function readStoredHubEmail() {
  const raw = localStorage.getItem(ADMIN_SUGGESTIONS_AUTH_STORAGE_KEY) || sessionStorage.getItem(ADMIN_SUGGESTIONS_AUTH_STORAGE_KEY);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.profile?.email || "").trim().toLowerCase();
  } catch (_error) {
    return "";
  }
}

function buildAdminAuthHeaders() {
  const raw = localStorage.getItem(HUB_AUTH_STORAGE_KEY) || sessionStorage.getItem(HUB_AUTH_STORAGE_KEY);
  const headers = { "x-user-email": readStoredHubEmail() };
  try {
    const parsed = JSON.parse(raw || "{}");
    const token = String(parsed?.idToken || "").trim();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch (_error) {
  }
  return headers;
}

async function ensureAdminAccess() {
  const email = readStoredHubEmail();
  if (!email) {
    window.location.href = "index.html";
    return false;
  }

  try {
    const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error("Could not verify access");
    }

    const data = await response.json();
    if (!data?.can_admin) {
      window.location.href = "index.html";
      return false;
    }

    return true;
  } catch (_error) {
    window.location.href = "index.html";
    return false;
  }
}

function renderSuggestions(rows) {
  if (!suggestionsTableBody) return;
  suggestionsTableBody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No suggestions submitted yet.";
    tr.appendChild(td);
    suggestionsTableBody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.appendChild(createCell(formatDate(row.date)));
    tr.appendChild(createCell(row.kind));
    tr.appendChild(createCell(row.title));
    tr.appendChild(createCell(row.from));
    tr.appendChild(createCell(row.to));
    tr.appendChild(createCell(row.details));

    suggestionsTableBody.appendChild(tr);
  });
}

async function loadSuggestions() {
  try {
    setSuggestionsStatus("Loading suggestions...");
    const response = await fetch("/api/admin/suggestions/activity", { headers: buildAdminAuthHeaders() });
    if (!response.ok) {
      throw new Error("Could not load suggestions");
    }

    const payload = await response.json();
    const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
    const emails = Array.isArray(payload?.emails) ? payload.emails : [];
    const activities = [
      ...suggestions.map((row) => ({ date: row.created_at, kind: "Suggestion", title: row.suggestion_title || "-", from: row.submitted_by_email || row.submitted_by_name || "-", to: "-", details: row.reason || "-" })),
      ...emails.map((row) => ({ date: row.sent_at, kind: `Email: ${row.email_type || "hub_email"}`, title: row.subject || "-", from: row.from_email || "-", to: Array.isArray(row.recipients) ? row.recipients.join(", ") : String(row.recipients || "-"), details: "Sent successfully" }))
    ].sort((left, right) => new Date(right.date) - new Date(left.date));
    renderSuggestions(activities);
    setSuggestionsStatus(`${activities.length} suggestion and email record${activities.length === 1 ? "" : "s"} loaded.`);
  } catch (error) {
    setSuggestionsStatus(error.message || "Could not load suggestions.", true);
  }
}

ensureAdminAccess().then((allowed) => {
  if (allowed) {
    loadSuggestions();
  }
});
