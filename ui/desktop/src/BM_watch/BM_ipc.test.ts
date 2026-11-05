import { beforeEach, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent, BrowserWindow } from 'electron';
const BM_handlers = new Map<string, (...BM_args: unknown[]) => unknown>();
const BM_bind = vi.fn();
const BM_snapshot = vi.fn();
const BM_dialog = vi.fn();
beforeEach(() => {
  vi.resetModules();
  BM_handlers.clear();
  vi.clearAllMocks();
  vi.doMock('electron', () => ({
    app: { getPath: () => '/tmp/BM_userData', getAppPath: () => '/tmp/BM_app', isPackaged: false },
    dialog: { showOpenDialog: BM_dialog },
    ipcMain: {
      handle: (BM_name: string, BM_handler: (...BM_args: unknown[]) => unknown) =>
        BM_handlers.set(BM_name, BM_handler),
    },
  }));
  vi.doMock('../gooseServe', () => ({ findGooseBinaryPath: () => '/tmp/BM_bin/goose' }));
  vi.doMock('./BM_manager', () => ({
    BM_WatchManager: class {
      BM_bind = BM_bind;
      BM_snapshot = BM_snapshot;
      BM_action = vi.fn();
      BM_records = vi.fn();
      BM_skip = vi.fn();
    },
  }));
});
it('checks renderer provenance before touching configuration or records', async () => {
  const { BM_registerWatchIpc } = await import('./BM_ipc');
  BM_registerWatchIpc(() => {
    throw new Error('untrusted frame');
  });
  expect(() => BM_handlers.get('BM-watch:snapshot')?.({})).toThrow('untrusted frame');
  await expect(BM_handlers.get('BM-watch:select')?.({})).rejects.toThrow('untrusted frame');
  expect(BM_snapshot).not.toHaveBeenCalled();
  expect(BM_dialog).not.toHaveBeenCalled();
});
it('only binds the file selected by the main-process dialog', async () => {
  const { BM_registerWatchIpc } = await import('./BM_ipc');
  BM_dialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/BM_selected.json'] });
  BM_registerWatchIpc((_BM_event: IpcMainInvokeEvent) => ({}) as BrowserWindow);
  await BM_handlers.get('BM-watch:select')?.({}, '/tmp/BM_renderer_supplied.json');
  expect(BM_bind).toHaveBeenCalledWith('/tmp/BM_selected.json');
});
