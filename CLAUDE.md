# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Obsidian plugin ("Quick Memo") for fast daily capture of records, flash thoughts (闪念), and todos. It is **Markdown-native**: the Daily Note Markdown file is the only source of truth. The plugin reads/writes one `## <heading>` section per daily note and keeps a rebuildable in-memory index for search, filters, and the heatmap. There is no separate database.

## Commands

```bash
npm run typecheck     # tsc -noEmit -skipLibCheck (the gate; run after every change)
npm test              # vitest run (jsdom env, all tests under tests/**/*.test.ts)
npm run test:watch    # vitest watch
npm run build         # typecheck + esbuild production -> main.js (gitignored)
npm run dev           # esbuild --watch

# Run a single test file / test:
npm test -- tests/QuickMemoParser.test.ts
npm test -- -t "parses records only inside the Quick Memo section"

# Build + copy manifest.json, main.js, styles.css into a vault's plugin folder:
./scripts/deploy.sh
# (default target is a specific local vault; override with arg or OQM_TARGET env)
```

`main.js` is gitignored — it is a build artifact Obsidian loads next to `manifest.json` and `styles.css`. Do not commit it.

## Architecture

The dependency direction is: `main.ts` (assembly only) → services → `VaultLike`. The UI never touches files directly.

**`VaultLike` is the test seam.** `src/test/fakeVault.ts` defines the `VaultLike` interface (`read/modify/create/exists/listMarkdownFiles/stat`). Every service depends on `VaultLike`, not on Obsidian's `Vault`. `main.ts` provides `ObsidianVaultAdapter`, which adapts the real Obsidian `Vault` to `VaultLike`. This is why the parser/resolver/repository/index are all unit-testable without Obsidian. When adding vault operations, add them to `VaultLike` + `FakeVault` + `ObsidianVaultAdapter` together.

**Record Markdown format** (the contract `QuickMemoParser` reads/writes) — all entries live under a single `## <heading>` section in the date's daily note:
```
- 09:12 [闪念] content #tag ^oqm-YYYYMMDD-HHmmss-xxxx
  indented continuation = multi-line body
- [ ] 10:20 [待办] task #todo ^oqm-...        <- todos use [ ]/[x]
- [x] 11:00 [待办] done #todo ^oqm-...
```
Type labels are the Chinese tokens `记录`/`闪念`/`待办` (regexes in `QuickMemoParser` match these literally). The block id (`^oqm-…`) is optional — when `settings.enableBlockIds` is false the plugin runs in "pure markdown mode" and edits/toggles/deletes on id-less records are blocked at the view layer with a Notice. Block ids currently go on the **first** line of a multi-line record (consistent across serialize/parse/backfill — see "Tracked Deferred Notes" in the plan).

**Service responsibilities:**
- `DailyNoteResolver` — date → file path. **By default it IGNORES the Obsidian Daily Notes config** and uses the plugin's own `fallbackDailyNotesFolder` + `fallbackDateFormat` (gated by `settings.overrideDailyNotesConfig`, default `true`, because reading the internal daily-notes config is unreliable across versions). When override is off, it reads the core config via `getDailyNotesConfig` (`internalPlugins.plugins['daily-notes']`, checking both `instance.options` and top-level `options`) and falls back to the plugin settings. Path formatting is pluggable: `main.ts` injects an Obsidian-`moment`-based formatter so formats like `YYYY/MM/YYYY-MM-DD` produce nested folders (e.g. `每日工作/2026/06/2026-06-19-quick-memos.md`); tests pass the default token-replacing `formatDate`. **Files are always named `yyyy-MM-dd-quick-memos.md`** (the `QUICK_MEMO_FILENAME_SUFFIX` from `src/daily-notes/path.ts` is appended by the resolver) so the plugin never writes into or indexes the user's regular `yyyy-MM-dd.md` daily notes. `dateFromPath` / `isQuickMemoPath` (same module, shared by `IndexService` + `MarkdownRecordRepository`) intentionally accept **only** suffixed Quick Memo files; plain daily notes are ignored. **The default folder/format are this vault's values (`每日工作` / `YYYY/MM/YYYY-MM-DD`), not generic ones** — they live in `DEFAULT_SETTINGS`.
- `QuickMemoParser` — parse a file's section into `QuickMemoRecord[]` + `ParseWarning[]`, and serialize a `RecordDraft` back to a list item. The heading is a **dynamic getter** (`new QuickMemoParser(() => settings.quickMemoHeading)`), not a captured string, so changing the heading in settings takes effect without rebuilding the parser.
- `MarkdownRecordRepository` — the **only** module that mutates Markdown. `appendRecord`/`updateRecord`/`toggleTodo`/`deleteRecord`/`backfillMissingIds`. Locates records by id via a full vault scan (no date index) — acceptable for typical vaults.
- `IndexService` — rebuildable cache: `rebuild`, `refreshChangedFiles` (mtime-delta), `query`, `heatmap`, `tags`, `warnings`. Internal record order is ascending; **display order is applied separately** by the view via `sortRecordsForDisplay(records, settings.sortDirection)`. Treat the cache as disposable — `rebuild()` reconstructs everything from Markdown.

