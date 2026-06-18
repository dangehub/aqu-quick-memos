import { describe, expect, it } from 'vitest';
import { FakeVault } from '../src/test/fakeVault';

describe('FakeVault', () => {
  it('creates, reads, modifies, and lists markdown files', async () => {
    const vault = new FakeVault({ 'Daily Notes/2026-06-18.md': 'hello' });
    expect(await vault.read('Daily Notes/2026-06-18.md')).toBe('hello');

    await vault.modify('Daily Notes/2026-06-18.md', 'updated');
    expect(await vault.read('Daily Notes/2026-06-18.md')).toBe('updated');

    await vault.create('Daily Notes/2026-06-19.md', 'new');
    expect(vault.exists('Daily Notes/2026-06-19.md')).toBe(true);
    expect(vault.listMarkdownFiles()).toEqual(['Daily Notes/2026-06-18.md', 'Daily Notes/2026-06-19.md']);
  });
});
