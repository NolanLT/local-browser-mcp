import {
  Browser,
  BrowserContext,
  Page,
  firefox,
  webkit,
  chromium,
  LaunchOptions
} from "playwright";

export type Engine = "firefox" | "webkit" | "chromium";

export interface ConsoleEntry {
  type: string;
  text: string;
  at: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status?: number;
  resourceType: string;
  at: number;
}

export interface SnapshotNode {
  ref: string;
  tag: string;
  role: string;
  text: string;
}

export interface BrowserOptions {
  engine: Engine;
  allowedHosts: string[];
  allowAllHosts?: boolean;
  width?: number;
  height?: number;
}

const MAX_BUFFER = 200;

/**
 * Thin wrapper around a single Playwright page. Holds the console / network
 * buffers, enforces the localhost allowlist, and exposes the primitives the
 * MCP tools build on. The browser runs headless — there is no live view.
 */
export class LocalBrowser {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private readonly console: ConsoleEntry[] = [];
  private readonly network: NetworkEntry[] = [];
  private _currentUrl = "about:blank";
  // Mutable so the allowlist can be changed at runtime (via tools / settings)
  // without relaunching the browser.
  private allowed: Set<string>;
  private allowAll: boolean;

  constructor(private readonly opts: BrowserOptions) {
    this.allowed = new Set(opts.allowedHosts);
    this.allowAll = !!opts.allowAllHosts;
  }

  get engine(): Engine {
    return this.opts.engine;
  }

  /** Hosts that count as "local" — eval there never needs confirmation. */
  static readonly LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", ""];

  isLocalUrl(rawUrl: string): boolean {
    try {
      return LocalBrowser.LOCAL_HOSTS.includes(new URL(rawUrl).hostname);
    } catch {
      return true; // about:blank etc.
    }
  }

  setAllowedHosts(hosts: string[]): void {
    this.allowed = new Set(hosts);
  }
  setAllowAllHosts(value: boolean): void {
    this.allowAll = value;
  }
  allowHost(host: string): void {
    this.allowed.add(host);
  }
  disallowHost(host: string): void {
    this.allowed.delete(host);
  }
  getAllowed(): { hosts: string[]; allowAllHosts: boolean } {
    return { hosts: [...this.allowed], allowAllHosts: this.allowAll };
  }

  get currentUrl(): string {
    return this._currentUrl;
  }

  get isRunning(): boolean {
    return (
      !!this.page &&
      !this.page.isClosed() &&
      !!this.browser &&
      this.browser.isConnected()
    );
  }

  /**
   * Launch the engine and open a single page. Idempotent, and self-healing: if
   * the browser process died (crash, OS kill) the stale refs are cleared and a
   * fresh instance is launched, so callers transparently recover.
   */
  async ensureStarted(): Promise<void> {
    if (this.browser && !this.browser.isConnected()) {
      // Process is gone — drop refs so we relaunch fresh below.
      this.browser = undefined;
      this.context = undefined;
      this.page = undefined;
    }
    if (this.isRunning) {
      return;
    }
    const launcher = { firefox, webkit, chromium }[this.opts.engine];
    const launchOptions: LaunchOptions = { headless: true };
    this.browser = await launcher.launch(launchOptions);
    // If the browser dies later, clear refs so the next call relaunches.
    this.browser.on("disconnected", () => {
      this.browser = undefined;
      this.context = undefined;
      this.page = undefined;
    });
    this.context = await this.browser.newContext({
      viewport: {
        width: this.opts.width ?? 1280,
        height: this.opts.height ?? 800
      },
      ignoreHTTPSErrors: true
    });
    this.page = await this.context.newPage();
    this.wirePage(this.page);
  }

  private wirePage(page: Page): void {
    page.on("console", (msg) => {
      this.push(this.console, {
        type: msg.type(),
        text: msg.text(),
        at: Date.now()
      });
    });
    page.on("pageerror", (err) => {
      this.push(this.console, {
        type: "error",
        text: err.message,
        at: Date.now()
      });
    });
    page.on("request", (req) => {
      this.push(this.network, {
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
        at: Date.now()
      });
    });
    page.on("response", (res) => {
      // Attach the status to the most recent matching request entry.
      const url = res.url();
      for (let i = this.network.length - 1; i >= 0; i--) {
        if (this.network[i].url === url && this.network[i].status === undefined) {
          this.network[i].status = res.status();
          break;
        }
      }
    });
    page.on("framenavigated", (frame) => {
      if (frame === this.page?.mainFrame()) {
        this._currentUrl = frame.url();
      }
    });
  }

  private push<T>(buf: T[], entry: T): void {
    buf.push(entry);
    if (buf.length > MAX_BUFFER) {
      buf.splice(0, buf.length - MAX_BUFFER);
    }
  }

