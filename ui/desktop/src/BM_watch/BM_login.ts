import { BrowserWindow, session } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BM_loginMessages, type BM_LoginCode, type BM_LoginResult } from './BM_loginStatus';
export type { BM_LoginResult } from './BM_loginStatus';
import {
  BM_accountSchema,
  BM_privateDirectory,
  BM_saveConfig,
  type BM_Account,
  type BM_CreateConfig,
} from './BM_privateConfig';

export const BM_creatorUrl = 'https://creator.douyin.com/creator-micro/home';
export function BM_allowedLoginUrl(BM_value: string): boolean {
  try {
    const BM_url = new URL(BM_value);
    return (
      BM_url.protocol === 'https:' &&
      !BM_url.username &&
      !BM_url.password &&
      !BM_url.port &&
      (BM_url.hostname === 'douyin.com' || BM_url.hostname.endsWith('.douyin.com'))
    );
  } catch {
    return false;
  }
}

// Only inspect visible official-page elements, never cookies, page globals or undocumented APIs.
export const BM_readAccountScript = `(() => {
  const BM_fail = BM_code => ({BM_status:'failed', BM_code});
  if (location.origin !== 'https://creator.douyin.com' ||
      !['/', '/creator-micro/home'].includes(location.pathname.replace(/\\/$/, '') || '/'))
    return BM_fail('BM_not_creator_home');
  if (document.readyState === 'loading') return BM_fail('BM_page_loading');
  const BM_visible = BM_el => BM_el.getClientRects().length > 0 &&
    getComputedStyle(BM_el).visibility !== 'hidden';
  const BM_text = BM_el => (BM_el.innerText ?? BM_el.textContent ?? '').trim();
  const BM_matches = [...document.querySelectorAll('main *')].filter(BM_el =>
    /^抖音号[：:]/.test(BM_text(BM_el)) && BM_visible(BM_el));
  // Keep the deepest matching label; ancestor wrappers and icon children are not extra accounts.
  const BM_labels = BM_matches.filter(BM_el => !BM_matches.some(BM_child =>
    BM_child !== BM_el && BM_el.contains(BM_child)));
  if (!BM_labels.length) {
    const BM_login = [...document.querySelectorAll('button,[role="button"]')].some(BM_el =>
      BM_visible(BM_el) && /登录/.test(BM_text(BM_el)));
    return BM_fail(BM_login ? 'BM_login_required' : 'BM_account_header_missing');
  }
  if (BM_labels.length !== 1) return BM_fail('BM_account_header_ambiguous');
  const BM_label = BM_labels[0];
  // Official home component: header > left > name (div, or span inside account-trigger).
  // Match CSS module field prefixes, not version-specific hashes or arbitrary nearby text.
  const BM_class = (BM_el, BM_field) => [...BM_el.classList].some(BM_token =>
    BM_token === BM_field || BM_token.startsWith(BM_field + '-'));
  let BM_idRegion = BM_label;
  for (let BM_level = 0; BM_level < 3 && BM_idRegion; BM_level++, BM_idRegion = BM_idRegion.parentElement) {
    if (!BM_class(BM_idRegion, 'unique_id')) continue;
    const BM_header = BM_idRegion.parentElement;
    if (!BM_header || !BM_class(BM_header, 'header')) return BM_fail('BM_account_name_missing');
    const BM_left = [...BM_header.children].filter(BM_el => BM_class(BM_el, 'left'));
    if (BM_left.length !== 1) return BM_fail('BM_account_name_missing');
    const BM_names = [...BM_left[0].querySelectorAll('*')].filter(BM_el =>
      BM_class(BM_el, 'name') && BM_visible(BM_el) && BM_text(BM_el));
    if (BM_names.length !== 1) return BM_fail('BM_account_name_missing');
    return {BM_status:'authenticated', BM_account:{
      BM_display_name: BM_text(BM_names[0]),
      BM_douyin_id: BM_text(BM_label).replace(/^抖音号[：:]\\s*/, '').trim()}};
  }
  // Retain the previously verified direct-parent nickname button layout.
  const BM_parent = BM_label.parentElement;
  if (BM_parent && BM_parent.tagName !== 'MAIN') {
    const BM_buttons = [...BM_parent.querySelectorAll('button,[role="button"]')].filter(BM_el =>
      BM_visible(BM_el) && BM_text(BM_el));
    if (BM_buttons.length === 1) return {BM_status:'authenticated', BM_account:{
      BM_display_name: BM_text(BM_buttons[0]),
      BM_douyin_id: BM_text(BM_label).replace(/^抖音号[：:]\\s*/, '').trim()}};
  }
  return BM_fail('BM_account_name_missing');
})()`;

