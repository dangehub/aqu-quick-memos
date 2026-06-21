import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { QuickMemoSettings, QuickMemoType, SortDirection } from '../types';

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
      .setName('Quick Memo 标题')
      .setDesc('插件只读写这个二级标题下的记录。')
      .addText((text) => text
        .setValue(this.plugin.settings.quickMemoHeading)
        .onChange(async (value) => {
          this.plugin.settings.quickMemoHeading = value.trim() || 'Quick Memo';
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
      .setDesc('支持 YYYY、MM、DD。例如 YYYY/MM/YYYY-MM-DD 会生成 2026/06/2026-06-19-quick-memos.md。')
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
      .setName('默认记录类型')
      .addDropdown((dropdown) => dropdown
        .addOption('record', '记录')
        .addOption('flash', '闪念')
        .addOption('todo', '待办')
        .setValue(this.plugin.settings.defaultRecordType)
        .onChange(async (value) => {
          this.plugin.settings.defaultRecordType = value as QuickMemoType;
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
  }
}
