import { describe, expect, it } from 'vitest';
import { DailyNoteResolver } from '../src/daily-notes/DailyNoteResolver';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import { FakeVault } from '../src/test/fakeVault';

/** Settings using the plugin's own path config. */
const OWN = { ...DEFAULT_SETTINGS, fallbackDailyNotesFolder: '每日工作', fallbackDateFormat: 'YYYY/MM/YYYY-MM-DD' };
/** Settings that defer to the Daily Notes config / flat fallback. */
const DEFER = { ...DEFAULT_SETTINGS, overrideDailyNotesConfig: false, fallbackDailyNotesFolder: 'Daily Notes', fallbackDateFormat: 'YYYY-MM-DD' };

describe('DailyNoteResolver', () => {
  it('uses the plugin folder/format without a suffix when override is enabled', async () => {
    const vault = new FakeVault();
    const resolver = new DailyNoteResolver(vault, undefined, OWN);
    const result = await resolver.resolve('2026-06-19');
    expect(result).toEqual({ date: '2026-06-19', filePath: '每日工作/2026/06/2026-06-19.md', source: 'fallback' });
  });

  it('ignores the Daily Notes config when override is enabled', async () => {
    const vault = new FakeVault();
    const resolver = new DailyNoteResolver(vault, { folder: 'Journal', format: 'YYYY/MM/DD' }, OWN);
    const result = await resolver.resolve('2026-06-19');
    expect(result.filePath).toBe('每日工作/2026/06/2026-06-19.md');
  });

  it('uses the Daily Notes config when override is disabled', async () => {
    const vault = new FakeVault();
    const resolver = new DailyNoteResolver(vault, { folder: 'Journal', format: 'YYYY/MM/DD' }, DEFER);
    const result = await resolver.resolve('2026-06-18');
    expect(result).toEqual({ date: '2026-06-18', filePath: 'Journal/2026/06/18.md', source: 'daily-notes' });
  });

  it('falls back to flat folder/format when override is disabled and config is absent', async () => {
    const vault = new FakeVault();
    const resolver = new DailyNoteResolver(vault, undefined, DEFER);
    const result = await resolver.resolve('2026-06-18');
    expect(result).toEqual({ date: '2026-06-18', filePath: 'Daily Notes/2026-06-18.md', source: 'fallback' });
  });

  it('creates missing files and appends the configured heading', async () => {
    const vault = new FakeVault();
    const resolver = new DailyNoteResolver(vault, undefined, OWN);
    const path = await resolver.ensureDailyNote('2026-06-18');
    expect(path).toBe('每日工作/2026/06/2026-06-18.md');
    expect(await vault.read(path)).toBe('\n### memos\n');
  });

  it('adds configured heading to existing files without one', async () => {
    const vault = new FakeVault({ '每日工作/2026/06/2026-06-18.md': '# 2026-06-18\nBody\n' });
    const resolver = new DailyNoteResolver(vault, undefined, OWN);
    await resolver.ensureDailyNote('2026-06-18');
    expect(await vault.read('每日工作/2026/06/2026-06-18.md')).toBe('# 2026-06-18\nBody\n\n### memos\n');
  });

  it('uses a custom formatter so year/month subfolders match the Daily Notes config', async () => {
    const vault = new FakeVault();
    const momentLike = (date: string, format: string): string => {
      const [year, month, day] = date.split('-');
      return format.replace(/YYYY/gu, year).replace(/MM/gu, month).replace(/DD/gu, day);
    };
    const resolver = new DailyNoteResolver(
      vault,
      { folder: '日志', format: 'YYYY/MM/DD' },
      DEFER,
      momentLike,
    );
    const result = await resolver.resolve('2026-06-19');
    expect(result.filePath).toBe('日志/2026/06/19.md');
    expect(result.source).toBe('daily-notes');
  });

  it('resolves to a plain .md diary file (no more -quick-memos suffix)', async () => {
    const vault = new FakeVault();
    const resolver = new DailyNoteResolver(vault, undefined, OWN);
    const result = await resolver.resolve('2026-06-19');
    expect(result.filePath).toContain('2026-06-19.md');
    expect(result.filePath).not.toContain('-quick-memos');
  });
});
