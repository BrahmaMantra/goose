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
    BM_reply_marker: '【from DeepSeek-V4.1-Flash-1017】',
    BM_interval_seconds: 30,
  };
  Object.assign(window.electron, {
    BM_watchSnapshot: vi.fn(async () => BM_snapshot),
    BM_watchListConfigs: vi.fn(async () => [
      {
        BM_id: 'BM_watch.local.json',
        BM_name: 'BM Creator',
        BM_account: 'BM_owner',
        BM_work_count: 1,
        BM_selected: true,
      },
    ]),
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
    expect(screen.getByText(/发送端仍关闭/)).toBeInTheDocument();
  });
  it('shows saved configurations in the page and binds the clicked entry', async () => {
    BM_snapshot = { ...BM_snapshot, BM_running: false, BM_enabled: false };
    render(<BM_WatchView />);
    await screen.findByText('BM_watch.local.json');
    fireEvent.click(screen.getByRole('button', { name: '选择私有配置' }));
    const BM_entry = await screen.findByRole('button', {
      name: '选择配置 BM Creator BM_watch.local.json',
    });
    expect(screen.getByText('当前配置')).toBeInTheDocument();
    expect(window.electron.BM_watchSelectConfig).not.toHaveBeenCalled();
    fireEvent.click(BM_entry);
    await waitFor(() =>
      expect(window.electron.BM_watchSelectConfig).toHaveBeenCalledWith('BM_watch.local.json')
    );
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '已保存的私有配置' })).not.toBeInTheDocument()
    );
  });
  it('explains an empty saved-config list', async () => {
    BM_snapshot = { ...BM_snapshot, BM_running: false };
    vi.mocked(window.electron.BM_watchListConfigs).mockResolvedValue([]);
    render(<BM_WatchView />);
    await screen.findByText('BM_watch.local.json');
    fireEvent.click(screen.getByRole('button', { name: '选择私有配置' }));
    await screen.findByText(/暂无可用配置/);
  });
  it('allows stopping a running backend even when its configuration is unavailable', async () => {
    BM_snapshot = { ...BM_snapshot, BM_configured: false, BM_error: 'BM unavailable' };
    render(<BM_WatchView />);
    await screen.findByText('BM unavailable');
    expect(screen.getByRole('button', { name: '启动后台' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '停止后台' }));
    await waitFor(() => expect(window.electron.BM_watchAction).toHaveBeenCalledWith('shutdown'));
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
