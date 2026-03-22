import "@testing-library/jest-dom";

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
