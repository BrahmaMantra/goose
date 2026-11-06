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
        cookies: { flushStore: vi.fn(async () => undefined) },
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
        getURL: () => 'https://creator.douyin.com/creator-micro/home',
        executeJavaScript: vi.fn(async () => ({
          BM_status: 'authenticated',
          BM_account: { BM_display_name: 'BM nickname', BM_douyin_id: 'BM_id' },
        })),
        setWindowOpenHandler: vi.fn(),
      });
      BM_fake.BM_windows.push(this);
    }
    isDestroyed() {
      return this.BM_destroyed;
    }
    show() {}
    async loadURL() {}
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
  const BM_file = await BM_login.BM_save(BM_owner, null, {
    BM_works: ['123456789'],
    BM_allow_contains: [],
  });
  expect(JSON.parse(await fs.readFile(BM_file, 'utf8')).BM_rules.BM_account).toBe('BM_id');
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
    BM_login.BM_save(BM_owner, null, { BM_works: ['123456789'], BM_allow_contains: [] })
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
it('rejects switched accounts and does not expose page exceptions', async () => {
  const BM_login = new BM_Login();
  await BM_login.BM_open(BM_owner, BM_root);
  await BM_login.BM_confirm(BM_owner);
  const BM_window = BM_fake.BM_windows[0] as BrowserWindow;
  vi.mocked(BM_window.webContents.executeJavaScript).mockResolvedValue({
    BM_status: 'authenticated',
    BM_account: { BM_display_name: 'BM other', BM_douyin_id: 'BM_other' },
  });
  await expect(
    BM_login.BM_save(BM_owner, null, { BM_works: ['123456789'], BM_allow_contains: [] })
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
    BM_login.BM_save(BM_owner, null, { BM_works: ['123456789'], BM_allow_contains: [] })
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
    '<main><section><button>BM nickname</button><div><span>抖音号：<strong>BM_id</strong><svg><path /></svg></span></div></section></main>';
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
