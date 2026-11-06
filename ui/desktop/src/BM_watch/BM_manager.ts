/* eslint-disable preserve-caught-error -- Do not forward private filesystem causes across the IPC boundary. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { z } from 'zod';
import { BM_outsideCheckout, BM_flattenConfigs } from './BM_privateConfig';
import {
  BM_actionSchema,
  BM_rulesSchema,
  BM_taskSchema,
  BM_recordsSchema,
  BM_statusSchema,
  type BM_WatchAction,
  type BM_Snapshot,
  type BM_Record,
  BM_defaultReplyMarker,
} from './BM_types';

function BM_errorCode(BM_error: unknown): string | undefined {
  return BM_error !== null &&
    typeof BM_error === 'object' &&
    'code' in BM_error &&
    typeof BM_error.code === 'string'
    ? BM_error.code
    : undefined;
}

const BM_configSchema = z
  .object({
    BM_data_dir: z.string().min(1),
    BM_goose_root: z.string().min(1).nullable(),
    BM_admin_token: z.string().min(24),
    BM_webhook_secret: z.string().optional(),
    BM_client_key: z.string().optional(),
    BM_interval_seconds: z.number().int().min(1).default(30),
    BM_batch_size: z.number().int().min(1).max(100).default(10),
    BM_port: z.number().int().min(1).max(65535).default(8791),
    BM_rules: BM_rulesSchema,
  })
  .strict();
type BM_Config = z.infer<typeof BM_configSchema>;

export class BM_WatchManager {
  private BM_pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly BM_bindingFile: string,
    private readonly BM_binary: string
  ) {}

  private async BM_privateRead(BM_file: string): Promise<string> {
    const BM_handle = await fs.open(BM_file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const BM_stat = await BM_handle.stat();
      if (!BM_stat.isFile() || (BM_stat.mode & 0o077) !== 0 || BM_stat.size > 65536)
        throw new Error('私有配置权限或大小不符合要求');
      return await BM_handle.readFile('utf8');
    } finally {
      await BM_handle.close();
    }
  }
  private async BM_binding(): Promise<string | null> {
    try {
      return z
        .object({ BM_config: z.string().min(1) })
        .strict()
        .parse(JSON.parse(await this.BM_privateRead(this.BM_bindingFile))).BM_config;
    } catch (BM_error) {
      if (BM_errorCode(BM_error) === 'ENOENT') return null;
      throw new Error('无法读取已绑定的私有配置');
    }
  }
  private async BM_outsideCheckout(BM_path: string): Promise<void> {
    return BM_outsideCheckout(BM_path);
  }
  async BM_configDirectory(BM_default: string): Promise<string> {
    try {
      await BM_flattenConfigs(BM_default);
      return BM_default;
    } catch {
      throw new Error('无法准备统一私有配置目录，请检查目录与旧配置权限');
    }
  }
  async BM_bindFromDirectory(BM_file: string, BM_root: string): Promise<BM_Snapshot> {
    try {
      const BM_parent = await fs.realpath(path.dirname(BM_file));
      const BM_directory = await fs.realpath(BM_root);
      if (BM_parent !== BM_directory) throw new Error('请选择统一私有配置目录中的 JSON 文件');
    } catch {
      throw new Error('请选择统一私有配置目录中的有效 JSON 文件');
    }
    return this.BM_bind(BM_file);
  }
  private async BM_config(BM_file: string): Promise<BM_Config> {
    try {
      return BM_configSchema.parse(JSON.parse(await this.BM_privateRead(BM_file)));
    } catch {
      throw new Error('配置不可用，请检查内容和文件权限');
    }
  }
  private BM_serial<T>(BM_work: () => Promise<T>): Promise<T> {
    const BM_task = this.BM_pending.then(BM_work);
    this.BM_pending = BM_task.catch(() => undefined);
    return BM_task;
  }
  async BM_bind(BM_file: string): Promise<BM_Snapshot> {
    return this.BM_serial(async () => {
      if ((await this.BM_snapshot()).BM_running) throw new Error('请先停止后台，再切换配置');
      if (!path.isAbsolute(BM_file)) throw new Error('请选择私有配置文件');
      await this.BM_outsideCheckout(BM_file);
      await this.BM_config(BM_file);
      await fs.mkdir(path.dirname(this.BM_bindingFile), { recursive: true, mode: 0o700 });
      const BM_tmp = `${this.BM_bindingFile}.BM_${randomUUID()}`;
      try {
        await fs.writeFile(BM_tmp, JSON.stringify({ BM_config: BM_file }), {
          mode: 0o600,
          flag: 'wx',
        });
        await fs.rename(BM_tmp, this.BM_bindingFile);
      } finally {
        await fs.rm(BM_tmp, { force: true });
      }
      return this.BM_snapshot();
    });
  }
  private BM_request(
    BM_config: BM_Config,
    BM_route: string,
    BM_method = 'GET',
    BM_body?: unknown,
    BM_timeout = 5000
  ): Promise<unknown> {
    return new Promise((BM_resolve, BM_reject) => {
      const BM_payload = BM_body === undefined ? '' : JSON.stringify(BM_body);
      const BM_request = http.request(
        {
          hostname: '127.0.0.1',
          port: BM_config.BM_port,
          path: BM_route,
          method: BM_method,
          headers: {
            Authorization: `Bearer ${BM_config.BM_admin_token}`,
            ...(BM_payload
              ? {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(BM_payload),
                }
              : {}),
          },
        },
        (BM_response) => {
          const BM_data: Buffer[] = [];
          let BM_size = 0;
          BM_response.on('data', (BM_chunk: Buffer) => {
            BM_size += BM_chunk.length;
            if (BM_size > 8 * 1024 * 1024) BM_request.destroy(new Error('response too large'));
            else BM_data.push(BM_chunk);
          });
          BM_response.on('error', () => BM_reject(new Error('后台响应失败')));
          BM_response.on('end', () => {
            if (BM_response.statusCode !== 200) {
              BM_reject(new Error('后台拒绝操作，请检查配置与记录状态'));
              return;
            }
            try {
              BM_resolve(JSON.parse(Buffer.concat(BM_data).toString('utf8')));
            } catch {
              BM_reject(new Error('后台响应格式不正确'));
            }
          });
        }
      );
      BM_request.on('error', () => BM_reject(new Error('后台未连接')));
      BM_request.setTimeout(BM_timeout, () => BM_request.destroy(new Error('timeout')));
      BM_request.end(BM_payload);
    });
  }
  async BM_snapshot(): Promise<BM_Snapshot> {
    const BM_file = await this.BM_binding();
    const BM_base: BM_Snapshot = {
      BM_configured: false,
      BM_config_name: '',
      BM_running: false,
      BM_enabled: false,
      BM_counts: {},
      BM_account: '',
      BM_works: [],
      BM_deny_contains: [],
      BM_reply_marker: BM_defaultReplyMarker,
      BM_max_reply_chars: 0,
      BM_interval_seconds: 30,
    };
    if (!BM_file) return BM_base;
    const BM_config = await this.BM_config(BM_file);
    Object.assign(BM_base, {
      BM_configured: true,
      BM_config_name: path.basename(BM_file),
      BM_account: BM_config.BM_rules.BM_account,
      BM_works: BM_config.BM_rules.BM_works,
      BM_deny_contains: BM_config.BM_rules.BM_deny_contains,
      BM_reply_marker: BM_config.BM_rules.BM_reply_marker,
      BM_max_reply_chars: BM_config.BM_rules.BM_max_reply_chars,
      BM_interval_seconds: BM_config.BM_interval_seconds,
    });
    try {
      const BM_status = BM_statusSchema.parse(await this.BM_request(BM_config, '/BM/status'));
      const BM_taskRaw = await this.BM_request(BM_config, '/BM/task');
      const BM_task = BM_taskSchema.parse(BM_taskRaw);
      const BM_requires_restart = !(
        'BM_deny_contains' in (BM_taskRaw as { BM_rules: Record<string, unknown> }).BM_rules &&
        'BM_reply_marker' in (BM_taskRaw as { BM_rules: Record<string, unknown> }).BM_rules
      );
      return {
        ...BM_base,
        ...BM_status,
        ...BM_task.BM_rules,
        BM_interval_seconds: BM_task.BM_interval_seconds,
        BM_running: true,
        BM_requires_restart,
      };
    } catch {
      return { ...BM_base, BM_error: '后台未连接；可启动后台或检查私有配置' };
    }
  }
  async BM_action(BM_action: BM_WatchAction): Promise<BM_Snapshot> {
    const BM_checked = BM_actionSchema.parse(BM_action);
    return this.BM_serial(async () => {
      const BM_file = await this.BM_binding();
      if (!BM_file) throw new Error('请先选择私有配置');
      const BM_config = await this.BM_config(BM_file);
      if (BM_checked === 'start') {
        if ((await this.BM_snapshot()).BM_running) return this.BM_snapshot();
        await this.BM_launch(BM_file, BM_config);
        const BM_deadline = Date.now() + 12000;
        while (Date.now() < BM_deadline) {
          try {
            BM_statusSchema.parse(
              await this.BM_request(BM_config, '/BM/status', 'GET', undefined, 1000)
            );
            return this.BM_snapshot();
          } catch {
            await new Promise((BM_resolve) => setTimeout(BM_resolve, 200));
          }
        }
        throw new Error('后台启动失败，请检查私有日志或端口');
      }
      if (BM_checked === 'resume' && (await this.BM_snapshot()).BM_requires_restart)
        throw new Error('后台版本较旧，请先停止并重新启动后台，以使用新的触发规则');
      await this.BM_request(BM_config, `/BM/${BM_checked}`, 'POST');
      if (BM_checked === 'shutdown')
        return {
          ...(await this.BM_snapshot()),
          BM_running: false,
          BM_enabled: false,
          BM_counts: {},
        };
      return this.BM_snapshot();
    });
  }
  private async BM_launch(BM_file: string, BM_config: BM_Config): Promise<void> {
    await fs.access(this.BM_binary, constants.X_OK);
    if (BM_config.BM_goose_root) await this.BM_outsideCheckout(BM_config.BM_goose_root);
    await this.BM_outsideCheckout(BM_config.BM_data_dir);
    await fs.mkdir(BM_config.BM_data_dir, { recursive: true, mode: 0o700 });
    const BM_dir = await fs.lstat(BM_config.BM_data_dir);
    if (!BM_dir.isDirectory() || BM_dir.isSymbolicLink() || (BM_dir.mode & 0o077) !== 0)
      throw new Error('数据目录必须为私有目录');
    const BM_out = await fs.open(
      path.join(BM_config.BM_data_dir, 'BM_desktop.stdout.log'),
      constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
      0o600
    );
    let BM_err: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      BM_err = await fs.open(
        path.join(BM_config.BM_data_dir, 'BM_desktop.stderr.log'),
        constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
        0o600
      );
      if (((await BM_out.stat()).mode & 0o077) !== 0 || ((await BM_err.stat()).mode & 0o077) !== 0)
        throw new Error('日志文件必须为私有文件');
      const BM_child = spawn(this.BM_binary, ['--config', BM_file], {
        detached: true,
        stdio: ['ignore', BM_out.fd, BM_err.fd],
        env: { ...process.env },
      });
      await once(BM_child, 'spawn');
      BM_child.unref();
    } catch {
      throw new Error('后台启动失败，请先构建后台程序');
    } finally {
      await BM_out.close();
      await BM_err?.close();
    }
  }
  async BM_records(BM_before?: number): Promise<BM_Record[]> {
    if (BM_before !== undefined)
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(BM_before);
    const BM_file = await this.BM_binding();
    if (!BM_file) return [];
    const BM_config = await this.BM_config(BM_file);
    return BM_recordsSchema.parse(
      await this.BM_request(BM_config, `/BM/records${BM_before ? `?BM_before=${BM_before}` : ''}`)
    ).BM_records;
  }
  async BM_skip(BM_id: number): Promise<void> {
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(BM_id);
    const BM_file = await this.BM_binding();
    if (!BM_file) throw new Error('请先选择私有配置');
    await this.BM_request(await this.BM_config(BM_file), '/BM/skip', 'POST', { BM_id });
  }
}
