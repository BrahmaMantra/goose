/* eslint-disable preserve-caught-error -- Do not forward private filesystem causes across the IPC boundary. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { z } from 'zod';
import {
  BM_outsideCheckout,
  BM_flattenConfigs,
  BM_flatConfigPath,
  BM_accountSchema,
  BM_privateDirectory,
} from './BM_privateConfig';
import {
  BM_validReply,
  BM_sourceStatusSchema,
  BM_configIdSchema,
  type BM_ConfigEntry,
  BM_actionSchema,
  BM_rulesSchema,
  BM_taskSchema,
  BM_recordsSchema,
  BM_statusSchema,
  type BM_WatchAction,
  type BM_Snapshot,
  type BM_Record,
  BM_defaultReplyMarker,
  BM_defaultManualReply,
  BM_markManualReply,
  BM_validManualReply,
  type BM_ManualReplyMode,
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

const BM_connectionSchema = z.object({
  BM_port: z.number().int().min(1).max(65535).default(8791),
  BM_admin_token: z.string().min(24),
});
type BM_Connection = z.infer<typeof BM_connectionSchema>;
const BM_bindingSchema = z
  .object({
    BM_config: z.string().min(1),
    BM_connection: BM_connectionSchema.optional(),
  })
  .strict();
type BM_Binding = z.infer<typeof BM_bindingSchema>;

export class BM_WatchManager {
  private BM_pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly BM_bindingFile: string,
    private readonly BM_binary: string,
    private readonly BM_readerLauncher?: { BM_executable: string; BM_app?: string }
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
  private async BM_bindingRecord(): Promise<BM_Binding | null> {
    try {
      return BM_bindingSchema.parse(JSON.parse(await this.BM_privateRead(this.BM_bindingFile)));
    } catch (BM_error) {
      if (BM_errorCode(BM_error) === 'ENOENT') return null;
      throw new Error('无法读取已绑定的私有配置');
    }
  }
  private async BM_binding(): Promise<string | null> {
    return (await this.BM_bindingRecord())?.BM_config ?? null;
  }
  private async BM_saveBinding(BM_record: BM_Binding): Promise<void> {
    await fs.mkdir(path.dirname(this.BM_bindingFile), { recursive: true, mode: 0o700 });
    const BM_tmp = `${this.BM_bindingFile}.BM_${randomUUID()}`;
    try {
      await fs.writeFile(BM_tmp, JSON.stringify(BM_record), { mode: 0o600, flag: 'wx' });
      await fs.rename(BM_tmp, this.BM_bindingFile);
    } finally {
      await fs.rm(BM_tmp, { force: true });
    }
  }
  private async BM_connection(): Promise<BM_Connection> {
    const BM_record = await this.BM_bindingRecord();
    if (!BM_record) throw new Error('尚未绑定后台管理连接');
    if (BM_record.BM_connection) return BM_record.BM_connection;
    try {
      const BM_connection = BM_connectionSchema.parse(
        JSON.parse(await this.BM_privateRead(BM_record.BM_config))
      );
      await this.BM_saveBinding({ ...BM_record, BM_connection });
      return BM_connection;
    } catch {
      throw new Error('无法读取后台管理连接，请选择原私有配置');
    }
  }
  private async BM_outsideCheckout(BM_path: string): Promise<void> {
    return BM_outsideCheckout(BM_path);
  }
  async BM_configDirectory(BM_default: string): Promise<string> {
    try {
      const BM_file = await this.BM_binding();
      let BM_directory = BM_file ? path.dirname(BM_file) : BM_default;
      if (/^BM_profile_/.test(path.basename(BM_directory))) {
        BM_directory = path.dirname(BM_directory);
        if (path.basename(BM_directory) === 'BM_profiles')
          BM_directory = path.dirname(BM_directory);
      }
      await BM_flattenConfigs(BM_directory);
      return BM_directory;
    } catch {
      throw new Error('无法准备统一私有配置目录，请检查目录与旧配置权限');
    }
  }
  async BM_listConfigs(BM_default: string): Promise<BM_ConfigEntry[]> {
    const BM_root = await this.BM_configDirectory(BM_default);
    const BM_bound = await this.BM_binding();
    const BM_selected =
      BM_bound && /^BM_profile_/.test(path.basename(path.dirname(BM_bound)))
        ? BM_flatConfigPath(BM_root, path.dirname(BM_bound))
        : BM_bound;
    const BM_result: BM_ConfigEntry[] = [];
    for (const BM_file of await fs.readdir(BM_root, { withFileTypes: true })) {
      if (!BM_file.isFile() || !BM_configIdSchema.safeParse(BM_file.name).success) continue;
      try {
        const BM_path = path.join(BM_root, BM_file.name);
        const BM_config = await this.BM_config(BM_path);
        let BM_name = BM_config.BM_rules.BM_account;
        try {
          const BM_accountFile = path.join(
            path.dirname(BM_config.BM_data_dir),
            'BM_account.local.json'
          );
          await this.BM_outsideCheckout(BM_accountFile);
          const BM_account = BM_accountSchema.parse(
            (({ BM_display_name, BM_douyin_id }) => ({ BM_display_name, BM_douyin_id }))(
              JSON.parse(await this.BM_privateRead(BM_accountFile))
            )
          );
          if (BM_account.BM_douyin_id === BM_config.BM_rules.BM_account)
            BM_name = BM_account.BM_display_name;
        } catch {
          // Manually prepared configurations may not have a saved creator identity.
        }
        BM_result.push({
          BM_id: BM_file.name,
          BM_name,
          BM_account: BM_config.BM_rules.BM_account,
          BM_work_count: BM_config.BM_rules.BM_works.length,
          BM_selected: BM_path === BM_selected,
        });
      } catch {
        // Skip incomplete, invalid or non-private files without exposing their contents.
      }
    }
    return BM_result.sort(
      (BM_a, BM_b) =>
        Number(BM_b.BM_selected) - Number(BM_a.BM_selected) || BM_a.BM_id.localeCompare(BM_b.BM_id)
    );
  }
  async BM_selectConfig(BM_id: unknown, BM_default: string): Promise<BM_Snapshot> {
    const BM_checked = BM_configIdSchema.safeParse(BM_id);
    if (!BM_checked.success) throw new Error('请选择列表中的有效私有配置');
    const BM_root = await this.BM_configDirectory(BM_default);
    return this.BM_bind(path.join(BM_root, BM_checked.data));
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
      const BM_config = await this.BM_config(BM_file);
      await this.BM_saveBinding({
        BM_config: BM_file,
        BM_connection: BM_connectionSchema.parse(BM_config),
      });
      return this.BM_snapshot();
    });
  }
  private BM_request(
    BM_config: BM_Connection,
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
      BM_auto_review: false,
      BM_config_name: '',
      BM_running: false,
      BM_write_ready: false,
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
    try {
      const BM_config = await this.BM_config(BM_file);
      Object.assign(BM_base, {
        BM_configured: true,
        BM_config_name: path.basename(BM_file),
        ...BM_config.BM_rules,
        BM_default_reply: await this.BM_defaultReply(BM_config),
        BM_interval_seconds: BM_config.BM_interval_seconds,
      });
    } catch {
      BM_base.BM_config_name = path.basename(BM_file);
      BM_base.BM_error = '配置文件暂时不可用；仍可使用已保存的连接停止后台';
    }
    try {
      const BM_connection = await this.BM_connection();
      const BM_status = BM_statusSchema.parse(await this.BM_request(BM_connection, '/BM/status'));
      try {
        BM_base.BM_source = BM_sourceStatusSchema.parse(
          await this.BM_request(BM_connection, '/BM/source')
        );
      } catch {
        /* Older backends do not expose source diagnostics. */
      }

      try {
        const BM_taskRaw = await this.BM_request(BM_connection, '/BM/task');
        const BM_task = BM_taskSchema.parse(BM_taskRaw);
        const BM_requires_restart = !(
          'BM_deny_contains' in (BM_taskRaw as { BM_rules: Record<string, unknown> }).BM_rules &&
          'BM_reply_marker' in (BM_taskRaw as { BM_rules: Record<string, unknown> }).BM_rules &&
          'BM_auto_review' in (BM_taskRaw as { BM_rules: Record<string, unknown> }).BM_rules &&
          'BM_write_ready' in (BM_taskRaw as Record<string, unknown>)
        );
        return {
          ...BM_base,
          ...BM_status,
          ...BM_task.BM_rules,
          BM_interval_seconds: BM_task.BM_interval_seconds,
          BM_running: true,
          BM_write_ready: BM_task.BM_write_ready,
          BM_manual_reply_ready: BM_task.BM_manual_reply_ready,
          BM_requires_restart:
            BM_requires_restart ||
            (!!this.BM_readerLauncher && !BM_base.BM_source) ||
            BM_base.BM_auto_review !== BM_task.BM_rules.BM_auto_review,
        };
      } catch {
        return {
          ...BM_base,
          ...BM_status,
          BM_running: true,
          BM_requires_restart: true,
          BM_error: '后台已连接，任务信息暂不可用；可以暂停或停止后台',
        };
      }
    } catch {
      return { ...BM_base, BM_error: '后台未连接；可启动后台或检查私有配置' };
    }
  }
  async BM_action(BM_action: BM_WatchAction): Promise<BM_Snapshot> {
    const BM_checked = BM_actionSchema.parse(BM_action);
    return this.BM_serial(async () => {
      const BM_file = await this.BM_binding();
      if (!BM_file) throw new Error('请先选择私有配置');
      if (BM_checked === 'start') {
        if ((await this.BM_snapshot()).BM_running) return this.BM_snapshot();
        const BM_config = await this.BM_config(BM_file);
        await this.BM_saveBinding({
          BM_config: BM_file,
          BM_connection: BM_connectionSchema.parse(BM_config),
        });
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
      if (BM_checked === 'resume') {
        const BM_snapshot = await this.BM_snapshot();
        if (BM_snapshot.BM_requires_restart || !BM_snapshot.BM_configured)
          throw new Error('请检查配置并停止、重启旧后台后再开始值守');
      }
      await this.BM_request(await this.BM_connection(), `/BM/${BM_checked}`, 'POST');
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
      if (this.BM_readerLauncher) {
        const BM_readerFile = path.join(BM_config.BM_data_dir, 'BM_reader.local.json');
        const BM_readerTmp = `${BM_readerFile}.BM_${randomUUID()}`;
        try {
          await fs.writeFile(BM_readerTmp, JSON.stringify(this.BM_readerLauncher), {
            mode: 0o600,
            flag: 'wx',
          });
          await fs.rename(BM_readerTmp, BM_readerFile);
        } finally {
          await fs.rm(BM_readerTmp, { force: true });
        }
      }
      const BM_child = spawn(this.BM_binary, ['--config', BM_file], {
        detached: true,
        stdio: ['ignore', BM_out.fd, BM_err.fd],
        env: {
          ...process.env,
          ...(this.BM_readerLauncher
            ? {
                BM_READER_EXECUTABLE: this.BM_readerLauncher.BM_executable,
                BM_READER_APP: this.BM_readerLauncher.BM_app,
              }
            : {}),
        },
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
    const BM_config = await this.BM_connection();
    return BM_recordsSchema.parse(
      await this.BM_request(BM_config, `/BM/records${BM_before ? `?BM_before=${BM_before}` : ''}`)
    ).BM_records;
  }
  async BM_setAutoReview(BM_enabled: boolean): Promise<BM_Snapshot> {
    z.boolean().parse(BM_enabled);
    return this.BM_serial(async () => {
      const BM_file = await this.BM_binding();
      if (!BM_file) throw new Error('请先选择私有配置');
      await this.BM_outsideCheckout(BM_file);
      const BM_config = await this.BM_config(BM_file);
      const BM_snapshot = await this.BM_snapshot();
      if (BM_snapshot.BM_running && BM_snapshot.BM_requires_restart)
        throw new Error('请先停止并更新后台，再修改自动审核');
      // Pause before persisting so a failed update cannot leave automatic sending active.
      if (BM_snapshot.BM_running)
        await this.BM_request(await this.BM_connection(), '/BM/pause', 'POST');
      const BM_tmp = `${BM_file}.BM_${randomUUID()}`;
      try {
        BM_config.BM_rules.BM_auto_review = BM_enabled;
        await fs.writeFile(BM_tmp, JSON.stringify(BM_config, null, 2), { mode: 0o600, flag: 'wx' });
        await fs.rename(BM_tmp, BM_file);
        if (BM_snapshot.BM_running) {
          const BM_result = z
            .object({ BM_auto_review: z.boolean() })
            .strict()
            .parse(
              await this.BM_request(await this.BM_connection(), '/BM/review-policy', 'POST', {
                BM_auto_review: BM_enabled,
              })
            );
          if (BM_result.BM_auto_review !== BM_enabled) throw new Error('审核设置未确认');
          if (BM_snapshot.BM_enabled)
            await this.BM_request(await this.BM_connection(), '/BM/resume', 'POST');
        }
      } catch {
        if (BM_snapshot.BM_running) {
          try {
            await this.BM_request(await this.BM_connection(), '/BM/pause', 'POST');
          } catch {
            /* A disconnected backend must be checked before consumption resumes. */
          }
        }
        throw new Error('自动审核更新未完成；请确认后台已暂停，检查配置并重启后台');
      } finally {
        await fs.rm(BM_tmp, { force: true });
      }
      return this.BM_snapshot();
    });
  }
  private async BM_defaultReply(BM_config: BM_Config): Promise<string> {
    try {
      return z
        .object({ BM_default_reply: z.string().min(1).max(1000) })
        .strict()
        .parse(
          JSON.parse(
            await this.BM_privateRead(
              path.join(BM_config.BM_data_dir, 'BM_reply_preferences.local.json')
            )
          )
        ).BM_default_reply;
    } catch (BM_error) {
      if (BM_errorCode(BM_error) === 'ENOENT') return BM_defaultManualReply;
      throw new Error('无法读取私有默认回复设置');
    }
  }

  async BM_setDefaultReply(BM_text: string): Promise<BM_Snapshot> {
    z.string().trim().min(1).max(1000).parse(BM_text);
    return this.BM_serial(async () => {
      const BM_file = await this.BM_binding();
      if (!BM_file) throw new Error('请先选择私有配置');
      const BM_config = await this.BM_config(BM_file);
      const BM_snapshot = await this.BM_snapshot();
      if (
        !BM_validManualReply(
          BM_markManualReply(BM_text, BM_snapshot.BM_reply_marker),
          BM_snapshot.BM_reply_marker,
          BM_snapshot.BM_max_reply_chars
        )
      )
        throw new Error('默认回复超过长度限制或包含控制字符');
      await BM_outsideCheckout(BM_config.BM_data_dir);
      await fs.mkdir(BM_config.BM_data_dir, { recursive: true, mode: 0o700 });
      await BM_privateDirectory(BM_config.BM_data_dir);
      const BM_target = path.join(BM_config.BM_data_dir, 'BM_reply_preferences.local.json');
      const BM_tmp = `${BM_target}.BM_${randomUUID()}`;
      try {
        await fs.writeFile(BM_tmp, JSON.stringify({ BM_default_reply: BM_text.trim() }), {
          mode: 0o600,
          flag: 'wx',
        });
        await fs.rename(BM_tmp, BM_target);
      } finally {
        await fs.rm(BM_tmp, { force: true });
      }
      return this.BM_snapshot();
    });
  }

  async BM_manualReply(
    BM_id: number,
    BM_expected_reply: string | null,
    BM_reply: string,
    BM_mode: BM_ManualReplyMode
  ): Promise<void> {
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(BM_id);
    z.string().max(4000).nullable().parse(BM_expected_reply);
    z.enum(['default', 'custom']).parse(BM_mode);
    z.string().min(1).max(4000).parse(BM_reply);
    await this.BM_serial(async () => {
      const BM_snapshot = await this.BM_snapshot();
      if (
        !BM_snapshot.BM_running ||
        BM_snapshot.BM_requires_restart ||
        !BM_snapshot.BM_manual_reply_ready
      )
        throw new Error('请先连接支持人工回复的新版后台');
      if (
        BM_mode === 'default' &&
        BM_reply !==
          BM_markManualReply(
            BM_snapshot.BM_default_reply ?? BM_defaultManualReply,
            BM_snapshot.BM_reply_marker
          )
      )
        throw new Error('默认回复已变化，请重新确认');
      if (
        !BM_validManualReply(BM_reply, BM_snapshot.BM_reply_marker, BM_snapshot.BM_max_reply_chars)
      )
        throw new Error('回复长度或标记不符合要求');
      await this.BM_request(await this.BM_connection(), '/BM/manual-reply', 'POST', {
        BM_id,
        BM_expected_reply,
        BM_reply,
        BM_mode,
      });
    });
  }

  async BM_approve(BM_id: number, BM_reply: string): Promise<void> {
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(BM_id);
    z.string().min(1).max(4000).parse(BM_reply);
    await this.BM_serial(async () => {
      const BM_snapshot = await this.BM_snapshot();
      if (!BM_snapshot.BM_running || BM_snapshot.BM_requires_restart)
        throw new Error('请先连接更新后的后台');
      z.string()
        .refine((BM_value) => BM_validReply(BM_value, BM_snapshot.BM_max_reply_chars))
        .parse(BM_reply);
      await this.BM_request(await this.BM_connection(), '/BM/approve', 'POST', { BM_id, BM_reply });
    });
  }
  async BM_verify(BM_id: number): Promise<boolean> {
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(BM_id);
    return this.BM_serial(async () => {
      const BM_state = await this.BM_snapshot();
      if (!BM_state.BM_running || BM_state.BM_requires_restart)
        throw new Error('请先连接更新后的后台');
      const BM_result = z
        .object({ BM_verified: z.boolean(), BM_delivery: z.unknown() })
        .strict()
        .parse(
          await this.BM_request(await this.BM_connection(), '/BM/verify', 'POST', { BM_id }, 125000)
        );
      return BM_result.BM_verified;
    });
  }
  async BM_skip(BM_id: number): Promise<void> {
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(BM_id);
    const BM_file = await this.BM_binding();
    if (!BM_file) throw new Error('请先选择私有配置');
    await this.BM_request(await this.BM_connection(), '/BM/skip', 'POST', { BM_id });
  }
}
