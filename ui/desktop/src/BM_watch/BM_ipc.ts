import { app, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { findGooseBinaryPath } from '../gooseServe';
import { BM_WatchManager } from './BM_manager';
import type { BM_WatchAction } from './BM_types';

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
    BM_binary
  );
  ipcMain.handle('BM-watch:select', async (BM_event) => {
    const BM_window = BM_requireWindow(BM_event);
    const BM_result = await dialog.showOpenDialog(BM_window, {
      title: '选择评论值守私有配置',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    return BM_result.canceled ? null : BM_manager.BM_bind(BM_result.filePaths[0]);
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
  ipcMain.handle('BM-watch:skip', (BM_event, BM_id: number) => {
    BM_requireWindow(BM_event);
    return BM_manager.BM_skip(BM_id);
  });
}
