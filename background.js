browser.commands.onCommand.addListener((command) => {
  if (command === "open-tab-switcher") {
    browser.browserAction.openPopup();
  }
});

async function updateTooltip() {
  try {
    const commands = await browser.commands.getAll();
    const cmd = commands.find(c => c.name === "open-tab-switcher");

    const shortcut = cmd && cmd.shortcut ? cmd.shortcut : "a shortcut";
    const title = `jump-kick with [${shortcut}] to quickly search tabs`;

    browser.browserAction.setTitle({ title });
  } catch (e) {
    console.error("Failed to set tooltip", e);
  }
}

// Run on startup
updateTooltip();

// Also update if extension is reloaded or browser restarts
browser.runtime.onInstalled.addListener(updateTooltip);
browser.runtime.onStartup.addListener(updateTooltip);