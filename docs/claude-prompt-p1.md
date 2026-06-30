# Task: Quick Memo Plugin Structural Refactoring (Phase 1-3)

You are working on the Obsidian plugin "Quick Memo" at /Users/qudange/Documents/code/aqu-quick-memos.

Read CLAUDE.md for architecture and conventions — it will be auto-loaded.

## Overview

Transform this plugin from "Quick Memo" (standalone tagged quick-memos files with type labels like [闪念][记录][待办]) into a lightweight daily-note-integrated capture tool that reads/writes directly in the user's diary files. No more separate `-quick-memos.md` files. No more type labels. Just plain `- HH:MM content` and `- HH:MM [ ] content` formats.

## Phase 1: Remove -quick-memos suffix + Configurable heading

### 1.1 Remove file suffix

**`src/daily-notes/path.ts`**:
- Delete the `QUICK_MEMO_FILENAME_SUFFIX` constant entirely.
- Rewrite `dateFromPath` to extract YYYY-MM-DD from paths matching the user's diary format. Instead of looking for `-quick-memos.md`, extract the date by matching the filename pattern. The simplest approach: take the last segment of the path, strip `.md`, and try to extract a date from it using a pattern like `(\d{4}-\d{2}-\d{2})`. Return `'1970-01-01'` if no date found.
- Rewrite `isQuickMemoPath` to test whether `dateFromPath(path) !== '1970-01-01'` (no format parameter needed if dateFromPath is self-contained).

**`src/daily-notes/DailyNoteResolver.ts`**:
- In `resolve()`: change the `relative` line from `${this.formatFn(date, format)}${QUICK_MEMO_FILENAME_SUFFIX}.md` to `${this.formatFn(date, format)}.md`.
- Remove the import of `QUICK_MEMO_FILENAME_SUFFIX`.

**`src/vaultEvents.ts`**:
- No change needed — it already delegates to `isQuickMemoPath`.

### 1.2 Configurable heading with # level

The user wants to specify headings like `### memos` (includes the `#` marks). The heading string in settings should be the full heading including hash marks.

**`src/types.ts`** → `QuickMemoSettings`:
- `quickMemoHeading` remains a string. Default changes.
- Add a note in the interface comment that it includes `#` marks.

**`src/settings/settings.ts`**:
- Change DEFAULT_SETTINGS.quickMemoHeading from `'Quick Memo'` to `'### memos'`.

**`src/settings/SettingsTab.ts`**:
- Update the heading setting's name to "Memos 标题" and description to something like "插件只读写这个标题下的记录。支持 # 级别，如 `### memos`、`## 闪念笔记`。"

**`src/constants.ts`**:
- Delete `DEFAULT_QUICK_MEMO_HEADING` if it's no longer used. Check if it's imported anywhere — if not, remove it. If it is still used in settings.ts, remove that import too and use the inline default.

**`src/markdown/QuickMemoParser.ts`**:
- Rewrite `findSection()` to match ANY heading level (not just `##`). The heading string from settings will be like `### memos`. Parse it to extract the level and text:
  - Extract: the full heading string (e.g., `### memos`) → level is the number of `#` characters, text is the rest trimmed
  - Match: use a regex like `new RegExp('^#{' + level + '}\\s+' + escapeRegExp(text) + '\\s*$', 'u')` to find the heading
  - Find the section end: any heading of the SAME level or HIGHER (fewer `#`) ends the section. Use `/^#{1,` + level + `}\s+/u` for end detection.

**`src/markdown/MarkdownRecordRepository.ts`**:
- Update `insertIntoSection()` and `ensureDailyNote()` to work with the parsed heading format. The heading string from settings (e.g., `### memos`) should be inserted as-is.

### 1.3 Update Default Settings and Resolver Config

**`src/settings/settings.ts`**:
- Change `fallbackDailyNotesFolder` default from `'每日工作'` to `''` (empty string — use vault root by default).
- Change `fallbackDateFormat` default from `'YYYY/MM/YYYY-MM-DD'` to `'YYYY-MM-DD'` (simple flat naming).

