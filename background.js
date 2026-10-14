chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "PDF_JPG_DOWNLOAD_DATA_URL") return undefined;

  const filename = typeof message.filename === "string"
    ? message.filename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180)
    : "webpage.jpg";

  chrome.downloads.download({
    url: message.dataUrl,
    filename,
    conflictAction: "uniquify",
    saveAs: false
  }).then((downloadId) => {
    sendResponse({ ok: true, downloadId });
  }).catch((error) => {
    sendResponse({ ok: false, error: error.message || "Download failed." });
  });

  return true;
});
