//Check for themes and apply dark/light mode
(async function initTheme() {
  try {
    const theme = await browser.theme.getCurrent();
    const bg = theme.colors?.toolbar;

    if (!bg) return;

    const isDark = isColorDark(bg);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
  } catch (e) {
    console.error("Theme detection failed", e);
  }
})();

function isColorDark(color) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = color;
  const rgb = ctx.fillStyle.match(/\d+/g);
  if (!rgb) return false;

  const [r, g, b] = rgb.map(Number);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

const searchInput = document.getElementById("search");
const resultsList = document.getElementById("results");

let allTabs = [];
let fuse;
let selectedIndex = 0;
let currentResults = [];

const COMMANDS = [
  {
    id: "sort-url",
    title: "Sort tabs by URL",
    keywords: ["sort", "url", "alphabetical"],
    action: sortTabsByURL
  },
  {
    id: "sort-domain",
    title: "Sort tabs by domain",
    keywords: ["sort", "domain"],
    action: sortTabsByDomain
  },
  {
    id: "sort-title",
    title: "Sort tabs by title",
    keywords: ["sort", "title"],
    action: sortTabsByTitle
  },
  {
    id: "sort-recent",
    title: "Sort tabs by last accessed",
    keywords: ["sort", "recent"],
    action: sortTabsByLastAccessed
  }
];

function getCommandResults(query) {

  const q = query.toLowerCase();
  if (!q || q.length < 2) return []; // don’t show sort commands for just “s”

  return COMMANDS.filter(cmd =>
    cmd.title.toLowerCase().includes(q) ||
    cmd.keywords.some(k => k.includes(q))
  );
}

//Sets the shortcut hint in the popup
async function loadShortcutHint() {
  const commands = await browser.commands.getAll();
  const cmd = commands.find(c => c.name === "open-tab-switcher");

  const hint = document.getElementById("shortcutHint");
  if (!hint) return;

  hint.textContent = cmd && cmd.shortcut ? cmd.shortcut : "Set shortcut";
}

loadShortcutHint();

//Force focus on the search input
function forceFocus() {
  searchInput.focus();
  searchInput.select(); // Optional: selects existing text
}

// Focus when popup loads
document.addEventListener("DOMContentLoaded", () => {
  // Small delay ensures popup is fully ready
  setTimeout(forceFocus, 50);
});

// Refocus if popup regains visibility
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    setTimeout(forceFocus, 10);
  }
});

document.addEventListener("click", (e) => {
  if (e.target !== searchInput) {
    forceFocus();
  }
});

function applyTheme(e) {
  document.documentElement.dataset.theme = e.matches ? "dark" : "light";
}

const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
applyTheme(themeQuery);
themeQuery.addEventListener("change", applyTheme);


async function loadTabs() {
  // Load highlight setting  
  const stored = await browser.storage.local.get("highlightEnabled");
  highlightEnabled = stored.highlightEnabled === true

  allTabs = await browser.tabs.query({});

  // Sort by most recently used
  allTabs.sort((a, b) => b.lastAccessed - a.lastAccessed);

  fuse = new Fuse(allTabs, {
    keys: [
      { name: "title", weight: 0.7 },
      { name: "url", weight: 0.3 }
    ],
    threshold: 0.4,
    distance: 200,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true
  });
}

function highlightMatches(text, matches, key) {
  if (!highlightEnabled || !matches) return text;

  const match = matches.find(m => m.key === key);
  if (!match) return text;

  let highlighted = "";
  let lastIndex = 0;

  match.indices.forEach(([start, end]) => {
    highlighted += text.slice(lastIndex, start);
    highlighted += `<mark>${text.slice(start, end + 1)}</mark>`;
    lastIndex = end + 1;
  });

  highlighted += text.slice(lastIndex);
  return highlighted;
}

async function activateResult(result) {
  if (result.type === "command" && typeof result.action === "function") {
    await result.action();
    window.close();
    return;
  }

  if (result.type === "webSearch") {
    try {
      await browser.search.search({ query: result.query });
    } catch (e) {
      console.error("Web search failed", e);
    }
    window.close();
    return;
  }

  const tab = result.item || result;
  activateTab(tab);
}

