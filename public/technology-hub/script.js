function renderHubLastUpdated() {
  const stamp = document.querySelector("[data-hub-last-updated]");
  if (!stamp) return;

  const hasLastModified = typeof document.lastModified === "string" && document.lastModified.trim().length > 0;
  const parsed = hasLastModified ? new Date(document.lastModified) : new Date();
  const timestamp = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const formatted = new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Pacific/Auckland"
  }).format(timestamp);

  stamp.textContent = `Hub last updated: ${formatted} NZT`;
}

renderHubLastUpdated();
