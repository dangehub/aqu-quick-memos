# Quick Memo 二改实施计划

> 目标：将 Quick Memo 改为可直接在日记中使用的轻量捕获工具，替代 Thino
> 日期：2026-07-01

---

## 改动概览

| Phase | 内容 | 改动文件数 | 复杂度 |
|-------|------|----------|--------|
| 1 | 去掉 -quick-memos 后缀 + 标题可配 | 6 | ⭐⭐⭐ |
| 2 | 重写 Parser（新 memo/todo 格式） | 3 | ⭐⭐⭐⭐ |
| 3 | 输入模式切换 UI | 3 | ⭐⭐ |
| 4 | 附件功能（图片粘贴+路径配置） | 4 | ⭐⭐⭐⭐ |
| 5 | 设置页 + 渲染 + 统计适配 | 5 | ⭐⭐ |
| 6 | 测试更新 + 编译 + 部署 | 全部 | ⭐⭐⭐ |

---

## Phase 1: 去掉后缀 + 标题可配置

### 1.1 删除文件后缀

**`src/daily-notes/path.ts`**
- 删除 `QUICK_MEMO_FILENAME_SUFFIX`
- 重写 `dateFromPath(path, dateFormat)` — 从符合日记格式的文件路径中提取日期
  - 输入：`每日工作/2026/07/2026-07-01.md`, format=`YYYY/MM/YYYY-MM-DD`
  - 输出：`2026-07-01`
  - 思路：提取文件名（去掉 `.md`），用用户配置的日期格式正则反向匹配
- 重写 `isQuickMemoPath(path, dateFormat)` — 检查路径是否符合日记格式

**`src/daily-notes/DailyNoteResolver.ts`**
- `resolve()`：不再追加后缀，直接 `formatDate(date, format).md`
- `ensureDailyNote()`：创建不带后缀的文件，追加用户配置的标题（如 `### memos`）

**`src/markdown/MarkdownRecordRepository.ts`**
- `quickMemoFiles()`：改为接收日期格式参数，基于 `isQuickMemoPath` 新逻辑过滤

**`src/index/IndexService.ts`**
- `indexableMarkdownFiles()`：同上

**`src/vaultEvents.ts`**
- `shouldHandleVaultFileEvent()`：改为基于日记格式匹配

### 1.2 标题可配置（含 `#` 级别）

**`src/types.ts` + `src/settings/settings.ts`**
- `quickMemoHeading` 默认值从 `Quick Memo` → `### memos`
- 用户直接输入 `### memos`、`## 闪念笔记` 等，包含 `#` 级别号

**`src/markdown/QuickMemoParser.ts`**
- `findSection()`：匹配任意级别标题（`/^#{1,6}\s+${headingText}$/`）
  - 提取级别和标题文本
  - 只在**同级或更高级**标题处结束 section

**`src/markdown/MarkdownRecordRepository.ts`**
- `insertIntoSection()`：适配动态标题级别

---

## Phase 2: 重写 Parser（新格式）

### 新格式规范

**普通 memo**：
```markdown
- 01:16 哈哈哈
  多行内容缩进两个空格
  继续缩进
```

**待办**：
```markdown
- 16:00 [ ] 带二甲双胍一板放车上
- 16:30 [x] 已完成的待办
  待办也可以有多行
```

**规则**：
- 普通 memo 正则：`/^- (\d{2}:\d{2}) (.+)$/`
- 待办正则：`/^- (\d{2}:\d{2}) \[( |x|X)\] (.+)$/`
- 多行内容：以两个空格开头的行视为续行
- 无类型标签 `[记录]` `[闪念]` `[待办]`
- `#tag` 自由使用

### 2.1 简化类型系统

**`src/types.ts`**
```typescript
// 旧
export type QuickMemoType = 'record' | 'flash' | 'todo';
// 新
export type QuickMemoType = 'memo' | 'todo';
```

- `RecordDraft` 中 `type` 改为 `'memo' | 'todo'`
- `QuickMemoRecord` 中 `type` 改为 `'memo' | 'todo'`

### 2.2 重写 QuickMemoParser

**解析**：
- 删除 `TYPE_LABELS` / `LABEL_TYPES` / `toQuickMemoType()`
- 新解析流程：
  1. 先尝试匹配待办正则（`^- HH:MM [ x] ...`）
  2. 否则尝试匹配普通 memo 正则（`^- HH:MM ...`）
  3. 都不匹配 → warning
