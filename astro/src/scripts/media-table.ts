import { compareMediaListings, matchesMediaSearch, type MediaListing, type MediaSort } from "../lib/media-browser.ts";

export function initializeMediaTables(root: ParentNode = document): void {
  for (const section of root.querySelectorAll<HTMLElement>("[data-media-collection]")) {
    const controls = section.querySelector<HTMLElement>("[data-media-controls]");
    const tbody = section.querySelector<HTMLTableSectionElement>("tbody");
    const search = controls?.querySelector<HTMLInputElement>("[data-media-search]");
    const count = controls?.querySelector<HTMLElement>("[data-media-count]");
    const empty = section.querySelector<HTMLElement>("[data-media-no-results]");
    const sortButtons = [...(controls?.querySelectorAll<HTMLButtonElement>("[data-media-sort]") ?? [])];
    if (!controls || !tbody || !search || !count || !empty || sortButtons.length !== 3) continue;
    const rows = [...tbody.querySelectorAll<HTMLTableRowElement>("tr[data-media-row]")];
    if (!rows.length) continue;
    const items = rows.map((row) => ({
      row,
      searchText: row.textContent ?? "",
      listing: {
        title: row.dataset.title ?? "", id: row.dataset.id ?? "",
        year: row.dataset.year ? Number(row.dataset.year) : undefined,
        rating: row.dataset.rating ? Number(row.dataset.rating) : undefined,
      } satisfies MediaListing,
    }));
    let sort: MediaSort = "rating";
    const update = () => {
      const ordered = [...items].sort((a,b) => compareMediaListings(a.listing,b.listing,sort));
      tbody.replaceChildren(...ordered.map(item => item.row));
      let visible = 0;
      for (const item of ordered) {
        item.row.hidden = !matchesMediaSearch(item.searchText,search.value);
        if (!item.row.hidden) visible++;
      }
      count.textContent = `${visible} of ${rows.length} entries`;
      empty.hidden = visible > 0;
      for (const button of sortButtons) {
        button.setAttribute("aria-pressed",String(button.dataset.mediaSort === sort));
      }
    };
    search.addEventListener("input",update);
    for (const button of sortButtons) {
      button.addEventListener("click",() => {
        const chosen = button.dataset.mediaSort;
        if (chosen !== "rating" && chosen !== "title" && chosen !== "year") return;
        sort = chosen;
        update();
      });
    }
    controls.hidden = false;
    update();
  }
}
