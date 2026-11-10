import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BM_WatchView from './BM_WatchView';
import type { BM_Snapshot, BM_WatchAction } from './BM_types';
let BM_snapshot: BM_Snapshot;
beforeEach(() => {
  BM_snapshot = {
    BM_configured: true,
    BM_auto_review: false,
    BM_config_name: 'BM_watch.local.json',
    BM_running: true,
    BM_write_ready: false,
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
    BM_watchApprove: vi.fn(async () => undefined),
    BM_watchVerify: vi.fn(async () => true),
    BM_watchSetAutoReview: vi.fn(async (BM_enabled: boolean) => {
      BM_snapshot = { ...BM_snapshot, BM_auto_review: BM_enabled };
      return BM_snapshot;
    }),
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
    expect(screen.getByText(/发送功能未启用，已批准回复不会发送/)).toBeInTheDocument();
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

it('switches review policy and approves only the displayed reply text', async () => {
  render(<BM_WatchView />);
  await screen.findByText('BM candidate');
  expect(screen.getByRole('switch', { name: '自动审核' })).not.toBeChecked();
  fireEvent.click(screen.getByRole('switch', { name: '自动审核' }));
  await waitFor(() => expect(window.electron.BM_watchSetAutoReview).toHaveBeenCalledWith(true));
  await waitFor(() => expect(screen.getByRole('switch', { name: '自动审核' })).toBeChecked());
  fireEvent.click(screen.getByRole('button', { name: '批准此回复' }));
  await waitFor(() =>
    expect(window.electron.BM_watchApprove).toHaveBeenCalledWith(1, 'BM candidate')
  );
});
it('shows approved replies as waiting for sending and permits withdrawal', async () => {
  vi.mocked(window.electron.BM_watchRecords).mockResolvedValue([
    {
      BM_id: 2,
      BM_status: 'approved',
      BM_reply: 'BM approved',
      BM_message: {
        BM_account: 'BM_owner',
        BM_work: 'BM_work',
        BM_comment: 'BM_comment',
        BM_author: 'BM_reader',
        BM_text: 'BM hello',
        BM_is_ai_reply: false,
      },
      BM_delivery: null,
      BM_review: {
        BM_actor: 'auto',
        BM_at: 1,
        BM_policy_version: 'BM_comment_review_v1',
        BM_assessment: { BM_risk: 'low', BM_reason: 'benign' },
      },
    },
  ]);
  render(<BM_WatchView />);
  await screen.findByText('BM approved');
  expect(screen.getAllByText('已批准，等待发送').length).toBeGreaterThan(0);
  expect(screen.getByText(/普通交流，符合低风险条件/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '批准此回复' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '跳过' }));
  await waitFor(() => expect(window.electron.BM_watchSkip).toHaveBeenCalledWith(2));
});
it('blocks review controls until the backend is upgraded', async () => {
  BM_snapshot = { ...BM_snapshot, BM_requires_restart: true };
  render(<BM_WatchView />);
  await screen.findByText('BM candidate');
  expect(screen.getByRole('switch', { name: '自动审核' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '批准此回复' })).toBeDisabled();
});

it('offers only readback for unknown results and never approves or retries them', async () => {
  vi.mocked(window.electron.BM_watchRecords).mockResolvedValue([
    {
      BM_id: 3,
      BM_status: 'unknown',
      BM_reply: 'BM candidate',
      BM_review: null,
      BM_delivery: { BM_state: 'unknown', BM_code: 'BM_transport_unknown', BM_reply_id: null },
      BM_message: {
        BM_account: 'BM_owner',
        BM_work: 'BM_work',
        BM_comment: 'BM_comment',
        BM_author: 'BM_reader',
        BM_text: 'BM hello',
        BM_is_ai_reply: false,
      },
    },
  ]);
  render(<BM_WatchView />);
  await screen.findByText('BM candidate');
  expect(screen.queryByRole('button', { name: '批准此回复' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '核对抖音结果' }));
  await waitFor(() => expect(window.electron.BM_watchVerify).toHaveBeenCalledWith(3));
  expect(window.electron.BM_watchApprove).not.toHaveBeenCalled();
});
