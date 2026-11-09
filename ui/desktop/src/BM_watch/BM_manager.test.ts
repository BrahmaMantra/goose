import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { BM_WatchManager } from './BM_manager';

vi.mock('node:child_process', async (BM_importOriginal) => {
  const BM_actual = await BM_importOriginal<typeof import('node:child_process')>();
  const BM_spawn = vi.fn();
  return { ...BM_actual, spawn: BM_spawn, default: { ...BM_actual, spawn: BM_spawn } };
});
let BM_root: string;
let BM_file: string;
let BM_binding: string;
let BM_binary: string;
let BM_server: http.Server;
let BM_manager: BM_WatchManager;
let BM_port: number;
let BM_enabled: boolean;
let BM_extra: boolean;
let BM_legacyTask: boolean;
let BM_routes: string[];
const BM_token = 'BM_synthetic_control_token_12345';
const BM_rules = {
  BM_account: 'BM_owner',
  BM_works: ['BM_running_work'],
  BM_deny_contains: ['question'],
  BM_max_reply_chars: 200,
  BM_reply_marker: '【from DeepSeek-V4.1-Flash-1017】',
};

beforeEach(async () => {
  vi.clearAllMocks();
  BM_routes = [];
  BM_enabled = true;
  BM_extra = false;
  BM_legacyTask = false;
  BM_root = await fs.mkdtemp(path.join(os.tmpdir(), 'BM_desktop_'));
  BM_file = path.join(BM_root, 'BM_watch.local.json');
  BM_binding = path.join(BM_root, 'BM_binding.json');
  BM_binary = path.join(BM_root, 'BM_watch');
  BM_server = http.createServer((BM_request, BM_response) => {
    BM_routes.push(BM_request.url ?? '');
    expect(BM_request.headers.authorization).toBe(`Bearer ${BM_token}`);
    let BM_value: unknown = {};
    if (BM_request.url === '/BM/status')
      BM_value = {
        BM_enabled,
        BM_counts: { review: 1 },
        BM_pid: 12345,
        ...(BM_extra ? { BM_admin_token: BM_token } : {}),
      };
    if (BM_request.url === '/BM/task')
      BM_value = {
        BM_rules: BM_legacyTask
          ? {
              BM_account: BM_rules.BM_account,
              BM_works: BM_rules.BM_works,
              BM_allow_contains: ['/clear'],
              BM_max_reply_chars: 200,
            }
          : BM_rules,
        BM_interval_seconds: 30,
      };
    if (BM_request.url?.startsWith('/BM/records')) BM_value = { BM_records: [] };
    if (BM_request.url === '/BM/pause') {
      BM_enabled = false;
      BM_value = { BM_enabled };
    }
    if (BM_request.url === '/BM/resume') {
      BM_enabled = true;
      BM_value = { BM_enabled };
    }
    BM_response.setHeader('Content-Type', 'application/json');
    BM_response.end(JSON.stringify(BM_value));
  });
  await new Promise<void>((BM_resolve) => BM_server.listen(0, '127.0.0.1', BM_resolve));
  BM_port = (BM_server.address() as { port: number }).port;
  await fs.writeFile(
    BM_file,
    JSON.stringify({
      BM_data_dir: path.join(BM_root, 'BM_data'),
      BM_goose_root: BM_root,
      BM_admin_token: BM_token,
      BM_port,
      BM_rules: { ...BM_rules, BM_works: ['BM_config_work'] },
    }),
    { mode: 0o600 }
  );
  await fs.writeFile(BM_binary, '', { mode: 0o700 });
  BM_manager = new BM_WatchManager(BM_binding, BM_binary);
});
afterEach(async () => {
  await new Promise<void>((BM_resolve) => BM_server.close(() => BM_resolve()));
  await fs.rm(BM_root, { recursive: true, force: true });
});

