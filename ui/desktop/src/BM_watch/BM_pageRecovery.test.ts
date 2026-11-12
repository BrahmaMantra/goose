import { expect, it } from 'vitest';
import { BM_PageRecovery } from './BM_pageRecovery';

it('requires repeated failures and a cooldown before reloading a stalled page', () => {
  let BM_now = 0;
  const BM_recovery = new BM_PageRecovery(() => BM_now);
  BM_recovery.BM_failed('BM_account_header_missing');
  BM_now = 60000;
  expect(BM_recovery.BM_reloadDue()).toBe(false);
  BM_recovery.BM_failed('BM_account_header_missing');
  expect(BM_recovery.BM_reloadDue()).toBe(true);
  expect(BM_recovery.BM_reloadDue()).toBe(false);
  BM_recovery.BM_failed('BM_page_read_failed');
  BM_recovery.BM_failed('BM_page_read_failed');
  BM_now += 60000;
  expect(BM_recovery.BM_reloadDue()).toBe(false);
  BM_now += 60000;
  expect(BM_recovery.BM_reloadDue()).toBe(true);
});

it('leaves login and ambiguous identity pages in place and resets on authentication', () => {
  let BM_now = 0;
  const BM_recovery = new BM_PageRecovery(() => BM_now);
  for (const BM_code of [
    'BM_login_required',
    'BM_account_header_ambiguous',
    'BM_not_creator_home',
  ]) {
    BM_recovery.BM_failed('BM_account_header_missing');
    BM_recovery.BM_failed(BM_code);
    BM_now += 60000;
    expect(BM_recovery.BM_reloadDue()).toBe(false);
  }
  BM_recovery.BM_failed('BM_account_header_missing');
  BM_recovery.BM_failed('BM_account_header_missing');
  BM_recovery.BM_authenticated();
  BM_now += 60000;
  expect(BM_recovery.BM_reloadDue()).toBe(false);
});

it('caps persistent failure recovery at a five minute cooldown', () => {
  let BM_now = 0;
  const BM_recovery = new BM_PageRecovery(() => BM_now);
  for (const BM_delay of [60000, 120000, 240000, 300000, 300000]) {
    BM_recovery.BM_failed('BM_account_header_missing');
    BM_recovery.BM_failed('BM_account_header_missing');
    BM_now += BM_delay - 1;
    expect(BM_recovery.BM_reloadDue()).toBe(false);
    BM_now++;
    expect(BM_recovery.BM_reloadDue()).toBe(true);
  }
});
