// jsdom doesn't implement ResizeObserver, which Radix UI's size-tracking
// hooks (e.g. Checkbox) call during layout effects. No-op stub is enough
// since these tests don't assert on resize behavior.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
