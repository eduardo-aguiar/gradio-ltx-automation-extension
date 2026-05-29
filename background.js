// Store desired filenames for downloads
const desiredFilenames = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "GRADIO_LTX_DOWNLOAD") return;

  const { url, filename } = message.payload || {};

  if (!url) {
    sendResponse({ ok: false, error: "Missing download URL" });
    return true;
  }

  if (!filename) {
    sendResponse({
      ok: false,
      error:
        "Missing filename from content.js. The download was blocked to avoid random Gradio naming.",
    });
    return true;
  }

  // Store the desired filename by URL for the download listener
  desiredFilenames.set(url, filename);

  // Use filename parameter to help identify this download
  chrome.downloads.download(
    {
      url,
      saveAs: false,
      conflictAction: "uniquify",
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        desiredFilenames.delete(url);
        return;
      }

      sendResponse({ ok: true, downloadId, filename });
    },
  );

  return true;
});

// Intercept the download filename before it's applied
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const desiredFilename = desiredFilenames.get(item.url);

  if (desiredFilename) {
    desiredFilenames.delete(item.url);
    // Use our custom filename and clear the temp name
    suggest({ filename: desiredFilename, conflictAction: "uniquify" });
  } else {
    suggest({});
  }
});
