import { describe, expect, it } from 'vitest';
import { EventScheduler } from './scheduler';

describe('integer millisecond event scheduler', () => {
  it('orders by time, priority and stable insertion order', () => {
    const scheduler = new EventScheduler();
    const log: string[] = [];
    scheduler.schedule(20, () => log.push('late'));
    scheduler.schedule(10, () => log.push('hit-a'));
    scheduler.schedule(10, () => log.push('expiry'), -1);
    scheduler.schedule(10, () => log.push('hit-b'));
    expect(scheduler.runUntil(10)).toBe(3);
    expect(log).toEqual(['expiry', 'hit-a', 'hit-b']);
    expect(scheduler.pending).toBe(1);
    scheduler.runUntil(20);
    expect(log.at(-1)).toBe('late');
  });
  it('handles events inserted by callbacks and rejects time travel', () => {
    const scheduler = new EventScheduler();
    const log: number[] = [];
    scheduler.schedule(5, () => {
      log.push(scheduler.timeMs);
      scheduler.schedule(5, () => log.push(scheduler.timeMs));
      expect(() => scheduler.schedule(4, () => {})).toThrow();
    });
    scheduler.runUntil(10);
    expect(log).toEqual([5, 5]);
    expect(() => scheduler.runUntil(9)).toThrow();
    expect(() => scheduler.schedule(10.5, () => {})).toThrow();
  });
  it('limits runaway chains and releases its running guard after failure', () => {
    const scheduler = new EventScheduler();
    const repeat = () => scheduler.schedule(0, repeat);
    repeat();
    expect(() => scheduler.runUntil(0, 5)).toThrow('Event budget exceeded');
    expect(() => scheduler.runUntil(0, 1)).toThrow('Event budget exceeded');
  });
  it('isolates simulations and forbids recursive execution', () => {
    const a = new EventScheduler();
    const b = new EventScheduler();
    a.schedule(0, () => expect(() => a.runUntil(0)).toThrow('recursively'));
    a.runUntil(5);
    expect(b.timeMs).toBe(0);
    expect(b.pending).toBe(0);
  });
  it('matches a sorted reference for a larger mixed queue', () => {
    const scheduler = new EventScheduler();
    const events = Array.from({ length: 1000 }, (_, i) => ({ i, time: (i * 37) % 101, priority: i % 3 }));
    const actual: number[] = [];
    for (const event of events) scheduler.schedule(event.time, () => actual.push(event.i), event.priority);
    scheduler.runUntil(100);
    expect(actual).toEqual([...events].sort((a, b) => a.time - b.time || a.priority - b.priority || a.i - b.i).map(e => e.i));
  });
});
