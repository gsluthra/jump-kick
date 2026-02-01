
const searchInput = document.getElementById("search");
const resultsList = document.getElementById("results");

let allTabs = [];
let fuse;
let selectedIndex = 0;
let currentResults = [];

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

function renderResults(results) {
  resultsList.innerHTML = "";

  results.forEach((result, index) => {
    const tab = result.item || result;
    const matches = result.matches || [];

    const li = document.createElement("li");

    const title = highlightMatches(tab.title || tab.url, matches, "title");
    const url = highlightMatches(tab.url || "", matches, "url");

    li.innerHTML = `
      <img src="${tab.favIconUrl || ''}" width="16" height="16">
      <div>
        <span>${title}</span>
        <span class="url">${url}</span>
      </div>
    `;

    if (index === selectedIndex) li.classList.add("selected");

    li.addEventListener("click", () => activateTab(tab));
    resultsList.appendChild(li);
  });
}

function activateTab(tab) {
  browser.tabs.update(tab.id, { active: true });
  browser.windows.update(tab.windowId, { focused: true });
  window.close();
}

function searchTabs(query) {
  if (!query) return allTabs.map(tab => ({ item: tab, matches: [] }));
  return fuse.search(query);
}

searchInput.addEventListener("input", () => {
  selectedIndex = 0;
  currentResults = searchTabs(searchInput.value);
  renderResults(currentResults);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
    renderResults(currentResults);
  } else if (e.key === "ArrowUp") {
    selectedIndex = Math.max(selectedIndex - 1, 0);
    renderResults(currentResults);
  } else if (e.key === "Enter" && currentResults.length > 0) {
    activateTab(currentResults[selectedIndex].item);
  }
});

loadTabs().then(() => {
  currentResults = allTabs.map(tab => ({ item: tab, matches: [] }));
  renderResults(currentResults);
});