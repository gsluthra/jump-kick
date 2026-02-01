browser.commands.onCommand.addListener((command) => {
  if (command === "open-tab-switcher") {
    browser.browserAction.openPopup();
  }
});