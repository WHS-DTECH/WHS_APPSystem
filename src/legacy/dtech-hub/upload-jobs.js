"use strict";

const jobForm = document.querySelector("#upload-job-form");
const jobStatus = document.querySelector("#job-upload-status");
const jobAuthStatus = document.querySelector("#jobs-auth-status");
const jobClientEnabled = document.querySelector("#job-client-enabled");
const jobClientDetails = document.querySelector("#job-client-details");
const jobClientName = document.querySelector("#job-client-name");
const jobClientEmail = document.querySelector("#job-client-email");
const JOB_DRAFT_STORAGE_KEY = "dtechHub:uploadJobsDraft:v1";

function renderClientFields() {
    const enabled = Boolean(jobClientEnabled?.checked);
    if (jobClientDetails) {
        jobClientDetails.hidden = !enabled;
        jobClientDetails.disabled = !enabled;
    }
    if (jobClientName) jobClientName.required = enabled;
    if (jobClientEmail) jobClientEmail.required = enabled;
}

function setJobUploadStatus(message, isError = false) {
    if (!jobStatus) return;
    jobStatus.textContent = String(message || "");
    jobStatus.hidden = !message;
    jobStatus.classList.toggle("is-error", Boolean(isError));
    jobStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

function renderJobAuthStatus() {
    const email = typeof getActiveHubEmail === "function" ? getActiveHubEmail() : "";
    if (jobAuthStatus) {
        jobAuthStatus.textContent = email
            ? `Signed in as ${email}`
            : "Not signed in. Sign in with your school Google account before saving.";
        jobAuthStatus.classList.toggle("is-missing", !email);
    }
    const submit = jobForm?.querySelector('[type="submit"]');
    if (submit) submit.disabled = !email;
}

function saveJobDraft() {
    if (!jobForm) return;
    const values = Object.fromEntries(new FormData(jobForm).entries());
    values.clientEnabled = Boolean(jobClientEnabled?.checked);
    values.onsiteClient = Boolean(jobForm.elements.namedItem("onsiteClient")?.checked);
    try {
        localStorage.setItem(JOB_DRAFT_STORAGE_KEY, JSON.stringify(values));
    } catch (_error) {
    }
}

function restoreJobDraft() {
    if (!jobForm) return;
    try {
        const draft = JSON.parse(localStorage.getItem(JOB_DRAFT_STORAGE_KEY) || "null");
        if (!draft || typeof draft !== "object") return;
        Object.entries(draft).forEach(([key, value]) => {
            const field = jobForm.elements.namedItem(key);
            if (!field) return;
            if (field.type === "checkbox") field.checked = value === "on" || value === true;
            else field.value = String(value || "");
        });
    } catch (_error) {
    }
    renderClientFields();
}

jobForm?.addEventListener("input", saveJobDraft);
jobForm?.addEventListener("change", () => {
    renderClientFields();
    saveJobDraft();
});
document.querySelector("#clear-job-draft")?.addEventListener("click", () => {
    jobForm?.reset();
    renderClientFields();
    try {
        localStorage.removeItem(JOB_DRAFT_STORAGE_KEY);
    } catch (_error) {
    }
    setJobUploadStatus("Draft cleared.");
});

jobForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (typeof getActiveHubEmail !== "function" || !getActiveHubEmail()) {
        setJobUploadStatus("Sign in with your school Google account before saving.", true);
        renderJobAuthStatus();
        return;
    }

    const formData = new FormData(jobForm);
    const payload = {
        title: String(formData.get("title") || "").trim(),
        summary: String(formData.get("summary") || "").trim(),
        href: String(formData.get("href") || "").trim(),
        imageUrl: String(formData.get("imageUrl") || "").trim(),
        status: String(formData.get("status") || "active").trim(),
        client: {
            enabled: formData.get("clientEnabled") === "on",
            name: String(formData.get("clientName") || "").trim(),
            email: String(formData.get("clientEmail") || "").trim(),
            onsite: formData.get("onsiteClient") === "on"
        }
    };
    const submit = jobForm.querySelector('[type="submit"]');
    if (submit) {
        submit.disabled = true;
        submit.textContent = "Saving...";
    }
    setJobUploadStatus("");

    try {
        const response = await fetch("/api/learning-pathways/jobs", {
            method: "POST",
            headers: withHubAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || `Could not save job (HTTP ${response.status}).`);

        jobForm.reset();
        renderClientFields();
        try {
            localStorage.removeItem(JOB_DRAFT_STORAGE_KEY);
        } catch (_error) {
        }
        setJobUploadStatus(`Saved ${result.card?.title || payload.title} to the MiddleDTECH Jobs library.`);
    } catch (error) {
        setJobUploadStatus(error?.message || "Could not save the Jobs card.", true);
    } finally {
        if (submit) {
            submit.disabled = false;
            submit.textContent = "Save Jobs Card";
        }
        renderJobAuthStatus();
    }
});

restoreJobDraft();
renderClientFields();
renderJobAuthStatus();
window.addEventListener("hub-auth-state-changed", renderJobAuthStatus);