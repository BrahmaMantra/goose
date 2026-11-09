import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BM_CreateConfigView from './BM_CreateConfigView';
beforeEach(() => {
  Object.assign(window.electron, {
    BM_watchLogin: vi.fn(async (BM_action: string) => ({
      BM_status: BM_action === 'confirm' ? 'authenticated' : 'opened',
      ...(BM_action === 'confirm'
        ? { BM_account: { BM_display_name: 'BM nickname', BM_douyin_id: 'BM_id' } }
        : {}),
    })),
    BM_watchListWorks: vi.fn(async () => ({
      BM_status: 'ready',
      BM_order_text: '最新发布',
      BM_complete: false,
      BM_can_load_more: true,
      BM_items: [
        {
          BM_index: 0,
          BM_id: '123456789',
          BM_title_text: 'BM selectable work',
          BM_publish_time_text: 'BM time',
          BM_status_text: '已发布',
          BM_pinned: true,
          BM_disabled: false,
        },
        {
          BM_index: 1,
          BM_id: null,
          BM_title_text: 'BM unavailable work',
          BM_publish_time_text: '',
          BM_status_text: '',
          BM_pinned: false,
          BM_disabled: true,
        },
      ],
    })),
    BM_watchCreateConfig: vi.fn(async () => ({ BM_configured: true })),
  });
});
it('loads official works after QR confirmation and saves only checked IDs', async () => {
  const BM_saved = vi.fn();
  const BM_view = render(<BM_CreateConfigView BM_onSaved={BM_saved} BM_onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: '保存私有配置' })).toBeDisabled();
  expect(screen.getByRole('switch', { name: '自动审核' })).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '打开抖音扫码窗口' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '已扫码，读取账号' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: '已扫码，读取账号' }));
  await screen.findByText(/BM selectable work/);
  expect(window.electron.BM_watchListWorks).toHaveBeenCalledWith('refresh');
  expect(screen.getByLabelText(/AI 回复标记/)).toHaveValue('【from DeepSeek-V4.1-Flash-1017】');
  fireEvent.change(screen.getByLabelText(/拒绝词/), { target: { value: '/clear\n/delete' } });
  fireEvent.change(screen.getByLabelText(/AI 回复标记/), {
    target: { value: '【from BM model】' },
  });
  const BM_checkboxes = screen.getAllByRole('checkbox');
  expect(BM_checkboxes[1]).toBeDisabled();
  fireEvent.click(BM_checkboxes[0]);
  fireEvent.click(screen.getByRole('button', { name: '加载更多作品' }));
  await waitFor(() => expect(window.electron.BM_watchListWorks).toHaveBeenCalledWith('more'));
  expect(BM_checkboxes[0]).toBeChecked();
  await waitFor(() => expect(screen.getByRole('button', { name: '保存私有配置' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '保存私有配置' }));
  await waitFor(() => expect(BM_saved).toHaveBeenCalled());
  expect(window.electron.BM_watchCreateConfig).toHaveBeenCalledWith({
    BM_works: ['123456789'],
    BM_deny_contains: ['/clear', '/delete'],
    BM_reply_marker: '【from BM model】',
    BM_auto_review: false,
  });
  BM_view.unmount();
  expect(window.electron.BM_watchLogin).toHaveBeenCalledWith('cancel');
});
it('shows the bounded login failure beside the controls', async () => {
  vi.mocked(window.electron.BM_watchLogin).mockResolvedValue({
    BM_status: 'failed',
    BM_code: 'BM_account_name_missing',
  });
  render(<BM_CreateConfigView BM_onSaved={vi.fn()} BM_onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '打开抖音扫码窗口' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('无法确定昵称所在的账号区域');
  expect(screen.getByRole('button', { name: '保存私有配置' })).toBeDisabled();
});
