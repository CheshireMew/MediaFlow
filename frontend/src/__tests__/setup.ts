import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { initI18nWithNamespaces } from "../i18n";
import { resetUiStateSettingsForTests } from "../services/persistence/uiStateSettings";

await initI18nWithNamespaces("zh", ["common"]);

// jsdom opaque-origin guard: localStorage/sessionStorage require a valid URL origin.
// In vitest's vmThreads pool the jsdom instance starts with about:blank which makes
// storage APIs throw SecurityError.  Patching window.location to http://localhost
// before any test code runs resolves this.
if (typeof window !== "undefined" && window.location.origin === "null") {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: new URL("http://localhost/"),
  });
}

if (typeof ResizeObserver === "undefined") {
  class TestResizeObserver implements ResizeObserver {
    private readonly observed = new Set<Element>();
    private readonly callback: ResizeObserverCallback;
    private readonly onResize = () => {
      const entries = [...this.observed].map((target) => ({
        target,
        contentRect: target.getBoundingClientRect(),
      })) as ResizeObserverEntry[];
      if (entries.length > 0) this.callback(entries, this);
    };

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      window.addEventListener("resize", this.onResize);
    }

    disconnect() {
      this.observed.clear();
      window.removeEventListener("resize", this.onResize);
    }

    observe(target: Element) {
      this.observed.add(target);
    }

    unobserve(target: Element) {
      this.observed.delete(target);
    }
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });
}

beforeEach(() => {
  resetUiStateSettingsForTests();
});
