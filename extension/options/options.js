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

//To see the current shortcut for opening the tab switcher
async function loadShortcut() {
  const commands = await browser.commands.getAll();
  const cmd = commands.find(c => c.name === "open-tab-switcher");

  const display = document.getElementById("shortcutDisplay");
  if (!display) return;

  display.textContent = cmd && cmd.shortcut
    ? cmd.shortcut
    : "Not set!";
}

loadShortcut();