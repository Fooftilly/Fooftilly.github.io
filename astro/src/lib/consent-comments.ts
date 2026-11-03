/** Load third-party comments only after a deliberate visitor click.
 * This code neither loads Giscus automatically nor saves the visitor's choice.
 */
export const GISSCUS_URL = "https://giscus.app/client.js";

export function mountConsentComments(root: ParentNode = document): void {
  for (const section of root.querySelectorAll<HTMLElement>("[data-comments-consent]")) {
    const button = section.querySelector<HTMLButtonElement>("[data-load-comments]");
    const container = section.querySelector<HTMLElement>("[data-comments-container]");
    if (!button || !container) continue;
    button.addEventListener("click", () => {
      if (container.querySelector('script[data-giscus-opt-in]')) return;
      const script = document.createElement("script");
      script.src = GISSCUS_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.giscusOptIn = "true";
      script.setAttribute("data-repo", "Fooftilly/Fooftilly.github.io");
      script.setAttribute("data-repo-id", "MDEwOlJlcG9zaXRvcnkyMTk4Mjg5MTg=");
      script.setAttribute("data-category", "Articles");
      script.setAttribute("data-category-id", "DIC_kwDODRpSts4CUEyN");
      script.setAttribute("data-mapping", "title");
      script.setAttribute("data-strict", "0");
      script.setAttribute("data-reactions-enabled", "1");
      script.setAttribute("data-emit-metadata", "0");
      script.setAttribute("data-input-position", "top");
      script.setAttribute("data-theme", "preferred_color_scheme");
      script.setAttribute("data-lang", "en");
      button.setAttribute("aria-expanded", "true");
      button.hidden = true;
      container.appendChild(script);
    }, { once: true });
  }
}
