#!/usr/bin/env node
/**
 * Integration Tests
 *
 * Usage:
 *   node test.js
 *
 * Requires: geckodriver, selenium-webdriver, selenium-webext-bridge
 */

const path = require('path');
const {
  launchBrowser, cleanupBrowser, createTestServer,
  sleep, TestResults
} = require('selenium-webext-bridge');

const EXT_DIR = path.join(__dirname, 'extension');
const EXT_ID = 'jump-kick@addon';

const IS_MAC = process.platform === 'darwin';
const EXPECTED_SHORTCUT_FRAGMENT = IS_MAC ? 'Command+Shift+Space' : 'Ctrl+Shift+Space';

async function getSelectedIndex(driver) {
  return driver.executeScript(() => {
    const items = document.querySelectorAll('#results li');
    for (let i = 0; i < items.length; i++) {
      if (items[i].classList.contains('selected')) return i;
    }
    return -1;
  });
}

async function pressKey(driver, key) {
  await driver.executeScript((k) => {
    const input = document.getElementById('search');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  }, key);
}

async function setSearchQuery(driver, query) {
  await driver.executeScript((q) => {
    const input = document.getElementById('search');
    input.value = q;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, query);
  await sleep(200);
}

async function isSelectedVisible(driver) {
  return driver.executeScript(() => {
    const selected = document.querySelector('#results li.selected');
    const container = document.getElementById('results');
    if (!selected || !container) return false;

    const itemRect = selected.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    return (
      itemRect.top >= containerRect.top &&
      itemRect.bottom <= containerRect.bottom
    );
  });
}

async function getScrollTop(driver) {
  return driver.executeScript(() => {
    return document.getElementById('results').scrollTop;
  });
}

async function createTestTabs(bridge) {
  const animals = [
    "Alpaca", "Bobcat", "Crocodile", "Dolphin", "Elephant",
    "Falcon", "Giraffe", "Hippo", "Iguana", "Jaguar", "Kuala", "Lemur"
  ];

  for (let i = 0; i < animals.length; i++) {
    const tab = await bridge.createTab(`http://127.0.0.1:8080/${i}`);
    await bridge.waitForTabLoad(tab.id);
    await bridge.executeInTab(tab.id, `document.title = "${animals[i]}"`);
  }
}

async function main() {
  console.log('Integration Tests');

  const results = new TestResults();
  const server = await createTestServer({ port: 8080 });

  let browser;
  let extBaseUrl;

  try {

    console.log('Setting up Firefox');
    browser = await launchBrowser({
      extensions: [EXT_DIR]
    });

    const { driver, testBridge: bridge } = browser;

    try {
      extBaseUrl = await bridge.getExtensionUrl(EXT_ID);

      if (extBaseUrl) results.pass('Get extension URL');
      else results.fail('Get extension URL');

    } catch (e) {
      results.error('Get extension URL', e);
    }

    if (!extBaseUrl) throw new Error('Missing extension base URL');

    const popupUrl = `${extBaseUrl}/popup/popup.html`;
    const optionsUrl = `${extBaseUrl}/options/options.html`;

    console.log('----- Options Page -----');

    await driver.get(optionsUrl);
    await sleep(1500);

    // Options page --
    try {
      const elements = await driver.executeScript(() => ({
        highlightToggle: document.getElementById('highlightToggle') !== null,
        shortcutDisplay: document.getElementById('shortcutDisplay') !== null,
        version: document.getElementById('version') !== null
      }));

      if (elements.highlightToggle && elements.shortcutDisplay && elements.version)
        results.pass('Options page loads correctly');
      else
        results.fail('Options page loads correctly', JSON.stringify(elements));

    } catch (e) {
      results.error('Options page loads correctly', e);
    }

    // Shortcut display --
    try {
      const shortcut = await driver.executeScript(() =>
        document.getElementById('shortcutDisplay').textContent
      );

      if (shortcut.includes(EXPECTED_SHORTCUT_FRAGMENT))
        results.pass(`Shortcut correct: "${EXPECTED_SHORTCUT_FRAGMENT}"`);
      else
        results.fail('Shortcut incorrect', shortcut);

    } catch (e) {
      results.error('Shortcut display', e);
    }

    console.log('----- Popup Page -----');

    await driver.get(popupUrl);
    await sleep(1500);

    // Popup structure --
    try {
      const structure = await driver.executeScript(() => ({
        hasSearch: document.getElementById('search') !== null,
        hasResults: document.getElementById('results') !== null,
        hasShortcutHint: document.getElementById('shortcutHint') !== null,
        hasHeader: document.querySelector('.header') !== null
      }));

      if (structure.hasSearch && structure.hasResults && structure.hasShortcutHint && structure.hasHeader)
        results.pass('Popup loads');
      else
        results.fail('Popup loads', JSON.stringify(structure));

    } catch (e) {
      results.error('Popup loads', e);
    }

    console.log('---- Search Tests -----');

    await bridge.init();
    await createTestTabs(bridge);

    await driver.get(popupUrl);
    await sleep(1500);

    // Check that tabs are listed in popup
    try {
      const count = await driver.executeScript(() =>
        document.getElementById('results').children.length
      );

      if (count >= 10) results.pass(`Popup lists tabs (${count})`);
      else results.fail('Popup lists tabs', count);

    } catch (e) {
      results.error('Popup lists tabs', e);
    }

    console.log('----- Sort Command Tests -----');

    await driver.get(popupUrl);
    await sleep(1500);

    // Typing "sort" shows the sorting command rows (prepended)
    try {
      await setSearchQuery(driver, 'sort');

      const commandTitles = await driver.executeScript(() => {
        const rows = Array.from(document.querySelectorAll('#results li.command .command-row'));
        return rows.map(r => (r.textContent || '').replace(/^⚡\s*/u, '').trim());
      });

      const expected = [
        'Sort tabs by URL',
        'Sort tabs by domain',
        'Sort tabs by title',
        'Sort tabs by last accessed'
      ];

      const firstIsCommand = await driver.executeScript(() => {
        const first = document.querySelector('#results li');
        return !!first && first.classList.contains('command');
      });

      if (!firstIsCommand) {
        results.fail('Sort commands prepended to results', 'First item not a command');
      } else {
        results.pass('Sort commands prepended to results');
      }

      if (commandTitles.length >= expected.length &&
          expected.every((t, i) => commandTitles[i] === t)) {
        results.pass('Typing "sort" shows 4 sorting commands');
      } else {
        results.fail('Typing "sort" shows 4 sorting commands', JSON.stringify({ commandTitles }));
      }

    } catch (e) {
      results.error('Typing "sort" shows sorting commands', e);
    }

    // Short query "s" should not show any commands
    try {
      await setSearchQuery(driver, 's');

      const commandCount = await driver.executeScript(() =>
        document.querySelectorAll('#results li.command').length
      );

      if (commandCount === 0) results.pass('Short query does not show commands');
      else results.fail('Short query does not show commands', commandCount);

    } catch (e) {
      results.error('Short query does not show commands', e);
    }

    console.log('----- Web search fallback -----');

    await driver.get(popupUrl);
    await sleep(1500);

    try {
      await setSearchQuery(driver, 'jumpkick_unlikely_token_xyz_9f3a2c1d');

      const webSearchInfo = await driver.executeScript(() => {
        const li = document.querySelector('#results li.web-search');
        return {
          exists: li !== null,
          text: li ? (li.textContent || '').trim() : ''
        };
      });

      if (webSearchInfo.exists && webSearchInfo.text.includes('Search the web')) {
        results.pass('Web search row when no tab matches');
      } else {
        results.fail('Web search row when no tab matches', JSON.stringify(webSearchInfo));
      }
    } catch (e) {
      results.error('Web search row when no tab matches', e);
    }

    console.log('----- Keyboard Navigation -----');

    await driver.get(popupUrl);
    await sleep(1500);


    // Check that down arrow moves selection down and up arrow moves it back up
    try {

      await pressKey(driver, 'ArrowDown');
      await sleep(200);

      const idx = await getSelectedIndex(driver);

      if (idx === 1) results.pass('Down arrow moves selection');
      else results.fail('Down arrow moves selection', idx);

    } catch (e) {
      results.error('Down arrow navigation', e);
    }

    try {

      await pressKey(driver, 'ArrowUp');
      await sleep(200);

      const idx = await getSelectedIndex(driver);

      if (idx === 0) results.pass('Up arrow moves selection');
      else results.fail('Up arrow moves selection', idx);

    } catch (e) {
      results.error('Up arrow navigation', e);
    }

    try {

      for (let i = 0; i < 12; i++) {
        await pressKey(driver, 'ArrowDown');
        await sleep(100);
      }

      const idx = await getSelectedIndex(driver);

      if (idx >= 10) results.pass('Arrow navigation beyond viewport');
      else results.fail('Arrow navigation beyond viewport', idx);

    } catch (e) {
      results.error('Arrow navigation beyond viewport', e);
    }

    //Check that selection remains visible (scrolls if needed) when navigating with arrow keys
    try {

      const visible = await isSelectedVisible(driver);

      if (visible)
        results.pass('Selected item visible after scroll');
      else
        results.fail('Selected item visible after scroll');

    } catch (e) {
      results.error('Selected item visible after scroll', e);
    }

  } catch (e) {
    results.error('Test Suite', e);

  } finally {
    await cleanupBrowser(browser);
    server.close();
  }

  console.log('');
  results.summary();
  process.exit(results.exitCode());
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
