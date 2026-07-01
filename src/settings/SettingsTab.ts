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

    // ════════════════════════════════════════════
    // 个人资料
    // ════════════════════════════════════════════
    containerEl.createEl('h2', { text: '个人资料' });

    new Setting(containerEl)
      .setName('用户名称')
      .setDesc('显示在 Quick Memo 总览页侧边栏顶部。')
      .addText((text) => text
        .setValue(this.plugin.settings.userName)
        .onChange(async (value) => {
          this.plugin.settings.userName = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('个性签名')
      .setDesc('显示在用户名称下方的副标题。')
      .addText((text) => text
        .setValue(this.plugin.settings.userSlogan)
        .onChange(async (value) => {
          this.plugin.settings.userSlogan = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('头像')
      .setDesc('侧边栏头像图片的网络 URL 或 Vault 内路径。留空则不显示。')
      .addText((text) => text
        .setValue(this.plugin.settings.avatar)
        .onChange(async (value) => {
          this.plugin.settings.avatar = value;
          await this.plugin.saveSettings();
        }));

    // ════════════════════════════════════════════
    // 日记存储
    // ════════════════════════════════════════════
    containerEl.createEl('h2', { text: '日记存储' });

    new Setting(containerEl)
      .setName('Memos 标题')
      .setDesc('插件读写此标题下的记录列表。支持 # 级别，如 `### memos`、`## 闪念笔记`。')
      .addText((text) => text
        .setValue(this.plugin.settings.quickMemoHeading)
        .onChange(async (value) => {
          this.plugin.settings.quickMemoHeading = value.trim() || '### memos';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('自定义日记文件路径')
      .setDesc('开启后独立管理文件路径，不依赖 Obsidian 核心日记插件。推荐开启，路径最稳定。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.overrideDailyNotesConfig)
        .onChange(async (value) => {
          this.plugin.settings.overrideDailyNotesConfig = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('日记文件夹')
      .setDesc('日记文件所在的 Vault 相对目录，如 `每日工作`。')
      .addText((text) => text
        .setValue(this.plugin.settings.fallbackDailyNotesFolder)
        .onChange(async (value) => {
          this.plugin.settings.fallbackDailyNotesFolder = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('日期格式')
      .setDesc('控制日记文件的命名和目录结构。`YYYY/MM/YYYY-MM-DD` 会生成 `2026/07/2026-07-01.md`。')
      .addText((text) => text
        .setValue(this.plugin.settings.fallbackDateFormat)
        .onChange(async (value) => {
          this.plugin.settings.fallbackDateFormat = value.trim() || 'YYYY-MM-DD';
          await this.plugin.saveSettings();
        }));

    // ════════════════════════════════════════════
    // 记录行为
    // ════════════════════════════════════════════
    containerEl.createEl('h2', { text: '记录行为' });

    new Setting(containerEl)
      .setName('写入位置')
      .setDesc('新建记录插入到日记的哪个区域。「标题下」插入到指定标题段落；「文件末尾」直接追加。')
      .addDropdown((dropdown) => dropdown
        .addOption('heading', '标题下')
        .addOption('end', '文件末尾')
        .setValue(this.plugin.settings.insertMode)
        .onChange(async (value) => {
          this.plugin.settings.insertMode = value as InsertMode;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('处理范围')
      .setDesc('插件读取数据的范围。「仅标题内」限定指定标题段落；「整篇文件」处理文件中所有合规记录。')
      .addDropdown((dropdown) => dropdown
        .addOption('heading', '仅标题内')
        .addOption('full', '整篇文件')
        .setValue(this.plugin.settings.parseMode)
        .onChange(async (value) => {
          this.plugin.settings.parseMode = value as ParseMode;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('块 ID')
      .setDesc('每条记录末尾附加唯一标识符，确保编辑、勾选和块引用可靠。关闭即进入纯 Markdown 模式，部分功能不可用。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.enableBlockIds)
        .onChange(async (value) => {
          this.plugin.settings.enableBlockIds = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('记录排序')
      .setDesc('时间线中记录条目的排列方向。')
      .addDropdown((dropdown) => dropdown
        .addOption('desc', '最新在上')
        .addOption('asc', '最早在上')
        .setValue(this.plugin.settings.sortDirection)
        .onChange(async (value) => {
          this.plugin.settings.sortDirection = value as SortDirection;
          await this.plugin.saveSettings();
        }));

    // ════════════════════════════════════════════
    // 附件与链接
    // ════════════════════════════════════════════
    containerEl.createEl('h2', { text: '附件与链接' });

    new Setting(containerEl)
      .setName('附件存放方式')
      .setDesc('粘贴或插入图片时的默认存储位置。')
      .addDropdown((dropdown) => dropdown
        .addOption('obsidianDefault', '使用 Obsidian 默认设置')
        .addOption('root', 'Vault 根目录')
        .addOption('sameFolder', '当前文件所在目录')
        .addOption('subFolder', '当前文件目录下的子文件夹')
        .addOption('customFolder', '指定目录')
        .setValue(this.plugin.settings.attachmentFolderMode)
        .onChange(async (value) => {
          this.plugin.settings.attachmentFolderMode = value as AttachmentFolderMode;
          await this.plugin.saveSettings();
          this.display();
        }));

    if (this.plugin.settings.attachmentFolderMode === 'subFolder') {
      new Setting(containerEl)
        .setName('  子文件夹名称')
        .setDesc('附件存入日记所在目录下的该子文件夹。')
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
        .setName('  自定义路径')
        .setDesc('相对 Vault 根目录的附件存放路径。')
        .addText((text) => text
          .setValue(this.plugin.settings.customAttachmentFolder)
          .setPlaceholder('attachments/memos')
          .onChange(async (value) => {
            this.plugin.settings.customAttachmentFolder = value.trim();
            await this.plugin.saveSettings();
          }));
    }

    new Setting(containerEl)
      .setName('链接语法')
      .setDesc('插入附件时使用的 Markdown 或 Wiki 链接格式。默认跟随 Obsidian 本体「文件与链接」设置。')
      .addDropdown((dropdown) => dropdown
        .addOption('obsidianDefault', '使用 Obsidian 默认设置')
        .addOption('wiki', 'Wiki 链接：![[...]]')
        .addOption('markdown', 'Markdown 链接：![](...)')
        .setValue(this.plugin.settings.linkStyle)
        .onChange(async (value) => {
          this.plugin.settings.linkStyle = value as LinkStyle;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('链接路径格式')
      .setDesc('链接中引用文件的路径形式。默认跟随 Obsidian 本体设置。')
      .addDropdown((dropdown) => dropdown
        .addOption('obsidianDefault', '使用 Obsidian 默认设置')
        .addOption('shortest', '最短路径（仅文件名）')
        .addOption('relative', '相对路径')
        .addOption('absolute', '绝对路径（从 Vault 根起）')
        .setValue(this.plugin.settings.linkPathFormat)
        .onChange(async (value) => {
          this.plugin.settings.linkPathFormat = value as LinkPathFormat;
          await this.plugin.saveSettings();
        }));

    // ════════════════════════════════════════════
    // 启动行为
    // ════════════════════════════════════════════
    containerEl.createEl('h2', { text: '启动行为' });

    new Setting(containerEl)
      .setName('启动时打开 Quick Memo')
      .setDesc('Obsidian 启动或插件重载后自动在标签页中显示 Quick Memo 总览。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.openOnStartup)
        .onChange(async (value) => {
          this.plugin.settings.openOnStartup = value;
          await this.plugin.saveSettings();
        }));
  }
}