class BM_LoginError extends Error {
  constructor(readonly BM_code: BM_LoginCode) {
    super(BM_loginMessages[BM_code]);
  }
}

async function BM_withReadTimeout<T>(BM_work: Promise<T>): Promise<T> {
  let BM_timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      BM_work,
      new Promise<never>((_BM_resolve, BM_reject) => {
        BM_timer = setTimeout(() => BM_reject(new BM_LoginError('BM_read_timeout')), 8000);
      }),
    ]);
  } finally {
    if (BM_timer) clearTimeout(BM_timer);
  }
}

export class BM_Login {
  private BM_pending?: {
    BM_window: BrowserWindow;
    BM_owner: number;
    BM_dir: string;
    BM_account?: BM_Account;
  };
  private BM_operation: Promise<unknown> = Promise.resolve();

  private BM_serial<T>(BM_work: () => Promise<T>): Promise<T> {
    const BM_task = this.BM_operation.then(async () => {
      try {
        return await BM_work();
      } catch {
        throw new Error('扫码配置操作未完成，请检查官方页面、账号及私有目录权限');
      }
    });
    this.BM_operation = BM_task.catch(() => undefined);
    return BM_task;
  }
  private BM_owned(BM_owner: BrowserWindow) {
    const BM_value = this.BM_pending;
    if (
      !BM_value ||
      BM_value.BM_owner !== BM_owner.webContents.id ||
      BM_value.BM_window.isDestroyed()
    )
      throw new BM_LoginError('BM_window_unavailable');
    return BM_value;
  }
  async BM_open(BM_owner: BrowserWindow, BM_root: string): Promise<BM_LoginResult> {
    return this.BM_serial(async () => {
      if (this.BM_pending && !this.BM_pending.BM_window.isDestroyed()) {
        const BM_existing = this.BM_owned(BM_owner);
        BM_existing.BM_window.show();
        return BM_existing.BM_account
          ? { BM_status: 'authenticated', BM_account: BM_existing.BM_account }
          : { BM_status: 'opened' };
      }
      await BM_privateDirectory(BM_root);
      const BM_dir = await BM_privateDirectory(path.join(BM_root, `BM_profile_${randomUUID()}`));
      const BM_browser = await BM_privateDirectory(path.join(BM_dir, 'BM_browser'));
      const BM_session = session.fromPath(BM_browser, { cache: false });
      BM_session.setPermissionRequestHandler((_BM_contents, _BM_permission, BM_callback) =>
        BM_callback(false)
      );
      BM_session.setPermissionCheckHandler(() => false);
      BM_session.on('will-download', (BM_event) => BM_event.preventDefault());
      const BM_window = new BrowserWindow({
        title: '抖音扫码登录 · 私有配置',
        width: 1100,
        height: 800,
        webPreferences: {
          session: BM_session,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          devTools: false,
        },
      });
      const BM_ownerClosed = () => {
        if (!BM_window.isDestroyed()) BM_window.close();
      };
      BM_owner.once('closed', BM_ownerClosed);
      BM_window.once('closed', () => BM_owner.removeListener('closed', BM_ownerClosed));
      BM_window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      BM_window.webContents.on('will-navigate', (BM_navigation) => {
        if (!BM_allowedLoginUrl(BM_navigation.url)) BM_navigation.preventDefault();
      });
      BM_window.webContents.on('will-redirect', (BM_navigation) => {
        if (BM_navigation.isMainFrame && !BM_allowedLoginUrl(BM_navigation.url))
          BM_navigation.preventDefault();
      });
      this.BM_pending = { BM_window, BM_owner: BM_owner.webContents.id, BM_dir };
      // A manually closed, unfinished login does not keep reusable authentication data.
      BM_window.on('closed', () => {
        if (this.BM_pending?.BM_window === BM_window) {
          this.BM_pending = undefined;
          void BM_session.clearStorageData().catch(() => undefined);
        }
      });
      try {
        await BM_window.loadURL(BM_creatorUrl);
      } catch {
        BM_window.close();
        throw new Error('无法打开抖音官方页面，请检查网络后重试', { cause: undefined });
      }
      return { BM_status: 'opened' };
    });
  }
  private async BM_observe(BM_window: BrowserWindow): Promise<BM_Account> {
    const BM_url = new URL(BM_window.webContents.getURL());
    if (
      BM_url.origin !== 'https://creator.douyin.com' ||
      !['/', '/creator-micro/home'].includes(BM_url.pathname.replace(/\/$/, '') || '/')
    )
      throw new BM_LoginError('BM_not_creator_home');
    const BM_observation = await BM_withReadTimeout(
      BM_window.webContents.executeJavaScript(BM_readAccountScript)
    );
    if (
      BM_observation?.BM_status === 'failed' &&
      typeof BM_observation.BM_code === 'string' &&
      Object.hasOwn(BM_loginMessages, BM_observation.BM_code)
    )
      throw new BM_LoginError(BM_observation.BM_code as BM_LoginCode);
    const BM_result = BM_accountSchema.safeParse(BM_observation?.BM_account);
    if (!BM_result.success) throw new BM_LoginError('BM_account_header_missing');
    return BM_result.data;
  }
  async BM_confirm(BM_owner: BrowserWindow): Promise<BM_LoginResult> {
    return this.BM_serial(async () => {
      try {
        const BM_value = this.BM_owned(BM_owner);
        BM_value.BM_account = undefined;
        BM_value.BM_account = await this.BM_observe(BM_value.BM_window);
        console.info('[BM_watch] login confirm: authenticated');
        return { BM_status: 'authenticated', BM_account: BM_value.BM_account };
      } catch (BM_error) {
        const BM_code =
          BM_error instanceof BM_LoginError ? BM_error.BM_code : 'BM_page_read_failed';
        console.info('[BM_watch] login confirm:', BM_code);
        return { BM_status: 'failed', BM_code };
      }
    });
  }
  async BM_save(
    BM_owner: BrowserWindow,
    BM_gooseRoot: string | null,
    BM_input: BM_CreateConfig
  ): Promise<string> {
    return this.BM_serial(async () => {
      const BM_value = this.BM_owned(BM_owner);
      if (!BM_value.BM_account) throw new Error('请先确认扫码账号');
      const BM_account = await this.BM_observe(BM_value.BM_window);
      if (BM_account.BM_douyin_id !== BM_value.BM_account.BM_douyin_id)
        throw new Error('扫码窗口的账号已变化，请重新确认账号');
      await BM_value.BM_window.webContents.session.cookies.flushStore();
      BM_value.BM_window.webContents.session.flushStorageData();
      const BM_file = await BM_saveConfig(BM_value.BM_dir, BM_gooseRoot, BM_account, BM_input);
      this.BM_pending = undefined;
      BM_value.BM_window.close();
      return BM_file;
    });
  }
  async BM_cancel(BM_owner: BrowserWindow): Promise<BM_LoginResult> {
    return this.BM_serial(async () => {
      if (!this.BM_pending) return { BM_status: 'cancelled' };
      const BM_value = this.BM_owned(BM_owner);
      await BM_value.BM_window.webContents.session.clearStorageData();
      this.BM_pending = undefined;
      BM_value.BM_window.close();
      return { BM_status: 'cancelled' };
    });
  }
}