function renderResults(results) {
  resultsList.innerHTML = "";

  results.forEach((result, index) => {
    const isCommand = result.type === "command";
    const tab = result.item || result;

    const li = document.createElement("li");
    if (result.type === "webSearch") {
      li.classList.add("web-search");
      const row = document.createElement("div");
      row.className = "command-row";
      const q = result.query;
      const display = q.length > 60 ? `${q.slice(0, 60)}…` : q;
      row.textContent = "";
      row.appendChild(document.createTextNode("🔍 Search the web for "));
      const quoted = document.createElement("span");
      quoted.textContent = `"${display}"`;
      row.appendChild(quoted);
      li.appendChild(row);
    } else if (isCommand) {
      li.classList.add("command");
      li.innerHTML = `
        <div class="command-row">⚡ ${result.title}</div>
      `;
    } else {
      const title = highlightMatches(tab.title || tab.url, result.matches || [], "title");
      const url = highlightMatches(tab.url || "", result.matches || [], "url");

      li.innerHTML = `
        <img src="${tab.favIconUrl || ''}" width="16" height="16">
        <div>
          <span>${title}</span>
          <span class="url">${url}</span>
        </div>
      `;
    }

    if (index === selectedIndex) li.classList.add("selected");
    li.addEventListener("click", () => activateResult(result));
    resultsList.appendChild(li);
  });
}

function ensureSelectionVisible() {
    const selected = document.querySelector("#results li.selected");
    if (selected) {
      selected.scrollIntoView({
        block: "nearest",
        behavior: "smooth"
      });
    }
  }

function activateTab(tab) {
  browser.tabs.update(tab.id, { active: true });
  browser.windows.update(tab.windowId, { focused: true });
  window.close();
}

function searchTabs(query) {
  if (!query) return allTabs.map(tab => ({ item: tab, matches: [] }));

  const fuseResults = fuse.search(query);
  const tabResults = fuseResults.map(r => ({
    type: "tab",
    ...r.item
  }));

  const commandResults = getCommandResults(query).map(cmd => ({
    type: "command",
    title: cmd.title,
    action: cmd.action
  }));

  const results = [
    ...commandResults,
    ...tabResults
  ];

  const q = query.trim();
  if (q.length > 0 && tabResults.length === 0) {
    results.push({
      type: "webSearch",
      query: q
    });
  }

  return results;
}

// Methods to sort tabs

async function sortTabsByURL() {
  const tabs = await browser.tabs.query({ currentWindow: true });

  const sorted = [...tabs].sort((a, b) =>
    (a.url || "").localeCompare(b.url || "")
  );

  for (let i = 0; i < sorted.length; i++) {
    await browser.tabs.move(sorted[i].id, { index: i });
  }
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function sortTabsByDomain() {
  const tabs = await browser.tabs.query({ currentWindow: true });

  const sorted = [...tabs].sort((a, b) =>
    getDomain(a.url).localeCompare(getDomain(b.url))
  );

  for (let i = 0; i < sorted.length; i++) {
    await browser.tabs.move(sorted[i].id, { index: i });
  }
}

async function sortTabsByTitle() {
  const tabs = await browser.tabs.query({ currentWindow: true });

  const sorted = [...tabs].sort((a, b) =>
    (a.title || "").localeCompare(b.title || "")
  );

  for (let i = 0; i < sorted.length; i++) {
    await browser.tabs.move(sorted[i].id, { index: i });
  }
}

async function sortTabsByLastAccessed() {
  const tabs = await browser.tabs.query({ currentWindow: true });

  const sorted = [...tabs].sort((a, b) =>
    b.lastAccessed - a.lastAccessed
  );

  for (let i = 0; i < sorted.length; i++) {
    await browser.tabs.move(sorted[i].id, { index: i });
  }
}

// -----------

searchInput.addEventListener("input", () => {
  selectedIndex = 0;
  currentResults = searchTabs(searchInput.value);
  renderResults(currentResults);
  ensureSelectionVisible();
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();

    selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
    renderResults(currentResults);
    ensureSelectionVisible();

  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    
    selectedIndex = Math.max(selectedIndex - 1, 0);
    renderResults(currentResults);
    ensureSelectionVisible();

  } else if (e.key === "Enter" && currentResults.length > 0) {
    e.preventDefault();
    
    activateResult(currentResults[selectedIndex]);
  }
});

loadTabs().then(() => {
  currentResults = allTabs.map(tab => ({ item: tab, matches: [] }));
  renderResults(currentResults);
});