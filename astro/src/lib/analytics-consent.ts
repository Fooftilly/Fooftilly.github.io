/** Google Analytics 4 basic consent mode: never load the Google tag before opt-in. */
export const GA_MEASUREMENT_ID = "G-7XL7CEV7EW"; // Existing public ID from legacy Hugo configuration
export const CONSENT_STORAGE_KEY = "peroniko.analytics.consent.v1";
export const GOOGLE_TAG_URL = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

type ConsentChoice = "granted" | "denied" | null;
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

const denied = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

function readChoice(win: Window): ConsentChoice {
  try {
    const value = win.localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    // An inaccessible storage API must never imply consent.
    return null;
  }
}

function saveChoice(win: Window, choice: Exclude<ConsentChoice, null>): void {
  try {
    win.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // If persistence is blocked, consent lasts for this page only.
  }
}

function setAnalyticsDisabled(win: Window, disabled: boolean): void {
  (win as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = disabled;
}

function analyticsCommand(win: AnalyticsWindow, ...args: unknown[]): void {
  win.dataLayer ??= [];
  win.dataLayer.push(args);
}

function enableAnalytics(doc: Document, win: AnalyticsWindow): void {
  if (doc.querySelector("[data-ga-loader]")) return;
  setAnalyticsDisabled(win, false);
  // Set Consent Mode v2 defaults before the tag is fetched or configured.
  analyticsCommand(win, "consent", "default", denied);
  analyticsCommand(win, "consent", "update", { ...denied, analytics_storage: "granted" });
  analyticsCommand(win, "js", new Date());
  // Do not transmit URL query strings, which may contain the visitor's search.
  const pageUrl = new URL(win.location.href);
  analyticsCommand(win, "config", GA_MEASUREMENT_ID, {
    page_location: pageUrl.origin + pageUrl.pathname,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  win.gtag = (...args: unknown[]) => analyticsCommand(win, ...args);
  const script = doc.createElement("script");
  script.async = true;
  script.src = GOOGLE_TAG_URL;
  script.dataset.gaLoader = "true";
  doc.head.appendChild(script);
}

function expireAnalyticsCookies(doc: Document): void {
  for (const part of doc.cookie.split(";")) {
    const name = part.split("=")[0]?.trim() ?? "";
    if (!/^(_ga(?:_|$)|_gid$|_gat(?:_|$))/.test(name)) continue;
    for (const domain of ["", ";domain=peroniko.xyz", ";domain=.peroniko.xyz", ";domain=www.peroniko.xyz"]) {
      doc.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax;Secure${domain}`;
    }
  }
}

export function initializeAnalyticsConsent(doc: Document = document, win: Window = window): void {
  const panel = doc.querySelector<HTMLElement>("[data-analytics-consent]");
  const settings = doc.querySelector<HTMLButtonElement>("[data-analytics-settings]");
  const allow = panel?.querySelector<HTMLButtonElement>("[data-analytics-allow]");
  const decline = panel?.querySelector<HTMLButtonElement>("[data-analytics-decline]");
  if (!panel || !settings || !allow || !decline) return;

  let choice = readChoice(win);
  const aw = win as AnalyticsWindow;
  const showPanel = (visible: boolean) => {
    panel.hidden = !visible;
    settings.setAttribute("aria-expanded", String(visible));
  };
  showPanel(choice === null);
  if (choice === "granted") enableAnalytics(doc, aw);

  settings.addEventListener("click", () => showPanel(panel.hidden));
  allow.addEventListener("click", () => {
    choice = "granted";
    saveChoice(win, choice);
    showPanel(false);
    enableAnalytics(doc, aw);
  });
  decline.addEventListener("click", () => {
    const wasEnabled = choice === "granted" || Boolean(doc.querySelector("[data-ga-loader]"));
    choice = "denied";
    saveChoice(win, choice);
    showPanel(false);
    setAnalyticsDisabled(win, true);
    if (wasEnabled) {
      // Stop further hits and purge first-party GA cookies; reload unloads the running tag.
      analyticsCommand(aw, "consent", "update", denied);
      expireAnalyticsCookies(doc);
      win.location.reload();
    }
  });
}
