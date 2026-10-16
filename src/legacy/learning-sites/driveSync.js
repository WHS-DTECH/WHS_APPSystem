const DEFAULT_GOOGLE_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1sLelrgqZRq1jKxH_AJ_21jpNjH8FSLLF?usp=drive_link";

function getGoogleDriveFolderUrl() {
  return process.env.GOOGLE_DRIVE_SYNC_FOLDER_URL || DEFAULT_GOOGLE_DRIVE_FOLDER_URL;
}

async function fetchPublicDriveFolderPdfs() {
  const response = await fetch(getGoogleDriveFolderUrl(), {
    headers: {
      "User-Agent": "WHS-LearningSite/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Google Drive folder request failed with status ${response.status}`);
  }

  const html = await response.text();
  const fileMatches = [...html.matchAll(/data-id="([^"]+)"[^>]*data-tooltip="([^"]+\.pdf)\s+PDF"/gi)];
  const seenIds = new Set();
  const files = [];

  for (const match of fileMatches) {
    const fileId = match[1];
    const fileName = match[2].trim();
    if (!fileId || seenIds.has(fileId)) {
      continue;
    }

    seenIds.add(fileId);
    files.push({
      fileId,
      fileName,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`
    });
  }

  const folderNameMatch = html.match(/Additional Links[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  const folderName = folderNameMatch ? folderNameMatch[1].trim() : "Google Drive PDFs";

  return { folderName, files };
}

async function fetchPublicDrivePdfFile(fileId) {
  const response = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`, {
    headers: {
      "User-Agent": "WHS-LearningSite/1.0"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Google Drive PDF download failed with status ${response.status}`);
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer());

  if (!fileBuffer.length) {
    throw new Error("Downloaded Google Drive file is empty");
  }

  return {
    fileBuffer,
    mimeType: response.headers.get("content-type") || "application/pdf"
  };
}

module.exports = {
  fetchPublicDriveFolderPdfs,
  fetchPublicDrivePdfFile,
  getGoogleDriveFolderUrl
};
