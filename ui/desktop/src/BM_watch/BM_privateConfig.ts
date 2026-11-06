/* eslint-disable preserve-caught-error -- Filesystem errors must not expose private paths over IPC. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

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
    BM_allow_contains: z.array(z.string().trim().min(1).max(200)).max(100),
  })
  .strict();
export type BM_CreateConfig = z.infer<typeof BM_createSchema>;

export async function BM_saveConfig(
  BM_dir: string,
  BM_gooseRoot: string | null,
  BM_account: BM_Account,
  BM_input: BM_CreateConfig
): Promise<string> {
  await BM_privateDirectory(BM_dir);
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
  const BM_config = path.join(BM_dir, 'BM_watch.local.json');
  const BM_tmp = path.join(BM_dir, `BM_config_${randomUUID()}.local.json`);
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
            BM_allow_contains: BM_rules.BM_allow_contains,
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