- `type` 由是否匹配 task regex 决定

**序列化**：
- 普通 memo：`- ${time} ${content}${idPart}`
- 待办：`- ${time} [${completed ? 'x' : ' '}] ${content}${idPart}`
- 多行 body 仍然缩进 2 空格

---

## Phase 3: 输入模式切换 UI

**`src/view/render.ts`** — Composer 区域：
- 去掉类型下拉选择器（原来是 记录/闪念/待办）
- 改为**两个按钮**切换模式：
  - `✏️ 普通`（默认）
  - `☑️ 待办`
- 待办模式下，保存时 `type='todo'`，`completed=false`
- 普通模式下，保存时 `type='memo'`
- 右上角仍显示当前选中日期

**`src/view/QuickMemoView.ts`**：
- 新增 `inputMode: 'memo' | 'todo'` 状态
- `saveDraft()` 根据 inputMode 设置 type

### 卡片展示适配

- 去掉 `[闪念]` `[记录]` `[待办]` 类型标签
- 待办卡片：保留勾选框 + "已完成/未完成" 文字
- 普通 memo 卡片：只显示时间和内容
- 卡片左边框颜色简化（待办=蓝色，普通=默认或绿色）

---

## Phase 4: 附件功能（图片粘贴+路径配置）

### 4.1 设置项新增

**`src/types.ts` → `QuickMemoSettings`**：
```typescript
attachmentFolderMode: 'root' | 'sameFolder' | 'subFolder' | 'customFolder';
attachmentSubFolder: string;        // subFolder 模式下的子文件夹名
customAttachmentFolder: string;     // customFolder 模式下的绝对/相对路径
```

默认值：
```typescript
attachmentFolderMode: 'sameFolder',
attachmentSubFolder: 'assets',
customAttachmentFolder: '',
```

### 4.2 设置 UI

**`src/settings/SettingsTab.ts`**：
```typescript
new Setting(containerEl)
  .setName('附件默认存放路径')
  .setDesc('设置新添加附件的存放位置。')
  .addDropdown(dropdown => dropdown
    .addOption('root', '仓库的根目录')
    .addOption('sameFolder', '当前文件所在的文件夹')
    .addOption('subFolder', '当前文件所在文件夹下指定的子文件夹')
    .addOption('customFolder', '指定的附件文件夹')
    .setValue(this.plugin.settings.attachmentFolderMode)
    .onChange(async (value) => {
      this.plugin.settings.attachmentFolderMode = value as AttachmentFolderMode;
      await this.plugin.saveSettings();
    }));

// subFolder 模式下显示子文件夹名输入框（条件显示）
// customFolder 模式下显示路径输入框（条件显示）
```

### 4.3 粘贴处理

**`src/view/QuickMemoView.ts`** — 在 input textarea 上注册 paste 事件：
```typescript
input.addEventListener('paste', async (event: ClipboardEvent) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      const link = await this.saveAttachment(file);
      // 在光标位置插入 ![[link]] 或 ![alt](link)
      insertAtCursor(input, `![[${link}]]`);
    }
  }
});
```

### 4.4 附件保存逻辑

**`src/view/QuickMemoView.ts`** — 新增 `saveAttachment()`：
```typescript
async saveAttachment(file: File): Promise<string> {
  const { settings } = this;
  const todayFile = await this.resolver.resolve(this.selectedDate);
  const targetDir = getAttachmentDir(todayFile.filePath, settings);
  
  // 确保目录存在
  if (!(await this.app.vault.adapter.exists(targetDir))) {
    await this.app.vault.adapter.mkdir(targetDir);
  }
  
  // 生成唯一文件名（时间戳 + 原文件名）
  const ext = file.name.split('.').pop() ?? 'png';
  const filename = `memo-${Date.now()}.${ext}`;
  const fullPath = `${targetDir}/${filename}`;
  
  // 写入文件
  const arrayBuf = await file.arrayBuffer();
  await this.app.vault.adapter.writeBinary(fullPath, new Uint8Array(arrayBuf));
  
  return fullPath;
}
```

