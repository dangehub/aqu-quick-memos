export interface VaultLike {
  read(path: string): Promise<string>;
  modify(path: string, content: string): Promise<void>;
  create(path: string, content: string): Promise<void>;
  exists(path: string): boolean;
  listMarkdownFiles(): string[];
  stat(path: string): { mtime: number } | undefined;
}

export class FakeVault implements VaultLike {
  private files = new Map<string, { content: string; mtime: number }>();
  private clock = 1;

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, { content, mtime: this.clock++ });
    }
  }

  async read(path: string): Promise<string> {
    const file = this.files.get(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return file.content;
  }

  async modify(path: string, content: string): Promise<void> {
    if (!this.files.has(path)) throw new Error(`File not found: ${path}`);
    this.files.set(path, { content, mtime: this.clock++ });
  }

  async create(path: string, content: string): Promise<void> {
    if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
    this.files.set(path, { content, mtime: this.clock++ });
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  listMarkdownFiles(): string[] {
    return Array.from(this.files.keys()).filter((path) => path.endsWith('.md')).sort();
  }

  stat(path: string): { mtime: number } | undefined {
    return this.files.get(path);
  }
}
