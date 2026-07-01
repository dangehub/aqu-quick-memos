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
  attachmentFolderMode: 'sameFolder' as const,
  linkStyle: 'wiki' as const,
  linkPathFormat: 'absolute' as const,
  openOnStartup: true,
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
      attachmentFolderMode: 'obsidianDefault',
      attachmentSubFolder: 'assets',
      customAttachmentFolder: '',
      linkStyle: 'obsidianDefault',
      linkPathFormat: 'obsidianDefault',
      openOnStartup: false,
      insertMode: 'heading',
      parseMode: 'heading',
    });
  });

  it('merges saved settings over defaults', () => {
    const result = normalizeSettings(saved);
    expect(result.userName).toBe('Ada');
    expect(result.sortDirection).toBe('asc');
    expect(result.attachmentFolderMode).toBe('sameFolder'); // from saved data
    expect(result.linkStyle).toBe('wiki');
    expect(result.linkPathFormat).toBe('absolute');
    expect(result.openOnStartup).toBe(true);
  });

  it('repairs invalid enum values', () => {
    const normalized = normalizeSettings({ sortDirection: 'newest' });
    expect(normalized.sortDirection).toBe('desc');
  });
});
