import { describe, it, expect } from 'vitest';
import { withPdfSlot } from '../src/services/pdf.js';

// #14: concurrent PDF renders are capped so a burst can't open unbounded Chromium pages
describe('withPdfSlot', () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));

  it('never runs more than `limit` tasks at once, and runs them all', async () => {
    let running = 0;
    let peak = 0;
    const order: number[] = [];

    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        withPdfSlot(async () => {
          running++;
          peak = Math.max(peak, running);
          await tick();
          order.push(i);
          running--;
          return i * 10;
        }, 2),
      ),
    );

    expect(peak).toBe(2);
    expect(results).toEqual([0, 10, 20, 30, 40]);
    expect(order).toHaveLength(5);
  });

  it('releases the slot when a task throws, so queued tasks still run', async () => {
    const failing = withPdfSlot(async () => {
      await tick();
      throw new Error('chromium crashed');
    }, 1);
    const queued = withPdfSlot(async () => 'ran', 1);

    await expect(failing).rejects.toThrow('chromium crashed');
    await expect(queued).resolves.toBe('ran');
  });
});
