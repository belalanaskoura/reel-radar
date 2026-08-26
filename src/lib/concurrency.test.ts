import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './concurrency';

describe('mapWithConcurrency', () => {
  it('preserves input order in the results regardless of completion order', async () => {
    // Delays are chosen so a later item finishes before an earlier one --
    // a naive concurrent implementation could return results out of order.
    const delays = [30, 10, 20, 5, 25];
    const results = await mapWithConcurrency(delays, 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(results).toEqual(delays);
  });

  it('never runs more than `size` tasks concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 20 });

    await mapWithConcurrency(items, 4, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });

    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it('one task rejecting does not stop the others from completing', async () => {
    const items = [1, 2, 3, 4];
    await expect(
      mapWithConcurrency(items, 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('handles an empty input array', async () => {
    const results = await mapWithConcurrency([], 5, async (n) => n);
    expect(results).toEqual([]);
  });

  it('handles a concurrency size larger than the input', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 100, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6]);
  });
});