**UI layer** (`src/view/`): `QuickMemoView` (an `ItemView`) owns view state (`selectedDate`, `filters`, `editingRecordId`, `openMenuRecordId`) and delegates every mutation to the repository/index. `render.ts` is a pure DOM renderer (uses standard `document.createElement` helpers, **not** Obsidian's `createDiv`/`createEl`, so it runs under jsdom) driven by `OverviewState` + `OverviewCallbacks`. Per-record actions (edit/delete/copy/open, plus toggle for todos) live behind a top-right **⋮ dropdown menu** on each card, not a bottom button row; the open card is tracked via `openMenuRecordId`. View state keys per record with `recordKey(record)` (exported from `render.ts`), which falls back to `filePath:lineStart` for id-less (pure-markdown) records — use it, not raw `record.id`, when storing/editing identity in the view. `viewState.ts` holds pure filter/sort/range helpers (incl. `rollSelectedDate` for cross-midnight handling). The renderer and view communicate only through those interfaces.

**Settings-driven reactivity.** `QuickMemoPlugin.saveSettings()` (called by the settings tab on each field change) rebuilds the index and refreshes any open view, so heading/folder/format changes propagate live. This works because parser/resolver read settings at call time.

## Conventions that aren't obvious from the code

- **Dates are LOCAL, never UTC.** Use the `today()`/`currentTime()`/`localDateString()` helpers in `QuickMemoView.ts` and `localToday()` in `main.ts`. Earlier `new Date().toISOString().slice(0,10)` caused an off-by-one (records landing on yesterday's file near midnight). Don't reintroduce UTC date formatting.
- **Block-id placement on multi-line records is a known deferred item** (first-line placement, consistent across all write paths). If you change it, change `serializeRecord`, `backfillMissingIds`, and the `extractBlockId`/`stripBlockId` regex together. See the "Tracked Deferred Notes" section in `docs/superpowers/plans/2026-06-18-obsidian-quick-memo.md`.
- **`styles.css` must use Obsidian theme variables only** (`--background-*`, `--text-*`, `--interactive-accent*`, `--size-4-*`, `--radius-*`, `--font-ui-*`, etc.) so it follows the user's light/dark theme. No hardcoded colors. Respect `prefers-reduced-motion`.
- **The view is long-lived.** It polls the local date once a minute and rolls `selectedDate` to the new day across midnight — but only if the user was already viewing "today" (browsing a historical date is never interrupted). Clean up timers in `onClose`.
- **The heatmap is a fixed 90-square window**, anchored at the 1st of the month two months before today (`renderHeatmap` in `render.ts`), rendered as one flat `flex-wrap` stream in the sidebar (not a calendar grid, not grouped by month). It is independent of `selectedDate` (driven by `todayDate`); today intentionally sits inside the grid rather than at the end. Squares carry no date text — the date/count is in the `title`/`aria-label`. Don't tie the square count to the selected date.
- `.claude/skills/` is gitignored — it holds local tool assets, not plugin source. `__pycache__/` and `*.pyc` too.

## Reference docs

- Design spec: `docs/superpowers/specs/2026-06-18-obsidian-quick-memo-design.md`
- Implementation plan (with the per-task build history and deferred-notes section): `docs/superpowers/plans/2026-06-18-obsidian-quick-memo.md`
