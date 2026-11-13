import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { findGooseBinaryPath } from '../gooseServe';
import { BM_WatchManager } from './BM_manager';
import type { BM_WatchAction } from './BM_types';
import { BM_Login } from './BM_login';
import { BM_createSchema, BM_defaultPrivateRoot } from './BM_privateConfig';
import { z } from 'zod';
import { BM_worksActionSchema } from './BM_works';

export function BM_registerWatchIpc(
  BM_requireWindow: (BM_event: IpcMainInvokeEvent) => BrowserWindow
): void {
  const BM_name = process.platform === 'win32' ? 'BM_watch.exe' : 'BM_watch';
  let BM_binary: string;
  try {
    BM_binary = path.join(
      path.dirname(
        findGooseBinaryPath({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath })
      ),
      BM_name
    );
  } catch {
    BM_binary = path.join(app.getAppPath(), 'src', 'bin', BM_name);
  }
  const BM_manager = new BM_WatchManager(
    path.join(app.getPath('userData'), 'BM_watch.binding.json'),
    BM_binary,
    { BM_executable: process.execPath, BM_app: app.isPackaged ? undefined : app.getAppPath() }
  );
  const BM_login = new BM_Login();
  const BM_gooseRoot =
    process.env.GOOSE_PATH_ROOT && path.isAbsolute(process.env.GOOSE_PATH_ROOT)
      ? process.env.GOOSE_PATH_ROOT
      : null;
  const BM_privateRoot = BM_defaultPrivateRoot(os.homedir(), BM_gooseRoot ?? undefined);
  ipcMain.handle('BM-watch:configs', async (BM_event) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_listConfigs(BM_privateRoot);
  });
  ipcMain.handle('BM-watch:select', async (BM_event, BM_id: unknown) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_selectConfig(BM_id, BM_privateRoot);
  });
  ipcMain.handle('BM-watch:login', async (BM_event, BM_action: unknown) => {
    const BM_window = BM_requireWindow(BM_event);
    const BM_checked = z.enum(['open', 'confirm', 'cancel']).parse(BM_action);
    if (BM_checked === 'cancel') return BM_login.BM_cancel(BM_window);
    if ((await BM_manager.BM_snapshot()).BM_running) throw new Error('请先停止后台，再创建配置');
    if (BM_checked === 'open')
      return BM_login.BM_open(BM_window, await BM_manager.BM_configDirectory(BM_privateRoot));
    return BM_login.BM_confirm(BM_window);
  });
  ipcMain.handle('BM-watch:create', async (BM_event, BM_input: unknown) => {
    const BM_window = BM_requireWindow(BM_event);
    const BM_checked = BM_createSchema.parse(BM_input);
    if ((await BM_manager.BM_snapshot()).BM_running) throw new Error('请先停止后台，再创建配置');
    const BM_file = await BM_login.BM_save(BM_window, BM_gooseRoot, BM_checked);
    return BM_manager.BM_bind(BM_file);
  });
  ipcMain.handle('BM-watch:works', async (BM_event, BM_action: unknown) => {
    const BM_window = BM_requireWindow(BM_event);
    const BM_checked = BM_worksActionSchema.parse(BM_action);
    if ((await BM_manager.BM_snapshot()).BM_running) throw new Error('请先停止后台，再选择作品');
    return BM_login.BM_works(BM_window, BM_checked);
  });
  ipcMain.handle('BM-watch:snapshot', (BM_event) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_snapshot();
  });
  ipcMain.handle('BM-watch:action', (BM_event, BM_action: BM_WatchAction) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_action(BM_action);
  });
  ipcMain.handle('BM-watch:records', (BM_event, BM_before?: number) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_records(BM_before);
  });
  ipcMain.handle('BM-watch:review-policy', (BM_event, BM_enabled: boolean) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_setAutoReview(BM_enabled);
  });
  ipcMain.handle('BM-watch:approve', (BM_event, BM_id: number, BM_reply: string) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_approve(BM_id, BM_reply);
  });
  ipcMain.handle('BM-watch:verify', (BM_event, BM_id: number) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_verify(BM_id);
  });
  ipcMain.handle('BM-watch:default-reply', (BM_event, BM_text: string) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_setDefaultReply(BM_text);
  });
  ipcMain.handle(
    'BM-watch:manual-reply',
    (
      BM_event,
      BM_id: number,
      BM_expected_reply: string | null,
      BM_reply: string,
      BM_mode: import('./BM_types').BM_ManualReplyMode
    ) => {
      BM_requireWindow(BM_event);
      return BM_manager.BM_manualReply(BM_id, BM_expected_reply, BM_reply, BM_mode);
    }
  );
  ipcMain.handle('BM-watch:skip', (BM_event, BM_id: number) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_skip(BM_id);
  });
}
