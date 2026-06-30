import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings/settings';

const saved = {
  userName: 'Ada',
  userSlogan: 'Capture ideas fast',
  avatar: 'avatar.png',
  quickMemoHeading: '### memos',
  overrideDailyNotesConfig: false,
  fallbackDailyNotesFolder: 'Journal',
  fallbackDateFormat: 'YYYY/MM/DD',
  enableBlockIds: false,
  sortDirection: 'asc' as const,
};

describe('settings', () => {
  it('provides defaults required by the spec', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      userName: 'Quick Memo',
      userSlogan: 'Capture the moment.',
      avatar: '',
      quickMemoHeading: '### memos',
      overrideDailyNotesConfig: true,
      fallbackDailyNotesFolder: '',
      fallbackDateFormat: 'YYYY-MM-DD',
      enableBlockIds: true,
      sortDirection: 'desc',
    });
  });

  it('merges saved settings over defaults', () => {
    expect(normalizeSettings(saved)).toEqual(saved);
  });

  it('repairs invalid enum values', () => {
    const normalized = normalizeSettings({ sortDirection: 'newest' });
    expect(normalized.sortDirection).toBe('desc');
  });
});
