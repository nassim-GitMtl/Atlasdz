import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};

const storedValues = new Map();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storedValues.clear(),
    getItem: (key) => (storedValues.has(key) ? storedValues.get(key) : null),
    key: (index) => [...storedValues.keys()][index] ?? null,
    removeItem: (key) => storedValues.delete(key),
    setItem: (key, value) => storedValues.set(key, String(value)),
    get length() {
      return storedValues.size;
    },
  },
});
