chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "GRADIO_LTX_DOWNLOAD") return;

  const { url, filename } = message.payload || {};

  if (!url) {
    sendResponse({ ok: false, error: "Missing download URL" });
    return true;
  }

  chrome.downloads.download(
    {
      url,
      filename: filename || "gradio-ltx-output.mp4",
      saveAs: false,
      conflictAction: "uniquify"
    },
    downloadId => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true, downloadId });
    }
  );

  return true;
});