**`src/daily-notes/DailyNoteResolver.ts`**:
- In `ensureDailyNote()`: when creating a new file, insert the heading as configured in settings (from `this.settings.quickMemoHeading`). Currently it hardcodes `## ${this.settings.quickMemoHeading}`. Change to just `${this.settings.quickMemoHeading}` since the heading now includes `#` marks.
- When checking if heading exists: use the same approach as `findSection()` — extract level and text from settings, build the regex dynamically.

## Phase 2: Rewrite Parser (new memo/todo format)

The old format had type labels like `[闪念]`, `[记录]`, `[待办]`. The new format is simpler:

**Normal memo**: `- 01:16 some content #tag`
**Todo**: `- 16:00 [ ] task content #tag` or `- 16:00 [x] done task`

Multi-line continuation uses 2-space indentation as before.

### 2.1 Simplify types

**`src/types.ts`**:
- Change `QuickMemoType` from `'record' | 'flash' | 'todo'` to `'memo' | 'todo'`.
- Update `RecordDraft` and `QuickMemoRecord` accordingly.
- Remove `completed` from `RecordDraft` — it's only on the record, not the draft. Actually keep it — the view uses it when toggling. But in the new system, `type === 'todo'` is the only thing that matters. Keep `completed` as optional boolean.

### 2.2 Rewrite parser regexes

**`src/markdown/QuickMemoParser.ts`** — Complete rewrite:

Delete all the old constants and helpers:
- Delete `TYPE_LABELS`, `LABEL_TYPES`, `toQuickMemoType()`
- Delete `TASK_RE` (old regex with `[待办]` label)
- Delete `LIST_RE` (old regex with `[记录|闪念|待办]` label)

New regexes:
```typescript
// Task regex: matches "- HH:MM [ ] content" or "- HH:MM [x] content"
const TASK_RE = /^- (\d{2}:\d{2}) \[( |x|X)\] (.+)$/u;
// Normal memo regex: matches "- HH:MM content"  
const MEMO_RE = /^- (\d{2}:\d{2}) (.+)$/u;
```

New `parseFile()` logic:
1. Find the section (using new heading-aware `findSection`)
2. For each line in the section:
   - Skip blank lines
   - If line starts with `- `:
     - Collect continuation lines (indented with 2 spaces)
     - Try TASK_RE first (to detect todos with `[ ]` or `[x]`)
     - If no match, try MEMO_RE
     - If neither matches → warning
   - Otherwise → warning

New `parseRecordLine()`:
- Accept the matched regex groups directly
- For task match: groups are time, checkbox (`' '` or `'x'` or `'X'`), content
- For memo match: groups are time, content
- Build QuickMemoRecord with type='todo' for task matches, type='memo' for memo matches

New `serializeRecord()`:
- For memo: `- ${draft.time} ${draft.content}${idPart}`
- For todo: `- ${draft.time} [${draft.completed ? 'x' : ' '}] ${draft.content}${idPart}`
- Multi-line body indented with 2 spaces as before

### 2.3 Update IndexService query to use new types

**`src/index/IndexService.ts`**:
- The `query()` method and `IndexQuery` interface need no changes — they filter by `types?: QuickMemoType[]` which will now accept `'memo' | 'todo'`.

### 2.4 Update MarkdownRecordRepository

**`src/markdown/MarkdownRecordRepository.ts`**:
- In `appendRecord()`: no longer needs a type parameter from the old system. The draft already has `type: 'memo' | 'todo'`.
- The `idSuffix` parameter is still needed for block ID generation.

## Phase 3: Input Mode Toggle UI

Replace the old type selector dropdown (记录/闪念/待办) with two toggle buttons: Normal (普通) and Todo (待办).

### 3.1 render.ts — Composer area

**`src/view/render.ts`**:
- Replace the `<select>` type dropdown with two buttons:
  - A "普通" button and a "待办" button
  - The active one gets a highlighted/selected style
  - Store the current mode as `inputMode: 'memo' | 'todo'` in state
