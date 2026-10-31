import { describe, it } from 'node:test';

// Enough IPC output to exceed a single reporter buffer. This is only invoked
// by runner.test.ts; it is not part of the normal *.test.ts discovery pattern.
for (let suite = 0; suite < 80; suite++) {
  describe(`suite ${suite}`, () => {
    for (let item = 0; item < 20; item++) {
      it(`item ${item}`, () => {});
    }
  });
}
