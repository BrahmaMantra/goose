import { beforeEach, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent, BrowserWindow } from 'electron';
const BM_handlers = new Map<string, (...BM_args: unknown[]) => unknown>();
const BM_bind = vi.fn();
const BM_snapshot = vi.fn();
const BM_list = vi.fn();
const BM_select = vi.fn();
const BM_loginOpen = vi.fn();
const BM_loginSave = vi.fn();
beforeEach(() => {
  vi.resetModules();
  BM_handlers.clear();
  vi.clearAllMocks();
  vi.doMock('electron', () => ({
    app: { getPath: () => '/tmp/BM_userData', getAppPath: () => '/tmp/BM_app', isPackaged: false },
    ipcMain: {
      handle: (BM_name: string, BM_handler: (...BM_args: unknown[]) => unknown) =>
        BM_handlers.set(BM_name, BM_handler),
    },
  }));
  vi.doMock('../gooseServe', () => ({ findGooseBinaryPath: () => '/tmp/BM_bin/goose' }));
  vi.doMock('./BM_manager', () => ({
    BM_WatchManager: class {
      BM_bind = BM_bind;
      BM_listConfigs = BM_list;
      BM_selectConfig = BM_select;
      BM_snapshot = BM_snapshot;
      BM_action = vi.fn();
      BM_records = vi.fn();
      BM_skip = vi.fn();
      BM_configDirectory = vi.fn(async () => '/tmp/BM_private');
    },
  }));
  vi.doMock('./BM_login', () => ({
    BM_Login: class {
      BM_open = BM_loginOpen;
      BM_confirm = vi.fn();
      BM_cancel = vi.fn();
      BM_save = BM_loginSave;
      BM_works = vi.fn();
    },
  }));
});
it('checks renderer provenance before touching configuration or records', async () => {
  const { BM_registerWatchIpc } = await import('./BM_ipc');
  BM_registerWatchIpc(() => {
    throw new Error('untrusted frame');
  });
  expect(() => BM_handlers.get('BM-watch:snapshot')?.({})).toThrow('untrusted frame');
  expect(() => BM_handlers.get('BM-watch:approve')?.({}, 1, 'BM reply')).toThrow('untrusted frame');
  expect(() => BM_handlers.get('BM-watch:review-policy')?.({}, true)).toThrow('untrusted frame');
  await expect(BM_handlers.get('BM-watch:select')?.({})).rejects.toThrow('untrusted frame');
  expect(BM_snapshot).not.toHaveBeenCalled();
  await expect(BM_handlers.get('BM-watch:configs')?.({})).rejects.toThrow('untrusted frame');
  expect(BM_list).not.toHaveBeenCalled();
  expect(BM_select).not.toHaveBeenCalled();
});
it('lists and selects only through the main-process private root', async () => {
  const { BM_registerWatchIpc } = await import('./BM_ipc');
  BM_registerWatchIpc((_BM_event: IpcMainInvokeEvent) => ({}) as BrowserWindow);
  await BM_handlers.get('BM-watch:configs')?.({});
  await BM_handlers.get('BM-watch:select')?.({}, 'BM_watch.local.json');
  expect(BM_list).toHaveBeenCalledOnce();
  expect(BM_select).toHaveBeenCalledWith('BM_watch.local.json', BM_list.mock.calls[0][0]);
});
it('rejects untrusted login and config creation before opening a browser or writing data', async () => {
  const { BM_registerWatchIpc } = await import('./BM_ipc');
  BM_registerWatchIpc(() => {
    throw new Error('untrusted frame');
  });
  await expect(BM_handlers.get('BM-watch:login')?.({}, 'open')).rejects.toThrow('untrusted frame');
  await expect(BM_handlers.get('BM-watch:create')?.({}, {})).rejects.toThrow('untrusted frame');
  await expect(BM_handlers.get('BM-watch:works')?.({}, 'refresh')).rejects.toThrow(
    'untrusted frame'
  );
  expect(BM_loginOpen).not.toHaveBeenCalled();
  expect(BM_loginSave).not.toHaveBeenCalled();
});
