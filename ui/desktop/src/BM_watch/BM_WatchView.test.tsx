import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BM_WatchView from './BM_WatchView';
import type { BM_Snapshot, BM_WatchAction } from './BM_types';
let BM_snapshot: BM_Snapshot;
beforeEach(() => {
  BM_snapshot = {
    BM_configured: true,
    BM_config_name: 'BM_watch.local.json',
    BM_running: true,
    BM_enabled: true,
    BM_counts: { review: 1 },
    BM_pid: 123,
    BM_account: 'BM_owner',
    BM_works: ['BM_work'],
    BM_deny_contains: ['question'],
    BM_max_reply_chars: 200,
    BM_reply_marker: '【from deepseek】',
    BM_interval_seconds: 30,
  };
  Object.assign(window.electron, {
    BM_watchSnapshot: vi.fn(async () => BM_snapshot),
    BM_watchSelectConfig: vi.fn(async () => BM_snapshot),
    BM_watchRecords: vi.fn(async () => [
      {
        BM_id: 1,
        BM_status: 'review',
        BM_message: {
          BM_account: 'BM_owner',
          BM_work: 'BM_work',
          BM_comment: 'BM_comment',
          BM_author: 'BM_reader',
          BM_text: '<img src=x onerror=alert(1)>',
        },
        BM_reply: 'BM candidate',
      },
    ]),
    BM_watchAction: vi.fn(async (BM_action: BM_WatchAction) => {
      BM_snapshot = { ...BM_snapshot, BM_enabled: BM_action === 'resume' };
      return BM_snapshot;
    }),
    BM_watchSkip: vi.fn(async () => undefined),
  });
});
describe('BM watch desktop page', () => {
  it('renders private records as text and sends bounded pause and skip actions', async () => {
    const BM_view = render(<BM_WatchView />);
    await screen.findByText('BM candidate');
    expect(BM_view.container.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '暂停值守' }));
    await waitFor(() => expect(window.electron.BM_watchAction).toHaveBeenCalledWith('pause'));
    await screen.findByRole('button', { name: '开始值守' });
    fireEvent.click(screen.getByRole('button', { name: '跳过' }));
    await waitFor(() => expect(window.electron.BM_watchSkip).toHaveBeenCalledWith(1));
    expect(screen.getByText(/当前平台接入尚未完成/)).toBeInTheDocument();
  });
  it('requires a selected configuration and connection before enabling consumption', async () => {
    BM_snapshot = { ...BM_snapshot, BM_configured: false, BM_running: false, BM_enabled: false };
    render(<BM_WatchView />);
    await screen.findByText('尚未绑定私有配置');
    expect(screen.getByRole('button', { name: '启动后台' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '开始值守' })).toBeDisabled();
    expect(window.electron.BM_watchAction).not.toHaveBeenCalled();
  });
});
