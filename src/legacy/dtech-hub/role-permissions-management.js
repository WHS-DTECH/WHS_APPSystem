const tableBody = document.querySelector("#permissions-table tbody");
const saveButton = document.querySelector("#save-permissions");
const resetButton = document.querySelector("#reset-permissions");
const statusElement = document.querySelector("#permissions-status");

function setStatus(message, isError = false) {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.style.color = isError ? "#bb3f3f" : "#2f4e73";
}

async function fetchPermissions() {
  const response = await fetch("/api/admin/role-permissions");
  if (!response.ok) throw new Error("Could not load role permissions");
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function checkboxCell(name, checked) {
  return `<td><input type="checkbox" data-field="${name}" ${checked ? "checked" : ""}></td>`;
}

function renderPermissions(rows) {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.role = row.role_name;
    tr.innerHTML = `
      <td>${row.role_name}</td>
      ${checkboxCell("home_page", row.home_page)}
      ${checkboxCell("upload_activity", row.upload_activity)}
      ${checkboxCell("browse_activities", row.browse_activities)}
      ${checkboxCell("planning", row.planning)}
      ${checkboxCell("admin", row.admin)}
    `;
    tableBody.appendChild(tr);
  });
}

function gatherPermissions() {
  if (!tableBody) return [];

  return Array.from(tableBody.querySelectorAll("tr")).map((row) => {
    const getValue = (field) => Boolean(row.querySelector(`[data-field="${field}"]`)?.checked);

    return {
      role_name: row.dataset.role || "",
      home_page: getValue("home_page"),
      upload_activity: getValue("upload_activity"),
      browse_activities: getValue("browse_activities"),
      planning: getValue("planning"),
      admin: getValue("admin")
    };
  });
}

async function refresh() {
  const rows = await fetchPermissions();
  renderPermissions(rows);
}

if (saveButton) {
  saveButton.addEventListener("click", async () => {
    try {
      const permissions = gatherPermissions();
      const response = await fetch("/api/admin/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions })
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Could not save permissions");
      }

      setStatus("Role permissions updated.");
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

if (resetButton) {
  resetButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/admin/role-permissions/reset", { method: "POST" });
      if (!response.ok) {
        throw new Error(await response.text() || "Could not reset permissions");
      }

      setStatus("Role permissions reset to defaults.");
      await refresh();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

refresh().catch((error) => setStatus(error.message, true));