describe('BM desktop manager boundary', () => {
  it('keeps old backends controllable but refuses resume until rules are upgraded', async () => {
    BM_legacyTask = true;
    const BM_snapshot = await BM_manager.BM_bind(BM_file);
    expect(BM_snapshot.BM_requires_restart).toBe(true);
    expect(BM_snapshot.BM_deny_contains).toEqual(['/clear']);
    await BM_manager.BM_action('pause');
    await expect(BM_manager.BM_action('resume')).rejects.toThrow('旧');
    expect(BM_routes).not.toContain('/BM/resume');
  });
  it('lists private configs without credentials or paths, and validates selection IDs', async () => {
    const BM_other = path.join(BM_root, 'BM_watch_0123456789abcdef.local.json');
    await fs.copyFile(BM_file, BM_other);
    await fs.chmod(BM_other, 0o600);
    await fs.writeFile(path.join(BM_root, 'BM_watch_1111111111111111.local.json'), '{}', {
      mode: 0o600,
    });
    await fs.writeFile(path.join(BM_root, 'BM_account.local.json'), '{}', { mode: 0o600 });
    const BM_list = await BM_manager.BM_listConfigs(BM_root);
    expect(BM_list).toHaveLength(2);
    expect(BM_list[0].BM_work_count).toBe(1);
    expect(JSON.stringify(BM_list)).not.toContain(BM_token);
    expect(JSON.stringify(BM_list)).not.toContain(BM_root);
    for (const BM_bad of ['../BM_watch.local.json', BM_file, 'BM_account.local.json', null])
      await expect(BM_manager.BM_selectConfig(BM_bad, BM_root)).rejects.toThrow('列表');
    const BM_link = path.join(BM_root, 'BM_watch_2222222222222222.local.json');
    await fs.symlink(BM_file, BM_link);
    await expect(BM_manager.BM_selectConfig(path.basename(BM_link), BM_root)).rejects.toThrow();
    await BM_manager.BM_selectConfig('BM_watch.local.json', BM_root);
    expect(
      (await BM_manager.BM_listConfigs(BM_root)).find((BM_entry) => BM_entry.BM_selected)?.BM_id
    ).toBe('BM_watch.local.json');
    await expect(BM_manager.BM_selectConfig(path.basename(BM_other), BM_root)).rejects.toThrow(
      '停止'
    );
  });
  it('reuses the bound directory despite a changed default and migrates legacy configs once', async () => {
    const BM_profile = path.join(BM_root, 'BM_profile_saved');
    await fs.mkdir(BM_profile, { mode: 0o700 });
    const BM_old = path.join(BM_profile, 'BM_watch.local.json');
    const BM_config = JSON.parse(await fs.readFile(BM_file, 'utf8'));
    BM_config.BM_rules.BM_works = ['12345678'];
    await fs.writeFile(BM_old, JSON.stringify(BM_config), { mode: 0o600 });
    await BM_manager.BM_bind(BM_old);
    expect(await BM_manager.BM_configDirectory(path.join(BM_root, 'BM_unused'))).toBe(BM_root);
    const BM_list = await BM_manager.BM_listConfigs(BM_root);
    expect(BM_list.filter((BM_entry) => BM_entry.BM_selected)).toHaveLength(1);
    expect(BM_list.find((BM_entry) => BM_entry.BM_selected)?.BM_id).toMatch(
      /^BM_watch_[a-f0-9]{16}/
    );
    expect(await BM_manager.BM_listConfigs(BM_root)).toEqual(BM_list);
  });
  it.each(['deleted', 'corrupt'])(
    'keeps a %s config manageable after desktop restart',
    async (BM_case) => {
      await BM_manager.BM_bind(BM_file);
      if (BM_case === 'deleted') await fs.rm(BM_file);
      else await fs.writeFile(BM_file, '{}');
      const BM_restarted = new BM_WatchManager(BM_binding, BM_binary);
      const BM_state = await BM_restarted.BM_snapshot();
      expect(BM_state.BM_configured).toBe(false);
      expect(BM_state.BM_running).toBe(true);
      await BM_restarted.BM_action('pause');
      await expect(BM_restarted.BM_action('resume')).rejects.toThrow();
      await BM_restarted.BM_action('shutdown');
      expect(BM_routes).toContain('/BM/shutdown');
      expect(JSON.stringify(BM_state)).not.toContain(BM_token);
    }
  );
  it('projects actual running task without tokens or private paths and persists binding', async () => {
    const BM_snapshot = await BM_manager.BM_bind(BM_file);
    expect(BM_snapshot.BM_running).toBe(true);
    expect(BM_snapshot.BM_works).toEqual(['BM_running_work']);
    expect(JSON.stringify(BM_snapshot)).not.toContain(BM_token);
    expect(JSON.stringify(BM_snapshot)).not.toContain(BM_root);
    expect((await fs.stat(BM_binding)).mode & 0o077).toBe(0);
    expect((await new BM_WatchManager(BM_binding, BM_binary).BM_snapshot()).BM_running).toBe(true);
  });
  it('limits operations and cursor values before making requests', async () => {
    await BM_manager.BM_bind(BM_file);
    const BM_count = BM_routes.length;
    await expect(BM_manager.BM_action('https://example.com/' as never)).rejects.toThrow();
    await expect(BM_manager.BM_records(-1)).rejects.toThrow();
    await expect(BM_manager.BM_skip(NaN)).rejects.toThrow();
    expect(BM_routes).toHaveLength(BM_count);
    expect((await BM_manager.BM_action('pause')).BM_enabled).toBe(false);
    await BM_manager.BM_records(12);
    expect(BM_routes).toContain('/BM/records?BM_before=12');
  });
  it('rejects overly permissive files and keeps unknown response data out of the renderer', async () => {
    await fs.chmod(BM_file, 0o644);
    await expect(BM_manager.BM_bind(BM_file)).rejects.toThrow();
    await fs.chmod(BM_file, 0o600);
    await BM_manager.BM_bind(BM_file);
    BM_extra = true;
    const BM_snapshot = await BM_manager.BM_snapshot();
    expect(BM_snapshot.BM_running).toBe(false);
    expect(JSON.stringify(BM_snapshot)).not.toContain(BM_token);
  });
  it('rejects checkout and symlink configs before persisting selection', async () => {
    const BM_git = path.join(BM_root, 'BM_checkout');
    await fs.mkdir(BM_git);
    await fs.mkdir(path.join(BM_git, '.git'));
    const BM_inside = path.join(BM_git, 'BM_config.json');
    await fs.copyFile(BM_file, BM_inside);
    await fs.chmod(BM_inside, 0o600);
    await expect(BM_manager.BM_bind(BM_inside)).rejects.toThrow();
    const BM_link = path.join(BM_root, 'BM_link.json');
    await fs.symlink(BM_file, BM_link);
    await expect(BM_manager.BM_bind(BM_link)).rejects.toThrow();
  });
  it('reuses an existing service without spawning, and detaches exactly one cold start', async () => {
    BM_manager = new BM_WatchManager(BM_binding, BM_binary, { BM_executable: BM_binary });
    await BM_manager.BM_bind(BM_file);
    await BM_manager.BM_action('start');
    expect(spawn).not.toHaveBeenCalled();
    await new Promise<void>((BM_resolve) => BM_server.close(() => BM_resolve()));
    const BM_child = new EventEmitter() as EventEmitter & { unref: () => void };
    BM_child.unref = vi.fn();
    vi.mocked(spawn).mockImplementation(() => {
      BM_server.listen(BM_port, '127.0.0.1', () => BM_child.emit('spawn'));
      return BM_child as never;
    });
    const BM_results = await Promise.all([
      BM_manager.BM_action('start'),
      BM_manager.BM_action('start'),
    ]);
    expect(BM_results.every((BM_value) => BM_value.BM_running)).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(spawn).mock.calls[0][0]).toBe(BM_binary);
    expect(vi.mocked(spawn).mock.calls[0][1]).toEqual(['--config', BM_file]);
    expect(vi.mocked(spawn).mock.calls[0][2]?.detached).toBe(true);
    const BM_savedReader = path.join(BM_root, 'BM_data', 'BM_reader.local.json');
    expect(JSON.parse(await fs.readFile(BM_savedReader, 'utf8'))).toEqual({
      BM_executable: BM_binary,
    });
    expect((await fs.stat(BM_savedReader)).mode & 0o077).toBe(0);
    expect(BM_child.unref).toHaveBeenCalledOnce();
  });
});
