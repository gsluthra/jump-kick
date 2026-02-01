const toggle = document.getElementById("highlightToggle");

// Load setting
async function loadSettings() {
  const stored = await browser.storage.local.get("highlightEnabled");
  toggle.checked = stored.highlightEnabled || false;
}

// Save setting
toggle.addEventListener("change", async () => {
  await browser.storage.local.set({ highlightEnabled: toggle.checked });
});

loadSettings();

// Show extension version
const versionEl = document.getElementById("version");
if (versionEl) {
  const manifest = browser.runtime.getManifest();
  versionEl.textContent = manifest.version;
}