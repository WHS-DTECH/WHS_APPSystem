const suggestionForm = document.querySelector("#suggestion-form");
const suggestionStatus = document.querySelector("#suggestion-status");
const suggestionEmail = document.querySelector("#submitted-by-email");
const suggestionAttachment = document.querySelector("#suggestion-attachment");

function setSuggestionStatus(message, isError = false) {
  if (!suggestionStatus) return;
  suggestionStatus.textContent = `Status: ${message}`;
  suggestionStatus.style.color = isError ? "#bb3f3f" : "#2f4e73";
}

function isValidSchoolEmail(email) {
  return /@westlandhigh\.school\.nz$/i.test(String(email || "").trim());
}

if (suggestionForm) {
  suggestionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailValue = String(suggestionEmail?.value || "").trim().toLowerCase();
    if (!isValidSchoolEmail(emailValue)) {
      setSuggestionStatus("Please use a valid school/work email ending in @westlandhigh.school.nz.", true);
      return;
    }

    if (suggestionAttachment?.files?.[0] && suggestionAttachment.files[0].size > 10 * 1024 * 1024) {
      setSuggestionStatus("PDF attachment is too large. Maximum size is 10 MB.", true);
      return;
    }

    const formData = new FormData(suggestionForm);

    try {
      setSuggestionStatus("Sending your suggestion...");
      const response = await fetch("/api/suggestions", {
        method: "POST",
        body: formData
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Could not submit suggestion");
      }

      suggestionForm.reset();
      if (payload.email_status === "failed") {
        setSuggestionStatus(`Suggestion submitted, but email notification failed: ${payload.email_error || "check the hub email settings"}.`, true);
      } else if (payload.email_status === "not_configured") {
        setSuggestionStatus("Suggestion submitted, but email notification is not configured on the hub.", true);
      } else if (payload.email_status === "no_recipients") {
        setSuggestionStatus("Suggestion submitted, but no notification recipients are configured.", true);
      } else {
        setSuggestionStatus("Suggestion submitted. Admin and teaching roles have been notified.");
      }
    } catch (error) {
      setSuggestionStatus(error.message || "Could not submit suggestion.", true);
    }
  });
}
