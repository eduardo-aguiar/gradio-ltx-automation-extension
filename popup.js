async function sendToActiveTab(type, payload = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found");
  return chrome.tabs.sendMessage(tab.id, { type, payload });
}

const status = document.getElementById("status");

document.getElementById("openPanel").addEventListener("click", async () => {
  try {
    await sendToActiveTab("GRADIO_LTX_OPEN_PANEL");
    status.textContent = "Panel opened on the page.";
  } catch (error) {
    status.textContent = "Could not open panel. Refresh the Gradio tab and try again.";
  }
});

document.getElementById("saveExample").addEventListener("click", async () => {
  try {
    await sendToActiveTab("GRADIO_LTX_LOAD_EXAMPLE");
    status.textContent = "Example loaded.";
  } catch (error) {
    status.textContent = "Could not load example. Refresh the Gradio tab and try again.";
  }
});
