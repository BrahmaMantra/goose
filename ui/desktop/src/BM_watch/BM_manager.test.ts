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
let BM_routes: string[];
const BM_token = 'BM_synthetic_control_token_12345';
const BM_rules = {
  BM_account: 'BM_owner',
  BM_works: ['BM_running_work'],
  BM_allow_contains: ['question'],
  BM_max_reply_chars: 200,
};

beforeEach(async () => {
  vi.clearAllMocks();
  BM_routes = [];
  BM_enabled = true;
  BM_extra = false;
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
    if (BM_request.url === '/BM/task') BM_value = { BM_rules, BM_interval_seconds: 30 };
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
    expect(BM_child.unref).toHaveBeenCalledOnce();
  });
});