  /** Validate a URL against the localhost allowlist. Throws on rejection. */
  assertAllowed(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`Invalid URL: ${rawUrl}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Blocked protocol "${parsed.protocol}". Only http/https to local hosts are allowed.`);
    }
    const host = parsed.hostname;
    if (!this.allowAll && !this.allowed.has(host)) {
      throw new Error(
        `Blocked host "${host}". Allowed: ${[...this.allowed].join(", ")}. ` +
          `Use browser_allow_host to request access, or set localBrowser.allowAllHosts.`
      );
    }
    return parsed;
  }

  /**
   * Return a live page, (re)launching the browser if it isn't running. All
   * operations go through here so a crashed engine recovers transparently.
   */
  private async ready(): Promise<Page> {
    await this.ensureStarted();
    if (!this.page || this.page.isClosed()) {
      throw new Error("Browser is not running. Start the Local Browser first.");
    }
    return this.page;
  }

  async navigate(url: string): Promise<{ url: string; ok: boolean; status?: number; error?: string }> {
    await this.ensureStarted();
    this.assertAllowed(url);
    const page = await this.ready();
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      this._currentUrl = page.url();
      return { url: page.url(), ok: true, status: resp?.status() };
    } catch (err) {
      // Dev server may not be up yet — return a structured result rather than
      // throwing, so the agent gets a clear error and a toast can report it.
      return { url, ok: false, error: (err as Error).message };
    }
  }

  async reload(): Promise<void> {
    await (await this.ready()).reload({ waitUntil: "domcontentloaded" });
  }

  async back(): Promise<void> {
    await (await this.ready()).goBack({ waitUntil: "domcontentloaded" });
  }

  async forward(): Promise<void> {
    await (await this.ready()).goForward({ waitUntil: "domcontentloaded" });
  }

  async screenshot(opts: { fullPage?: boolean; selector?: string } = {}): Promise<Buffer> {
    const page = await this.ready();
    if (opts.selector) {
      const el = page.locator(opts.selector).first();
      return el.screenshot({ type: "png" });
    }
    return page.screenshot({ type: "png", fullPage: !!opts.fullPage });
  }

  async click(opts: { selector?: string; ref?: string }): Promise<void> {
    const page = await this.ready();
    const sel = this.resolveSelector(opts);
    await page.locator(sel).first().click({ timeout: 10000 });
  }

  async hover(opts: { selector?: string; ref?: string }): Promise<void> {
    const page = await this.ready();
    const sel = this.resolveSelector(opts);
    await page.locator(sel).first().hover({ timeout: 10000 });
  }

  async fill(selector: string, value: string): Promise<void> {
    const page = await this.ready();
    await page.locator(selector).first().fill(value, { timeout: 10000 });
  }

  async type(text: string): Promise<void> {
    const page = await this.ready();
    await page.keyboard.type(text);
  }

  async evaluate(expression: string): Promise<unknown> {
    const page = await this.ready();
    // Wrap so both expressions ("1+1") and statement bodies work.
    return page.evaluate(
      // eslint-disable-next-line no-new-func
      `(async () => { return (${expression}); })()`
    );
  }

  async waitFor(opts: { selector?: string; text?: string; timeoutMs?: number }): Promise<void> {
    const page = await this.ready();
    const timeout = opts.timeoutMs ?? 10000;
    if (opts.selector) {
      await page.locator(opts.selector).first().waitFor({ state: "visible", timeout });
      return;
    }
    if (opts.text) {
      await page.getByText(opts.text, { exact: false }).first().waitFor({ state: "visible", timeout });
      return;
    }
    await page.waitForTimeout(Math.min(timeout, 2000));
  }

  async resize(width: number, height: number): Promise<void> {
    const page = await this.ready();
    await page.setViewportSize({ width, height });
  }

  /**
   * Walk the DOM in-page, tag interesting elements with a stable ref attribute,
   * and return a flat snapshot for element targeting.
   */
  async snapshot(): Promise<SnapshotNode[]> {
    const page = await this.ready();
    return page.evaluate(() => {
      const SELECTOR =
        "a,button,input,textarea,select,[role],h1,h2,h3,h4,label,[contenteditable='true']";
      const out: { ref: string; tag: string; role: string; text: string }[] = [];
      const els = Array.from(document.querySelectorAll(SELECTOR));
      els.forEach((el, i) => {
        const he = el as HTMLElement;
        const style = window.getComputedStyle(he);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }
        const ref = `e${i}`;
        he.setAttribute("data-lbmcp-ref", ref);
        const role =
          he.getAttribute("role") ||
          (he as HTMLInputElement).type ||
          he.tagName.toLowerCase();
        const text = (he.innerText || (he as HTMLInputElement).value || he.getAttribute("aria-label") || "")
          .trim()
          .slice(0, 120);
        out.push({ ref, tag: he.tagName.toLowerCase(), role, text });
      });
      return out;
    });
  }

  async getText(): Promise<string> {
    const page = await this.ready();
    return page.evaluate(() => document.body?.innerText ?? "");
  }

  private resolveSelector(opts: { selector?: string; ref?: string }): string {
    if (opts.selector) {
      return opts.selector;
    }
    if (opts.ref) {
      return `[data-lbmcp-ref="${opts.ref}"]`;
    }
    throw new Error("click requires either `selector` or `ref`.");
  }

  getConsole(): ConsoleEntry[] {
    return [...this.console];
  }

  getNetwork(): NetworkEntry[] {
    return [...this.network];
  }

  async dispose(): Promise<void> {
    try {
      await this.context?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.browser?.close();
    } catch {
      /* ignore */
    }
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
  }
}
