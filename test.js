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
  sleep, waitForCondition, TestResults
} = require('selenium-webext-bridge');

const EXT_DIR = path.join(__dirname);
const EXT_ID = 'jump-kick@addon';

// Determine which keyboard shortcut to use.
const IS_MAC = process.platform === 'darwin';
const EXPECTED_SHORTCUT_FRAGMENT = IS_MAC ? 'Command+Shift+Space' : 'Ctrl+Shift+Space';

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

      if (extBaseUrl) {
        results.pass('Get extension URL');
      } else {
        results.fail('Get extension URL');
      }
    } catch (e) {
      results.error('Get extension URL', e);
    }

    if (!extBaseUrl) {
      throw new Error('Cannot continue: Missing extension base URL');
    }

    const popupUrl = `${extBaseUrl}/popup.html`;
    const optionsUrl = `${extBaseUrl}/options.html`;

    console.log('----- Options Page -----');

    await driver.get(optionsUrl);
    await sleep(1500);

    // Options page loads, contains expected elements.
    try {
      const elements = await driver.executeScript(() => {
        return {
          highlightToggle: document.getElementById('highlightToggle') !== null,
          shortcutDisplay: document.getElementById('shortcutDisplay') !== null,
          version: document.getElementById('version') !== null
        };
      });

      if (elements.highlightToggle && elements.shortcutDisplay && elements.version) {
        results.pass('Options page loads correctly');
      } else {
        results.fail('Options page loads correctly', JSON.stringify(elements));
      }
    } catch (e) {
      results.error('Options page loads correctly', e);
    }

    // Displays correct keyboard shortcut.
    try {
      const shortcut = await driver.executeScript(() => {
        return document.getElementById('shortcutDisplay').textContent;
      });

      if (shortcut.includes(EXPECTED_SHORTCUT_FRAGMENT)) {
        results.pass(`Shortcut correct: "${EXPECTED_SHORTCUT_FRAGMENT}"`);
      } else {
        results.fail(`Shortcut "${EXPECTED_SHORTCUT_FRAGMENT}"`,
          `incorrect: "${shortcut}"`);
      }
    } catch (e) {
      results.error(`Shortcut displayed as "${EXPECTED_SHORTCUT_FRAGMENT}"`, e); 
    }

    // Highlight toggle is saved.
    try {
      await driver.executeScript(() => {
        const toggle = document.getElementById('highlightToggle');
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
      });
      await sleep(500);

      const stored = await driver.executeScript(async () => {
        const data = await browser.storage.local.get('highlightEnabled');
        return data.highlightEnabled;
      });

      // Verify.
      if (stored === true) {
        results.pass('Highlight toggle is saved.');
      } else {
        results.fail('Highlight toggle is saved.', `stored: ${stored}`);
      }

      // Reset.
      await driver.executeScript(async () => {
        await browser.storage.local.set({ highlightEnabled: false });
      });
    } catch (e) {
      results.error('Highlight toggle is saved.', e);
    }

    console.log('----- Popup Page -----');

    await driver.get(popupUrl);
    await sleep(1500);

    // Popup loads correctly.
    try {
      const structure = await driver.executeScript(() => {
        return {
          hasSearch: document.getElementById('search') !== null,
          hasResults: document.getElementById('results') !== null,
          hasShortcutHint: document.getElementById('shortcutHint') !== null,
          hasHeader: document.querySelector('.header') !== null
        };
      });

      if (structure.hasSearch && structure.hasResults && structure.hasShortcutHint && structure.hasHeader) {
        results.pass('Popup loads');
      } else {
        results.fail('Popup loads', JSON.stringify(structure));
      }
    } catch (e) {
      results.error('Popup loads', e);
    }

    // Popup lists all open tabs.
    try {
      const resultCount = await driver.executeScript(() => {
        return document.getElementById('results').children.length;
      });

      // Should list at least 1 tab (the bridge tab)
      if (resultCount >= 1) {
        results.pass('Popup lists all open tabs');
      } else {
        results.fail('Popup lists all open tabs', `found ${resultCount} results`);
      }
    } catch (e) {
      results.error('Popup lists all open tabs', e);
    }

    // First result pre-selected.
    try {
      const firstSelected = await driver.executeScript(() => {
        const first = document.querySelector('#results li');
        return first ? first.classList.contains('selected') : false;
      });

      if (firstSelected) {
        results.pass('First result pre-selected');
      } else {
        results.fail('First result pre-selected');
      }
    } catch (e) {
      results.error('First result pre-selected', e);
    }

    console.log('---- Search Tests -----');

    // Re-init bridge.
    await bridge.init();

    // Create tabs with hard-coded titles.
    const tabAlpha = await bridge.createTab('http://127.0.0.1:8080/a-page');
    await bridge.waitForTabLoad(tabAlpha.id);
    await bridge.executeInTab(tabAlpha.id, 'document.title = "Alpaca"');

    const tabBeta = await bridge.createTab('http://127.0.0.1:8080/b-page');
    await bridge.waitForTabLoad(tabBeta.id);
    await bridge.executeInTab(tabBeta.id, 'document.title = "Bobcat"');

    const tabGamma = await bridge.createTab('http://127.0.0.1:8080/c-page');
    await bridge.waitForTabLoad(tabGamma.id);
    await bridge.executeInTab(tabGamma.id, 'document.title = "Crocodile"');

    await driver.get(popupUrl);
    await sleep(1500);

    // Popup should list all tabs.
    try {
      const resultCount = await driver.executeScript(() => {
        return document.getElementById('results').children.length;
      });

      // 1 bridge tab + 3 new tabs = 4 tabs
      if (resultCount >= 4) {
        results.pass(`Popup lists all tabs (${resultCount} tabs)`);
      } else {
        results.fail(`Popup lists all tabs`, `expected >= 4, got ${resultCount}`);
      }
    } catch (e) {
      results.error('Popup lists all tabs', e);
    }

    // Title search results.
    try {
      await driver.executeScript(() => {
        const input = document.getElementById('search');
        input.value = 'alpaca';
        input.dispatchEvent(new Event('input'));
      });
      await sleep(500);

      const filtered = await driver.executeScript(() => {
        const items = document.querySelectorAll('#results li');
        return {
          count: items.length,
          firstTitle: items[0] ? items[0].textContent : ''
        };
      });

      if (filtered.count >= 1 && filtered.firstTitle.includes('Alpaca')) {
        results.pass('Search "alpaca" find Alpaca tab');
      } else {
        results.fail('Search "alpaca" find Alpaca tab', JSON.stringify(filtered));
      }
    } catch (e) {
      results.error('Search "alpaca" find Alpaca tab', e);
    }

    // URL search results
    try {
      await driver.executeScript(() => {
        const input = document.getElementById('search');
        input.value = 'b-page';
        input.dispatchEvent(new Event('input'));
      });
      await sleep(500);

      const filtered = await driver.executeScript(() => {
        const items = document.querySelectorAll('#results li');
        return {
          count: items.length,
          firstTitle: items[0] ? items[0].textContent : ''
        };
      });

      if (filtered.count >= 1 && filtered.firstTitle.includes('Bobcat')) {
        results.pass('Search "b-page" by URL');
      } else {
        results.fail('Search "b-page" by URL', JSON.stringify(filtered));
      }
    } catch (e) {
      results.error('Search "b-page" by URL', e);
    }

    // Inexact match ("crocadyle" -> "Crocodile")
    try {
      await driver.executeScript(() => {
        const input = document.getElementById('search');
        input.value = 'crocadyle';
        input.dispatchEvent(new Event('input'));
      });
      await sleep(500);

      const filtered = await driver.executeScript(() => {
        const items = document.querySelectorAll('#results li');
        return {
          count: items.length,
          firstTitle: items[0] ? items[0].textContent : ''
        };
      });

      if (filtered.count >= 1 && filtered.firstTitle.includes('Crocodile')) {
        results.pass('Inexact match: "crocadyle" matches "Crocodile"');
      } else {
        results.fail('Inexact match: "crocadyle" matches "Crocodile"', JSON.stringify(filtered));
      }
    } catch (e) {
      results.error('Inexact match: "crocadyle" matches "Crocodile"', e);
    }

    // All tabs restored when clearing search.
    try {
      await driver.executeScript(() => {
        const input = document.getElementById('search');
        input.value = '';
        input.dispatchEvent(new Event('input'));
      });
      await sleep(500);

      const resultCount = await driver.executeScript(() => {
        return document.getElementById('results').children.length;
      });

      if (resultCount >= 4) {
        results.pass('All tabs restored when clearing search');
      } else {
        results.fail('All tabs restored when clearing search', `got ${resultCount} results`);
      }
    } catch (e) {
      results.error('All tabs restored when clearing search', e);
    }

    // Query should have no results.
    try {
      await driver.executeScript(() => {
        const input = document.getElementById('search');
        input.value = 'abcdefg';
        input.dispatchEvent(new Event('input'));
      });
      await sleep(500);

      const resultCount = await driver.executeScript(() => {
        return document.getElementById('results').children.length;
      });

      if (resultCount === 0) {
        results.pass('Query should have no results');
      } else { 
        results.fail('Query should have no results', `got ${resultCount} results`);
      }
    } catch (e) {
      results.error('Query should have no results', e);
    }

    console.log('----- Keyboard Navigation -----');

    // Reload popup, all tabs should be visible.
    await driver.get(popupUrl);
    await sleep(1500);

    // Down arrow.
    try {
      await driver.executeScript(() => {
        const input = document.getElementById('search');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      });
      await sleep(300);

      const selectedIndex = await driver.executeScript(() => {
        const items = document.querySelectorAll('#results li');
        for (let i = 0; i < items.length; i++) {
          if (items[i].classList.contains('selected')) return i;
        }
        return -1;
      });

      if (selectedIndex === 1) {
        results.pass('Down arrow moves selection to second item');
      } else {
        results.fail('Down arrow moves selection to second item', `selected index: ${selectedIndex}`);
      }
    } catch (e) {
      results.error('Down arrow moves selection to second item', e);
    }

    // Up arrow.
    try {
      await driver.executeScript(() => {
        const input = document.getElementById('search');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      });
      await sleep(300);

      const selectedIndex = await driver.executeScript(() => {
        const items = document.querySelectorAll('#results li');
        for (let i = 0; i < items.length; i++) {
          if (items[i].classList.contains('selected')) return i;
        }
        return -1;
      });

      if (selectedIndex === 0) {
        results.pass('Up arrow moves selection back up to first item');
      } else {
        results.fail('Up arrow moves selection back up to first item', `selected index: ${selectedIndex}`);
      }
    } catch (e) {
      results.error('Up arrow moves selection back up to first item', e);
    }
  } catch (e) {
    results.error('Test Suite', e);
  } finally {
    await cleanupBrowser(browser);
    server.close();
  }

  console.log('');
  const allPassed = results.summary();
  process.exit(results.exitCode());
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
