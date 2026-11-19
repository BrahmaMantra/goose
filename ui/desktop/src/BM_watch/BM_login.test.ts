import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
const BM_fake = vi.hoisted(() => ({ BM_windows: [] as unknown[], BM_sessions: [] as unknown[] }));
vi.mock('electron', () => ({
  session: {
    fromPath: vi.fn((BM_path: string) => {
      const BM_session = {
        BM_path,
        cookies: {
          flushStore: vi.fn(async () => undefined),
          get: vi.fn(async () => [
            {
              name: 'BM_cookie',
              value: 'BM_synthetic_value',
              domain: '.douyin.com',
              path: '/',
              secure: true,
              httpOnly: true,
              sameSite: 'lax',
            },
          ]),
        },
        flushStorageData: vi.fn(),
        clearStorageData: vi.fn(async () => undefined),
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
        on: vi.fn(),
      };
      BM_fake.BM_sessions.push(BM_session);
      return BM_session;
    }),
  },
  BrowserWindow: class extends EventEmitter {
    BM_destroyed = false;
    BM_url = 'https://creator.douyin.com/creator-micro/home';
    BM_openHandler?: (BM_details: { url: string }) => unknown;
    BM_options: unknown;
    webContents: EventEmitter & {
      session: unknown;
      getURL: () => string;
      executeJavaScript: ReturnType<typeof vi.fn>;
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
    };
    constructor(BM_options: { webPreferences: { session: unknown } }) {
      super();
      this.BM_options = BM_options;
      this.webContents = Object.assign(new EventEmitter(), {
        session: BM_options.webPreferences.session,
        getURL: () => this.BM_url,
        executeJavaScript: vi.fn(async (BM_script: string) => {
          if (BM_script.includes('BM_card.click()')) {
            const BM_index = Number(/"BM_index":(\d+)/.exec(BM_script)?.[1] ?? 0);
            this.BM_openHandler?.({
              url: `https://creator.douyin.com/creator-micro/work-management/work-detail/${123456789 + BM_index}?enter_from=content`,
            });
            return true;
          }
          if (BM_script.includes('scrollTop')) return true;
          if (BM_script.includes('const BM_cards'))
            return {
              BM_items: Array.from(
                { length: Number(/(\d+)\)$/.exec(BM_script)?.[1] ?? 12) },
                (_BM_unused, BM_index) => ({
                  BM_index,
                  BM_id: null,
                  BM_title_text: `BM work ${BM_index}`,
                  BM_publish_time_text: 'BM time',
                  BM_status_text: '已发布',
                  BM_pinned: false,
                  BM_disabled: false,
                })
              ),
              BM_order_text: '最新发布',
            };
          return {
            BM_status: 'authenticated',
            BM_account: { BM_display_name: 'BM nickname', BM_douyin_id: 'BM_id' },
          };
        }),
        setWindowOpenHandler: vi.fn((BM_handler: (BM_details: { url: string }) => unknown) => {
          this.BM_openHandler = BM_handler;
        }),
      });
      BM_fake.BM_windows.push(this);
    }
    isDestroyed() {
      return this.BM_destroyed;
    }
    show() {}
    async loadURL(BM_url: string) {
      this.BM_url = BM_url;
    }
    close() {
      this.BM_destroyed = true;
      this.emit('closed');
    }
  },
}));
import { BM_Login, BM_allowedLoginUrl, BM_readAccountScript } from './BM_login';
let BM_root: string;
let BM_owner: BrowserWindow;
beforeEach(async () => {
  vi.clearAllMocks();
  BM_fake.BM_windows.length = 0;
  BM_fake.BM_sessions.length = 0;
  BM_root = await fs.mkdtemp(path.join(os.tmpdir(), 'BM_login_test_'));
  BM_owner = Object.assign(new EventEmitter(), {
    webContents: { id: 1 },
  }) as unknown as BrowserWindow;
});
afterEach(async () => {
  await fs.rm(BM_root, { recursive: true, force: true });
});
it('isolates a sandboxed official login window and persists only after confirmed creation', async () => {
  const BM_login = new BM_Login();
  await BM_login.BM_open(BM_owner, BM_root);
  const BM_window = BM_fake.BM_windows[0] as BrowserWindow & { BM_options: unknown };
  const BM_session = BM_fake.BM_sessions[0] as {
    cookies: { flushStore: ReturnType<typeof vi.fn> };
    clearStorageData: ReturnType<typeof vi.fn>;
    BM_path: string;
  };
  expect(BM_window.BM_options).toMatchObject({
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false,
    },
  });
  expect((await fs.stat(BM_session.BM_path)).mode & 0o077).toBe(0);
  const BM_redirect = { preventDefault: vi.fn(), url: 'https://example.com/', isMainFrame: true };
  BM_window.webContents.emit('will-redirect', BM_redirect);
  expect(BM_redirect.preventDefault).toHaveBeenCalled();
  await BM_login.BM_open(BM_owner, BM_root);
  expect(BM_fake.BM_windows).toHaveLength(1);
  const BM_result = await BM_login.BM_confirm(BM_owner);
  expect(JSON.stringify(BM_result)).not.toContain(BM_root);
  expect((await BM_login.BM_works(BM_owner, 'refresh')).BM_status).toBe('ready');
  const BM_file = await BM_login.BM_save(BM_owner, null, {
    BM_works: ['123456789'],
    BM_deny_contains: [],
  });
  expect(JSON.parse(await fs.readFile(BM_file, 'utf8')).BM_rules.BM_account).toBe('BM_id');
  const BM_data = JSON.parse(await fs.readFile(BM_file, 'utf8')).BM_data_dir;
  const BM_cookieFile = path.join(path.dirname(BM_data), 'BM_cookies.local.json');
  expect((await fs.stat(BM_cookieFile)).mode & 0o077).toBe(0);
  expect(JSON.parse(await fs.readFile(BM_cookieFile, 'utf8'))[0].name).toBe('BM_cookie');
  expect(BM_session.cookies.flushStore).toHaveBeenCalled();
  expect(BM_session.clearStorageData).not.toHaveBeenCalled();
  expect(BM_window.isDestroyed()).toBe(true);
});
it('rejects another renderer and clears authentication when creation is cancelled', async () => {
  const BM_login = new BM_Login();
  await BM_login.BM_open(BM_owner, BM_root);
  const BM_other = { webContents: { id: 2 } } as BrowserWindow;
  expect(await BM_login.BM_confirm(BM_other)).toEqual({
    BM_status: 'failed',
    BM_code: 'BM_window_unavailable',
  });
  await BM_login.BM_cancel(BM_owner);
  expect(
    (BM_fake.BM_sessions[0] as { clearStorageData: ReturnType<typeof vi.fn> }).clearStorageData
  ).toHaveBeenCalled();
  await expect(
    BM_login.BM_save(BM_owner, null, { BM_works: ['123456789'], BM_deny_contains: [] })
  ).rejects.toThrow();
});
it('queues cancellation while the login window is still opening', async () => {
  const BM_login = new BM_Login();
  const BM_opening = BM_login.BM_open(BM_owner, BM_root);
  const BM_cancelling = BM_login.BM_cancel(BM_owner);
  await Promise.all([BM_opening, BM_cancelling]);
  expect((BM_fake.BM_windows[0] as BrowserWindow).isDestroyed()).toBe(true);
  expect(
    (BM_fake.BM_sessions[0] as { clearStorageData: ReturnType<typeof vi.fn> }).clearStorageData
  ).toHaveBeenCalled();
});
it('retains observed works across more loads and refuses unobserved IDs or switched owners', async () => {
  const BM_login = new BM_Login();
  await BM_login.BM_open(BM_owner, BM_root);
  await BM_login.BM_confirm(BM_owner);
  await expect(
    BM_login.BM_save(BM_owner, null, { BM_works: ['123456789'], BM_deny_contains: [] })
  ).rejects.toThrow();
  const BM_first = await BM_login.BM_works(BM_owner, 'refresh');
  const BM_more = await BM_login.BM_works(BM_owner, 'more');
  expect(BM_first).toMatchObject({ BM_status: 'ready', BM_complete: false });
  expect(BM_more.BM_status === 'ready' && BM_more.BM_items.length).toBe(24);
  await expect(
    BM_login.BM_save(BM_owner, null, { BM_works: ['999999999'], BM_deny_contains: [] })
  ).rejects.toThrow();
  const BM_window = BM_fake.BM_windows[0] as BrowserWindow;
  vi.mocked(BM_window.webContents.executeJavaScript).mockResolvedValue({
    BM_status: 'authenticated',
    BM_account: { BM_display_name: 'BM other', BM_douyin_id: 'BM_other' },
  });
  expect(await BM_login.BM_works(BM_owner, 'refresh')).toEqual({
    BM_status: 'failed',
    BM_code: 'BM_works_login_changed',
  });
});
it('rejects switched accounts and does not expose page exceptions', async () => {
  const BM_login = new BM_Login();
  await BM_login.BM_open(BM_owner, BM_root);
  await BM_login.BM_confirm(BM_owner);
  await BM_login.BM_works(BM_owner, 'refresh');
  const BM_window = BM_fake.BM_windows[0] as BrowserWindow;
  vi.mocked(BM_window.webContents.executeJavaScript).mockResolvedValue({
    BM_status: 'authenticated',
    BM_account: { BM_display_name: 'BM other', BM_douyin_id: 'BM_other' },
  });
  await expect(
    BM_login.BM_save(BM_owner, null, { BM_works: ['123456789'], BM_deny_contains: [] })
  ).rejects.toThrow();
  vi.mocked(BM_window.webContents.executeJavaScript).mockRejectedValue(
    new Error('BM secret page exception')
  );
  expect(await BM_login.BM_confirm(BM_owner)).toEqual({
    BM_status: 'failed',
    BM_code: 'BM_page_read_failed',
  });
});
it('reports a missing header without leaking an earlier observed account', async () => {
  const BM_login = new BM_Login();
  await BM_login.BM_open(BM_owner, BM_root);
  await BM_login.BM_confirm(BM_owner);
  const BM_window = BM_fake.BM_windows[0] as BrowserWindow;
  vi.mocked(BM_window.webContents.executeJavaScript).mockResolvedValue({
    BM_status: 'failed',
    BM_code: 'BM_account_header_missing',
  });
  expect(await BM_login.BM_confirm(BM_owner)).toEqual({
    BM_status: 'failed',
    BM_code: 'BM_account_header_missing',
  });
  await expect(
    BM_login.BM_save(BM_owner, null, { BM_works: ['123456789'], BM_deny_contains: [] })
  ).rejects.toThrow();
});
it('bounds a stuck page read and releases the cancellation queue', async () => {
  const BM_login = new BM_Login();
  await BM_login.BM_open(BM_owner, BM_root);
  const BM_window = BM_fake.BM_windows[0] as BrowserWindow;
  vi.mocked(BM_window.webContents.executeJavaScript).mockImplementation(
    () => new Promise(() => {})
  );
  vi.useFakeTimers();
  try {
    const BM_confirmation = BM_login.BM_confirm(BM_owner);
    const BM_cancellation = BM_login.BM_cancel(BM_owner);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await BM_confirmation).toEqual({ BM_status: 'failed', BM_code: 'BM_read_timeout' });
    await BM_cancellation;
    expect(BM_window.isDestroyed()).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it('extracts only a visible unambiguous official account header', () => {
  document.body.innerHTML =
    '<main><div><button>BM nickname</button><span>抖音号：BM_id</span></div></main>';
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as ReturnType<
    Element['getClientRects']
  >);
  const BM_read = new Function(
    'location',
    'document',
    'getComputedStyle',
    `return ${BM_readAccountScript}`
  );
  const BM_location = { origin: 'https://creator.douyin.com', pathname: '/creator-micro/home' };
  expect(BM_read(BM_location, document, window.getComputedStyle)).toEqual({
    BM_status: 'authenticated',
    BM_account: { BM_display_name: 'BM nickname', BM_douyin_id: 'BM_id' },
  });
  document.body.innerHTML =
    '<main><div class=header-BM_test><div class=left-BM_test><div class=name-BM_test>BM nickname</div></div><div class=unique_id-BM_test><span>抖音号：<strong>BM_id</strong><svg><path /></svg></span></div></div></main>';
  expect(BM_read(BM_location, document, window.getComputedStyle)).toEqual({
    BM_status: 'authenticated',
    BM_account: { BM_display_name: 'BM nickname', BM_douyin_id: 'BM_id' },
  });
  expect(
    BM_read({ ...BM_location, origin: 'https://example.com' }, document, window.getComputedStyle)
  ).toEqual({ BM_status: 'failed', BM_code: 'BM_not_creator_home' });
  document.querySelector('main')?.insertAdjacentHTML('beforeend', '<span>抖音号：BM_other</span>');
  expect(BM_read(BM_location, document, window.getComputedStyle)).toEqual({
    BM_status: 'failed',
    BM_code: 'BM_account_header_ambiguous',
  });
  vi.restoreAllMocks();
  for (const BM_url of [
    'http://creator.douyin.com',
    'https://douyin.com.evil.test',
    'file:///tmp/BM_page',
    'https://user@douyin.com',
  ])
    expect(BM_allowedLoginUrl(BM_url)).toBe(false);
  expect(BM_allowedLoginUrl('https://creator.douyin.com/')).toBe(true);
});
it('reads both official homepage name layouts without treating action buttons as a nickname', () => {
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as ReturnType<
    Element['getClientRects']
  >);
  const BM_read = new Function(
    'location',
    'document',
    'getComputedStyle',
    `return ${BM_readAccountScript}`
  );
  const BM_location = { origin: 'https://creator.douyin.com', pathname: '/creator-micro/home' };
  try {
    for (const BM_nameMarkup of [
      '<div class="name-BM_example">BM nickname</div>',
      '<button class="account-trigger-BM_example"><span class="name-BM_example">BM nickname</span><span aria-hidden="true"><svg /></span></button>',
    ]) {
      document.body.innerHTML = `<main><div class="header-BM_example"><div class="left-BM_example">${BM_nameMarkup}<button>BM other action</button></div><div class="unique_id-BM_example">抖音号：BM_id</div><button>BM unrelated action</button></div></main>`;
      expect(BM_read(BM_location, document, window.getComputedStyle)).toEqual({
        BM_status: 'authenticated',
        BM_account: { BM_display_name: 'BM nickname', BM_douyin_id: 'BM_id' },
      });
    }
    document
      .querySelector('[class^="left-"]')
      ?.insertAdjacentHTML('beforeend', '<div class="name-BM_duplicate">BM other nickname</div>');
    expect(BM_read(BM_location, document, window.getComputedStyle)).toEqual({
      BM_status: 'failed',
      BM_code: 'BM_account_name_missing',
    });
    document.querySelectorAll('[class^="name-"]').forEach((BM_el) => BM_el.remove());
    expect(BM_read(BM_location, document, window.getComputedStyle)).toEqual({
      BM_status: 'failed',
      BM_code: 'BM_account_name_missing',
    });
  } finally {
    vi.restoreAllMocks();
  }
});