**`getAttachmentDir()` 工具函数**：
```typescript
function getAttachmentDir(memoFilePath: string, settings: QuickMemoSettings): string {
  switch (settings.attachmentFolderMode) {
    case 'root': return '';
    case 'sameFolder': return memoFilePath.substring(0, memoFilePath.lastIndexOf('/'));
    case 'subFolder': {
      const base = memoFilePath.substring(0, memoFilePath.lastIndexOf('/'));
      return `${base}/${settings.attachmentSubFolder}`;
    }
    case 'customFolder': return settings.customAttachmentFolder;
  }
}
```

---

## Phase 5: 设置页 + 渲染 + 统计适配

### 5.1 设置页更新

**删除**：
- 默认记录类型（不再有 `[闪念]` `[记录]` `[待办]`）

**修改**：
- Quick Memo 标题：提示改为"插件只读写这个标题下的记录。支持 # 级别，如 `### memos`。"
- 使用自定义日记路径：提示改为"开启后忽略 Obsidian Daily Notes 配置..."

**新增**：
- 附件存放路径（含条件显示的输入框）

### 5.2 渲染器适配

**`src/view/render.ts`**：
- 卡片 badge 不再显示类型
- 待办卡片只显示 "已完成/未完成"
- 类型筛选下拉改为：全部 / 普通 / 待办 / 已完成待办 / 未完成待办
- 统计面板：闪念/记录→合并为"普通"

### 5.3 配置迁移

**`src/settings/settings.ts` → `normalizeSettings()`**：
- 旧 `defaultRecordType` 字段自动忽略（不再有效）
- 新 `attachmentFolderMode` 等字段 `Object.assign` 自动补默认值

---

## Phase 6: 测试 + 编译 + 部署

### 6.1 测试更新
- 更新 fixtures（新格式）
- 更新所有 parser/repository/index 测试
- 新增附件保存逻辑的单元测试（FakeVault 需要支持 `adapter`）

### 6.2 编译验证
```bash
npm run typecheck
npm run build
npm test
```

### 6.3 部署测试库
```bash
cp main.js manifest.json styles.css \
  /Users/qudange/Documents/测试用OB/.obsidian/plugins/swz-quick-memos/
```

### 6.4 注意事项
- `data.json` 中的旧配置（如 `defaultRecordType`）会被 `normalizeSettings` 忽略，不会报错
- 旧格式的记录（`[闪念]` `[记录]` `[待办]`）不再被解析（会显示 warning）
- 用户已有 `-quick-memos.md` 文件的记录**不会自动迁移**

---

## 文件改动清单

| 文件 | Phase | 改动类型 |
|------|-------|---------|
| `src/types.ts` | 1+2+4 | 类型定义重写 |
| `src/constants.ts` | 1 | 删除无用常量 |
| `src/settings/settings.ts` | 1+4+5 | 默认值 + 迁移 |
| `src/settings/SettingsTab.ts` | 4+5 | 新增附件设置 |
| `src/daily-notes/path.ts` | 1 | 去后缀重写 |
| `src/daily-notes/DailyNoteResolver.ts` | 1 | 去后缀 + 动态标题 |
| `src/daily-notes/obsidianInternal.ts` | — | 不变 |
| `src/markdown/QuickMemoParser.ts` | 1+2 | 重写解析/序列化 |
| `src/markdown/id.ts` | — | 不变 |
| `src/markdown/MarkdownRecordRepository.ts` | 1 | 扫描逻辑适配 |
| `src/index/IndexService.ts` | 1 | 扫描逻辑适配 |
| `src/view/QuickMemoView.ts` | 3+4 | 输入模式 + 附件 |
| `src/view/render.ts` | 3+5 | UI 重绘 |
| `src/view/viewState.ts` | 5 | 筛选适配 |
| `src/vaultEvents.ts` | 1 | 过滤逻辑适配 |
| `src/test/fakeVault.ts` | 4 | 增加 adapter 模拟 |
| `src/test/fixtures.ts` | 2 | 新格式 fixture |
| `tests/*.test.ts` | 6 | 全部更新 |
| `styles.css` | 5 | 小调整 |

---

## 待确认

1. ~~标题 A 方案~~ ✅ 确认
2. ~~去掉后缀后扫描日记格式文件~~ ✅ 确认
3. ~~新格式：`- HH:MM [ ] 内容`~~ ✅ 确认
4. 附件路径配置的四个选项名称，我按 Obsidian 原版写的。你看图里的选项名称需要匹配吗？
5. 旧 `-quick-memos.md` 文件里的数据不自动迁移，需要用户手动处理。可以接受吗？
