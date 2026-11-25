import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';

// jsdom doesn't implement object URLs.
let objectUrlCount = 0;
URL.createObjectURL = () => {
  objectUrlCount += 1;
  return `blob:test/${objectUrlCount}`;
};
URL.revokeObjectURL = () => undefined;

// Nor pointer capture.
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.hasPointerCapture = () => false;

afterEach(() => {
  cleanup();
});
