import { performance as BM_clock } from 'node:perf_hooks';

const BM_recoverableCodes = new Set([
  'BM_page_loading',
  'BM_page_read_failed',
  'BM_account_header_missing',
  'BM_account_name_missing',
]);

export class BM_PageRecovery {
  private BM_failures = 0;
  private BM_delay = 60000;
  private BM_nextReload = Infinity;

  constructor(private readonly BM_now: () => number = () => BM_clock.now()) {}

  BM_failed(BM_code: string): void {
    if (!BM_recoverableCodes.has(BM_code)) {
      this.BM_authenticated();
      return;
    }
    if (this.BM_failures === 0) this.BM_nextReload = this.BM_now() + this.BM_delay;
    this.BM_failures++;
  }

  BM_reloadDue(): boolean {
    if (this.BM_failures < 2 || this.BM_now() < this.BM_nextReload) return false;
    this.BM_failures = 0;
    this.BM_nextReload = Infinity;
    this.BM_delay = Math.min(this.BM_delay * 2, 300000);
    return true;
  }

  BM_authenticated(): void {
    this.BM_failures = 0;
    this.BM_delay = 60000;
    this.BM_nextReload = Infinity;
  }
}
