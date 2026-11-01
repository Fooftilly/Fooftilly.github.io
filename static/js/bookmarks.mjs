const PAGE_SIZE = 50;

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function filterBookmarks(records, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...records];
  return records.filter((record) => {
    const haystack = normalize([record.title, record.category, record.url].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

export function sortBookmarks(records, order = "newest") {
  const sorted = [...records];
  if (order === "title") {
    return sorted.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
  }
  if (order === "oldest") {
    return sorted.sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
  }
  return sorted.sort((a, b) =>
    b.date.localeCompare(a.date) ||
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );
}

function initializeBookmarks() {
  const list = document.getElementById("bookmark-list");
  const search = document.getElementById("bookmark-search");
  const sort = document.getElementById("bookmark-sort");
  const count = document.getElementById("bookmark-count");
  const clear = document.getElementById("bookmark-clear");
  const more = document.getElementById("bookmark-more");
  const empty = document.getElementById("bookmark-empty");
  if (!list || !search || !sort || !count || !clear || !more || !empty) return;

  const records = Array.from(list.querySelectorAll(".bookmark-item")).map((element) => ({
    element,
    title: element.dataset.title ?? "",
    category: element.dataset.category ?? "",
    url: element.dataset.url ?? "",
    date: element.dataset.date ?? "",
  }));

  const params = new URLSearchParams(window.location.search);
  search.value = params.get("q") ?? "";
  const requestedSort = params.get("sort");
  if (requestedSort === "title" || requestedSort === "oldest") {
    sort.value = requestedSort;
  }

  let visibleLimit = PAGE_SIZE;

  function render(updateUrl = false) {
    const matches = sortBookmarks(filterBookmarks(records, search.value), sort.value);
    const fragment = document.createDocumentFragment();

    for (const record of records) record.element.hidden = true;
    for (const [index, record] of matches.entries()) {
      record.element.hidden = index >= visibleLimit;
      fragment.append(record.element);
    }
    list.prepend(fragment);

    const shown = Math.min(visibleLimit, matches.length);
    count.textContent = `${shown} of ${matches.length} bookmarks shown`;
    empty.hidden = matches.length !== 0;
    more.hidden = matches.length <= visibleLimit;
    clear.hidden = search.value.length === 0;

    if (updateUrl) {
      const url = new URL(window.location.href);
      if (search.value.trim()) url.searchParams.set("q", search.value.trim());
      else url.searchParams.delete("q");
      if (sort.value !== "newest") url.searchParams.set("sort", sort.value);
      else url.searchParams.delete("sort");
      window.history.replaceState(null, "", url);
    }
  }

  search.addEventListener("input", () => {
    visibleLimit = PAGE_SIZE;
    render(true);
  });
  sort.addEventListener("change", () => {
    visibleLimit = PAGE_SIZE;
    render(true);
  });
  clear.addEventListener("click", () => {
    search.value = "";
    visibleLimit = PAGE_SIZE;
    render(true);
    search.focus();
  });
  more.addEventListener("click", () => {
    visibleLimit += PAGE_SIZE;
    render();
  });
  render();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeBookmarks);
  } else {
    initializeBookmarks();
  }
}