- Remove all references to the old `TYPE_OPTIONS` array (记录/闪念/待办)
- Keep the type filter in the sidebar but update its options to: 全部 / 普通 / 待办 / 已完成待办 / 未完成待办

Note: The `OverviewState` interface currently has `settings: QuickMemoSettings` which contains `defaultRecordType`. Since we're removing that field, any reference to `state.settings.defaultRecordType` in render.ts needs to be replaced with a new `inputMode` field in `OverviewState`.

### 3.2 QuickMemoView.ts — Save logic

**`src/view/QuickMemoView.ts`**:
- Add `inputMode: 'memo' | 'todo' = 'memo'` as view state
- In `saveDraft()`: use `this.inputMode` instead of the old type selector value
- The `draft.type` will be `this.inputMode` (either `'memo'` or `'todo'`)
- For todos, set `completed: false` by default

### 3.3 viewState.ts — Filter options

**`src/view/viewState.ts`**:
- Update `TypeFilter` from `'all' | QuickMemoType` (which becomes `'all' | 'memo' | 'todo'`)
- The filter logic in `filterRecordsForView` stays the same

### 3.4 Update render card display

**`src/view/render.ts`**:
- `typeLabel()` function: change from `记录/闪念/待办` to just `普通` for memo and `待办` for todo
- The badge should show: for memo → "普通", for todo → "待办 · 已完成" or "待办 · 未完成"
- Card border colors: todo → blue (as before, keeps `.oqm-record-todo` class), memo → use a new CSS class or just neutral

### 3.5 Update stats computation

**`src/view/QuickMemoView.ts`** → `computeStats()`:
- Replace `flash` and `record` counters with a single `memo` counter
- Stats interface changes from `{ days, total, flash, record, todo, todoDone }` to `{ days, total, memo, todo, todoDone }`

**`src/view/render.ts`** → `OverviewStats` interface and `renderStats()`:
- Same change: `flash` + `record` → `memo`
- Display two stat cards instead of three: 普通 (count) + 待办 (count)

## Phase 1.5: File scanning after suffix removal

After removing the suffix, the IndexService and MarkdownRecordRepository need to find diary files. The `isQuickMemoPath` / `dateFromPath` functions now use date pattern matching instead of suffix matching. Verify these work correctly:

**`src/index/IndexService.ts`**:
- `indexableMarkdownFiles()` calls `isQuickMemoPath()` — this should now filter by diary date pattern instead of suffix. It's fine as-is since dateFromPath was rewritten.

**`src/markdown/MarkdownRecordRepository.ts`**:
- `quickMemoFiles()` same as above.

## Important Constraints

1. **Keep VaultLike interface unchanged** — if you need new vault operations, add them to VaultLike + FakeVault + ObsidianVaultAdapter
2. **Keep pure DOM in render.ts** — NO Obsidian imports (no `createEl`, no `createDiv`, use `document.createElement`)
3. **All dates LOCAL** — never use UTC date formatting
4. **Block ID format unchanged** — keep `^oqm-YYYYMMDD-HHmmss-xxxx`
5. **Theme variables only in styles.css** — no hardcoded colors
6. **Do NOT commit or push** — JUST make the code changes
7. **Run `npm run typecheck` when done** to verify TypeScript compiles
8. **Do NOT update tests yet** — they will be fixed in a later session

## Files to modify (in order):
1. src/types.ts
2. src/constants.ts  
3. src/settings/settings.ts
4. src/settings/SettingsTab.ts
5. src/daily-notes/path.ts
6. src/daily-notes/DailyNoteResolver.ts
7. src/markdown/QuickMemoParser.ts
8. src/markdown/MarkdownRecordRepository.ts
9. src/index/IndexService.ts
10. src/vaultEvents.ts
11. src/view/viewState.ts
12. src/view/render.ts
13. src/view/QuickMemoView.ts
14. styles.css (if needed for new toggle buttons)

Start implementing now. Make ALL the changes described above.
