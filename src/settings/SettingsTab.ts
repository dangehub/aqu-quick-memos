import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { AttachmentFolderMode, InsertMode, LinkPathFormat, LinkStyle, ParseMode, QuickMemoSettings, SortDirection } from '../types';

interface QuickMemoSettingsHost extends Plugin {
  settings: QuickMemoSettings;
  saveSettings(): Promise<void>;
}

export class QuickMemoSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: QuickMemoSettingsHost) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('用户名称')
      .setDesc('显示在总览页左侧。')
      .addText((text) => text
        .setValue(this.plugin.settings.userName)
        .onChange(async (value) => {
          this.plugin.settings.userName = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Slogan')
      .setDesc('显示在用户名称下方。')
      .addText((text) => text
        .setValue(this.plugin.settings.userSlogan)
        .onChange(async (value) => {
          this.plugin.settings.userSlogan = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('头像路径或 URL')
      .setDesc('可以填写 vault 内图片路径或外部 URL。')
      .addText((text) => text
        .setValue(this.plugin.settings.avatar)
        .onChange(async (value) => {
          this.plugin.settings.avatar = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Memos 标题')
      .setDesc('插件只读写这个标题下的记录。支持 # 级别，如 `### memos`、`## 闪念笔记`。')
      .addText((text) => text
        .setValue(this.plugin.settings.quickMemoHeading)
        .onChange(async (value) => {
          this.plugin.settings.quickMemoHeading = value.trim() || '### memos';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('使用自定义日记路径')
      .setDesc('开启后忽略 Obsidian Daily Notes 配置，按下面的文件夹和日期格式定位文件。推荐开启，定位最稳定。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.overrideDailyNotesConfig)
        .onChange(async (value) => {
          this.plugin.settings.overrideDailyNotesConfig = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('日记文件夹')
      .setDesc('记录写入的文件夹，例如 每日工作。')
      .addText((text) => text
        .setValue(this.plugin.settings.fallbackDailyNotesFolder)
        .onChange(async (value) => {
          this.plugin.settings.fallbackDailyNotesFolder = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('日期格式')
      .setDesc('支持 YYYY、MM、DD。例如 YYYY-MM-DD 会生成 2026-06-19.md，YYYY/MM/YYYY-MM-DD 会生成 2026/06/2026-06-19.md。')
      .addText((text) => text
        .setValue(this.plugin.settings.fallbackDateFormat)
        .onChange(async (value) => {
          this.plugin.settings.fallbackDateFormat = value.trim() || 'YYYY-MM-DD';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('启用块 ID')
      .setDesc('默认开启以获得稳定编辑、勾选和块链接；关闭后进入纯净 Markdown 模式。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enableBlockIds)
        .onChange(async (value) => {
          this.plugin.settings.enableBlockIds = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('记录排序')
      .addDropdown((dropdown) => dropdown
        .addOption('desc', '最新在上')
        .addOption('asc', '最早在上')
        .setValue(this.plugin.settings.sortDirection)
        .onChange(async (value) => {
          this.plugin.settings.sortDirection = value as SortDirection;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('附件默认存放路径')
      .setDesc('设置新添加附件的存放位置。「遵循 Obsidian 设置」会使用 Obsidian 本体「文件与链接」中的附件路径配置。')
      .addDropdown((dropdown) => dropdown
        .addOption('obsidianDefault', '遵循 Obsidian 设置（默认）')
        .addOption('root', '仓库的根目录')
        .addOption('sameFolder', '当前文件所在的文件夹')
        .addOption('subFolder', '当前文件所在文件夹下指定的子文件夹')
        .addOption('customFolder', '指定的附件文件夹')
        .setValue(this.plugin.settings.attachmentFolderMode)
        .onChange(async (value) => {
          this.plugin.settings.attachmentFolderMode = value as AttachmentFolderMode;
          await this.plugin.saveSettings();
          // Re-render to show/hide conditional inputs
          this.display();
        }));

    if (this.plugin.settings.attachmentFolderMode === 'subFolder') {
      new Setting(containerEl)
        .setName('子文件夹名称')
        .setDesc('附件将存放于日记文件所在目录下的这个子文件夹中。')
        .addText((text) => text
          .setValue(this.plugin.settings.attachmentSubFolder)
          .setPlaceholder('assets')
          .onChange(async (value) => {
            this.plugin.settings.attachmentSubFolder = value.trim();
            await this.plugin.saveSettings();
          }));
    }

    if (this.plugin.settings.attachmentFolderMode === 'customFolder') {
      new Setting(containerEl)
        .setName('自定义附件路径')
        .setDesc('附件的存放路径，相对于 vault 根目录。')
        .addText((text) => text
          .setValue(this.plugin.settings.customAttachmentFolder)
          .setPlaceholder('attachments/memos')
          .onChange(async (value) => {
            this.plugin.settings.customAttachmentFolder = value.trim();
            await this.plugin.saveSettings();
          }));
    }

    // ── Link settings ──

    new Setting(containerEl)
      .setName('链接语法')
      .setDesc('插入附件时使用的链接格式。「遵循 Obsidian 设置」会读取本体「文件与链接 → 使用 Wiki 链接」选项。')
      .addDropdown((dropdown) => dropdown
        .addOption('obsidianDefault', '遵循 Obsidian 设置（默认）')
        .addOption('wiki', 'Wiki 链接（![[...]]）')
        .addOption('markdown', 'Markdown 链接（![](...)）')
        .setValue(this.plugin.settings.linkStyle)
        .onChange(async (value) => {
          this.plugin.settings.linkStyle = value as LinkStyle;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('链接路径格式')
      .setDesc('链接中使用的文件路径格式。「遵循 Obsidian 设置」会读取本体「文件与链接 → 内部链接类型」选项。')
      .addDropdown((dropdown) => dropdown
        .addOption('obsidianDefault', '遵循 Obsidian 设置（默认）')
        .addOption('shortest', '尽可能简短（仅文件名）')
        .addOption('relative', '相对于当前笔记的路径')
        .addOption('absolute', '基于仓库根目录的绝对路径')
        .setValue(this.plugin.settings.linkPathFormat)
        .onChange(async (value) => {
          this.plugin.settings.linkPathFormat = value as LinkPathFormat;
          await this.plugin.saveSettings();
        }));

    // ── Startup ──

    new Setting(containerEl)
      .setName('启动时打开 Quick Memo')
      .setDesc('开启后，每次启动 Obsidian 或重新加载插件时，自动在标签页中打开 Quick Memo 总览。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.openOnStartup)
        .onChange(async (value) => {
          this.plugin.settings.openOnStartup = value;
          await this.plugin.saveSettings();
        }));

    // ── 写入与解析范围 ──

    new Setting(containerEl)
      .setName('写入位置')
      .setDesc('新建记录时插入到日记的什么位置。' +
        '「标题下」会将新记录插入到上方指定标题的段落中；' +
        '「日记末尾」直接追加到文件末尾。')
      .addDropdown((dropdown) => dropdown
        .addOption('heading', '标题下')
        .addOption('end', '日记末尾')
        .setValue(this.plugin.settings.insertMode)
        .onChange(async (value) => {
          this.plugin.settings.insertMode = value as InsertMode;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('处理范围')
      .setDesc('插件扫描日记文件的范围。' +
        '「仅标题内」只处理上方指定标题段落中的记录；' +
        '「整篇日记」扫描文件中所有符合格式的记录（兼容不同标题的历史数据）。')
      .addDropdown((dropdown) => dropdown
        .addOption('heading', '仅标题内')
        .addOption('full', '整篇日记')
        .setValue(this.plugin.settings.parseMode)
        .onChange(async (value) => {
          this.plugin.settings.parseMode = value as ParseMode;
          await this.plugin.saveSettings();
        }));
  }
}
