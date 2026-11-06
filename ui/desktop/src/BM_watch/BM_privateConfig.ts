/* eslint-disable preserve-caught-error -- Filesystem errors must not expose private paths over IPC. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { z } from 'zod';
import { BM_defaultReplyMarker, BM_replyMarkerSchema } from './BM_types';

export async function BM_outsideCheckout(BM_path: string): Promise<void> {
  if (!path.isAbsolute(BM_path)) throw new Error('私有路径必须是绝对路径');
  let BM_current = BM_path;
  while (true) {
    try {
      BM_current = await fs.realpath(BM_current);
      break;
    } catch (BM_error) {
      if (!(BM_error instanceof Error) || !('code' in BM_error) || BM_error.code !== 'ENOENT')
        throw new Error('私有路径不可用', { cause: undefined });
      const BM_parent = path.dirname(BM_current);
      if (BM_parent === BM_current) throw new Error('私有路径不可用');
      BM_current = BM_parent;
    }
  }
  while (true) {
    try {
      await fs.lstat(path.join(BM_current, '.git'));
      throw new Error('私有文件必须位于仓库外');
    } catch (BM_error) {
      if (
        !(BM_error instanceof Error) ||
        !('code' in BM_error) ||
        !['ENOENT', 'ENOTDIR'].includes(String(BM_error.code))
      )
        throw BM_error;
    }
    const BM_parent = path.dirname(BM_current);
    if (BM_parent === BM_current) return;
    BM_current = BM_parent;
  }
}

export async function BM_privateDirectory(BM_dir: string): Promise<string> {
  await BM_outsideCheckout(BM_dir);
  await fs.mkdir(BM_dir, { recursive: true, mode: 0o700 });
  const BM_stat = await fs.lstat(BM_dir);
  if (!BM_stat.isDirectory() || BM_stat.isSymbolicLink() || (BM_stat.mode & 0o077) !== 0)
    throw new Error('请将私有目录权限设为 0700，且不要使用符号链接');
  return BM_dir;
}

export const BM_accountSchema = z
  .object({
    BM_display_name: z.string().trim().min(1).max(200),
    BM_douyin_id: z.string().trim().min(1).max(200),
  })
  .strict();
export type BM_Account = z.infer<typeof BM_accountSchema>;

export const BM_createSchema = z
  .object({
    BM_works: z
      .array(z.string().regex(/^\d{5,30}$/))
      .min(1)
      .max(100),
    BM_deny_contains: z.array(z.string().trim().min(1).max(200)).max(100),
    BM_reply_marker: BM_replyMarkerSchema.default(BM_defaultReplyMarker),
  })
  .strict();
export type BM_CreateConfig = z.input<typeof BM_createSchema>;

export function BM_flatConfigPath(BM_root: string, BM_profile: string): string {
  const BM_key = createHash('sha256').update(BM_profile).digest('hex').slice(0, 16);
  return path.join(BM_root, `BM_watch_${BM_key}.local.json`);
}

export async function BM_flattenConfigs(BM_root: string): Promise<void> {
  await BM_privateDirectory(BM_root);
  const BM_entries = await fs.readdir(BM_root, { withFileTypes: true });
  for (const BM_entry of BM_entries) {
    if (!BM_entry.isDirectory() || !/^BM_profile_[a-zA-Z0-9_-]+$/.test(BM_entry.name)) continue;
    const BM_profile = await BM_privateDirectory(path.join(BM_root, BM_entry.name));
    const BM_handle = await fs
      .open(path.join(BM_profile, 'BM_watch.local.json'), constants.O_RDONLY | constants.O_NOFOLLOW)
      .catch((BM_error: unknown) => {
        if (BM_error instanceof Error && 'code' in BM_error && BM_error.code === 'ENOENT')
          return null;
        throw BM_error;
      });
    if (!BM_handle) continue;
    let BM_contents: string;
    try {
      const BM_stat = await BM_handle.stat();
      if (!BM_stat.isFile() || (BM_stat.mode & 0o077) !== 0 || BM_stat.size > 65536)
        throw new Error('旧配置权限或大小不符合要求');
      BM_contents = await BM_handle.readFile('utf8');
      const BM_config = JSON.parse(BM_contents);
      BM_createSchema.parse({
        BM_works: BM_config.BM_rules?.BM_works,
        BM_deny_contains:
          BM_config.BM_rules?.BM_deny_contains ?? BM_config.BM_rules?.BM_allow_contains ?? [],
        BM_reply_marker: BM_config.BM_rules?.BM_reply_marker,
      });
    } finally {
      await BM_handle.close();
    }
    const BM_destination = BM_flatConfigPath(BM_root, BM_profile);
    const BM_tmp = path.join(BM_root, `BM_migration_${randomUUID()}.local.json`);
    try {
      await fs.writeFile(BM_tmp, BM_contents, { mode: 0o600, flag: 'wx' });
      await fs.link(BM_tmp, BM_destination).catch((BM_error: unknown) => {
        if (!(BM_error instanceof Error) || !('code' in BM_error) || BM_error.code !== 'EEXIST')
          throw BM_error;
      });
    } finally {
      await fs.rm(BM_tmp, { force: true });
    }
  }
}

export async function BM_saveConfig(
  BM_dir: string,
  BM_gooseRoot: string | null,
  BM_account: BM_Account,
  BM_input: BM_CreateConfig,
  BM_configRoot: string = BM_dir
): Promise<string> {
  await BM_privateDirectory(BM_dir);
  await BM_privateDirectory(BM_configRoot);
  if (BM_gooseRoot) await BM_outsideCheckout(BM_gooseRoot);
  const BM_rules = BM_createSchema.parse(BM_input);
  const BM_identity = BM_accountSchema.parse(BM_account);
  await BM_privateDirectory(path.join(BM_dir, 'BM_data'));
  const BM_identityFile = path.join(BM_dir, 'BM_account.local.json');
  await fs.writeFile(
    BM_identityFile,
    JSON.stringify(
      {
        ...BM_identity,
        BM_source_url: 'https://creator.douyin.com/creator-micro/home',
        BM_observed_at: new Date().toISOString(),
        BM_identity_kind: 'creator_page_douyin_id',
        BM_browser_dir: path.join(BM_dir, 'BM_browser'),
      },
      null,
      2
    ),
    { mode: 0o600, flag: 'wx' }
  );
  const BM_config =
    BM_configRoot === BM_dir
      ? path.join(BM_dir, 'BM_watch.local.json')
      : BM_flatConfigPath(BM_configRoot, BM_dir);
  const BM_tmp = path.join(BM_configRoot, `BM_config_${randomUUID()}.local.json`);
  try {
    await fs.writeFile(
      BM_tmp,
      JSON.stringify(
        {
          BM_data_dir: path.join(BM_dir, 'BM_data'),
          BM_goose_root: BM_gooseRoot,
          BM_admin_token: randomBytes(32).toString('hex'),
          BM_webhook_secret: '',
          BM_client_key: '',
          BM_interval_seconds: 30,
          BM_batch_size: 10,
          BM_port: 8791,
          BM_rules: {
            BM_account: BM_identity.BM_douyin_id,
            BM_works: [...new Set(BM_rules.BM_works)],
            BM_deny_contains: BM_rules.BM_deny_contains,
            BM_reply_marker: BM_rules.BM_reply_marker,
            BM_max_reply_chars: 200,
          },
        },
        null,
        2
      ),
      { mode: 0o600, flag: 'wx' }
    );
    // link() publishes a complete file without overwriting an existing account configuration.
    await fs.link(BM_tmp, BM_config);
  } catch (BM_error) {
    await fs.rm(BM_identityFile, { force: true });
    throw BM_error;
  } finally {
    await fs.rm(BM_tmp, { force: true });
  }
  return BM_config;
}

export function BM_defaultPrivateRoot(BM_home: string, BM_gooseRoot?: string): string {
  return BM_gooseRoot && path.isAbsolute(BM_gooseRoot)
    ? path.join(BM_gooseRoot, 'BM_watch')
    : path.join(BM_home, '.goose', 'BM_watch');
}
