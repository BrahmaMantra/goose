import { BrowserWindow, session } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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

// Same visible account-header contract as BM_browser_account.py, with no page-state/API probing.
export const BM_readAccountScript = `(() => {
  if (location.origin !== 'https://creator.douyin.com' ||
      !['/', '/creator-micro/home'].includes(location.pathname)) return null;
  const BM_visible = BM_el => BM_el.getClientRects().length > 0 &&
    getComputedStyle(BM_el).visibility !== 'hidden';
  const BM_labels = [...document.querySelectorAll('main *')].filter(BM_el =>
    BM_el.children.length === 0 && /^抖音号[：:]/.test(BM_el.textContent.trim()) && BM_visible(BM_el));
  if (BM_labels.length !== 1) return null;
  const BM_label = BM_labels[0];
  const BM_buttons = BM_label.parentElement?.querySelectorAll('button');
  if (BM_buttons?.length !== 1 || !BM_visible(BM_buttons[0])) return null;
  return {BM_display_name: BM_buttons[0].textContent.trim(),
    BM_douyin_id: BM_label.textContent.replace(/^抖音号[：:]\\s*/, '').trim()};
})()`;

export type BM_LoginResult = {
  BM_status: 'opened' | 'authenticated' | 'cancelled';
  BM_account?: BM_Account;
};

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
      throw new Error('请重新打开扫码窗口');
    return BM_value;
  }
  async BM_open(BM_owner: BrowserWindow, BM_root: string): Promise<BM_LoginResult> {
    return this.BM_serial(async () => {
      if (this.BM_pending && !this.BM_pending.BM_window.isDestroyed()) {
        const BM_existing = this.BM_owned(BM_owner);
        BM_existing.BM_window.show();
        return {
          BM_status: BM_existing.BM_account ? 'authenticated' : 'opened',
          BM_account: BM_existing.BM_account,
        };
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
      !['/', '/creator-micro/home'].includes(BM_url.pathname)
    )
      throw new Error('请在扫码窗口进入抖音创作者中心首页');
    const BM_result = BM_accountSchema.safeParse(
      await BM_window.webContents.executeJavaScript(BM_readAccountScript)
    );
    if (!BM_result.success) throw new Error('未读取到账号，请完成扫码并等待创作者中心首页加载');
    return BM_result.data;
  }
  async BM_confirm(BM_owner: BrowserWindow): Promise<BM_LoginResult> {
    return this.BM_serial(async () => {
      const BM_value = this.BM_owned(BM_owner);
      BM_value.BM_account = await this.BM_observe(BM_value.BM_window);
      return { BM_status: 'authenticated', BM_account: BM_value.BM_account };
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
