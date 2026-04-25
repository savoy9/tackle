import { FIXTURES } from './fixtures';
import { assertSnapshot } from './snapshot-helpers';

suite('Visual snapshots (#67)', () => {
  for (const fx of FIXTURES) {
    test(fx.name, () => {
      assertSnapshot(fx.name, fx.html());
    });
  }
});
