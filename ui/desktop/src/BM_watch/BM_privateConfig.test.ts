import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BM_defaultPrivateRoot,
  BM_privateDirectory,
  BM_saveConfig,
  BM_flatConfigPath,
  BM_flattenConfigs,
} from './BM_privateConfig';
let BM_root: string;
beforeEach(async () => {
  BM_root = await fs.mkdtemp(path.join(os.tmpdir(), 'BM_config_test_'));
});
afterEach(async () => {
  await fs.rm(BM_root, { recursive: true, force: true });
});
const BM_account = { BM_display_name: 'BM synthetic name', BM_douyin_id: 'BM_synthetic_id' };
const BM_input = { BM_works: ['123456789'], BM_deny_contains: [] };
it('stores isolated private configurations with random tokens and native model fallback', async () => {
  const BM_a = await BM_saveConfig(path.join(BM_root, 'BM_a'), null, BM_account, BM_input);
  const BM_b = await BM_saveConfig(path.join(BM_root, 'BM_b'), BM_root, BM_account, BM_input);
  const BM_configA = JSON.parse(await fs.readFile(BM_a, 'utf8'));
  const BM_configB = JSON.parse(await fs.readFile(BM_b, 'utf8'));
  expect(BM_configA.BM_goose_root).toBeNull();
  expect(BM_configA.BM_rules.BM_account).toBe(BM_account.BM_douyin_id);
  expect(BM_configA.BM_data_dir).not.toBe(BM_configB.BM_data_dir);
  expect(BM_configA.BM_admin_token).toHaveLength(64);
  expect(BM_configA.BM_admin_token).not.toBe(BM_configB.BM_admin_token);
  for (const BM_file of [BM_a, path.join(path.dirname(BM_a), 'BM_account.local.json')])
    expect((await fs.stat(BM_file)).mode & 0o077).toBe(0);
  expect((await fs.stat(BM_configA.BM_data_dir)).mode & 0o077).toBe(0);
  expect(BM_defaultPrivateRoot(BM_root)).toBe(path.join(BM_root, '.goose', 'BM_watch'));
  expect(BM_defaultPrivateRoot(BM_root, BM_root)).toBe(path.join(BM_root, 'BM_watch'));
});
it('refuses checkout paths, symlinks and public directory permissions', async () => {
  const BM_repo = path.join(BM_root, 'BM_repo');
  await fs.mkdir(BM_repo);
  await fs.writeFile(path.join(BM_repo, '.git'), 'gitdir: synthetic');
  await expect(BM_privateDirectory(path.join(BM_repo, 'BM_private'))).rejects.toThrow('仓库外');
  const BM_link = path.join(BM_root, 'BM_link');
  await fs.symlink(BM_root, BM_link);
  await expect(BM_privateDirectory(BM_link)).rejects.toThrow('符号链接');
  const BM_public = path.join(BM_root, 'BM_public');
  await fs.mkdir(BM_public, { mode: 0o755 });
  await expect(BM_privateDirectory(BM_public)).rejects.toThrow('0700');
});
it('never replaces an existing account configuration', async () => {
  const BM_dir = path.join(BM_root, 'BM_account');
  const BM_file = await BM_saveConfig(BM_dir, null, BM_account, BM_input);
  const BM_original = await fs.readFile(BM_file, 'utf8');
  await expect(BM_saveConfig(BM_dir, null, BM_account, BM_input)).rejects.toThrow();
  expect(await fs.readFile(BM_file, 'utf8')).toBe(BM_original);
});
it('puts configuration JSONs in one root while preserving private profile data', async () => {
  const BM_profile = path.join(BM_root, 'BM_profiles', 'BM_profile_test');
  const BM_file = await BM_saveConfig(BM_profile, null, BM_account, BM_input, BM_root);
  expect(path.dirname(BM_file)).toBe(BM_root);
  expect(BM_file).toBe(BM_flatConfigPath(BM_root, BM_profile));
  expect(JSON.parse(await fs.readFile(BM_file, 'utf8')).BM_data_dir).toBe(
    path.join(BM_profile, 'BM_data')
  );
  expect((await fs.stat(BM_file)).mode & 0o077).toBe(0);
});
it('copies legacy configs once without changing tokens, paths, bindings or later edits', async () => {
  const BM_profile = path.join(BM_root, 'BM_profile_legacy');
  const BM_old = await BM_saveConfig(BM_profile, null, BM_account, BM_input);
  const BM_contents = await fs.readFile(BM_old, 'utf8');
  await BM_flattenConfigs(BM_root);
  const BM_new = BM_flatConfigPath(BM_root, BM_profile);
  expect(await fs.readFile(BM_new, 'utf8')).toBe(BM_contents);
  expect(await fs.readFile(BM_old, 'utf8')).toBe(BM_contents);
  const BM_changed = JSON.parse(BM_contents);
  BM_changed.BM_rules.BM_deny_contains = ['BM edited rule'];
  await fs.writeFile(BM_new, JSON.stringify(BM_changed));
  await BM_flattenConfigs(BM_root);
  expect(JSON.parse(await fs.readFile(BM_new, 'utf8')).BM_rules.BM_deny_contains).toEqual([
    'BM edited rule',
  ]);
});
