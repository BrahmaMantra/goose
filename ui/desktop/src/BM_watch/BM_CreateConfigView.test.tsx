import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BM_CreateConfigView, { BM_parseWorks } from './BM_CreateConfigView';
beforeEach(() => {
  Object.assign(window.electron, {
    BM_watchLogin: vi.fn(async (BM_action: string) => ({
      BM_status: BM_action === 'confirm' ? 'authenticated' : 'opened',
      ...(BM_action === 'confirm'
        ? { BM_account: { BM_display_name: 'BM nickname', BM_douyin_id: 'BM_id' } }
        : {}),
    })),
    BM_watchCreateConfig: vi.fn(async () => ({ BM_configured: true })),
  });
});
it('requires confirmed QR login before saving works and cleans up on leaving', async () => {
  const BM_saved = vi.fn();
  const BM_view = render(<BM_CreateConfigView BM_onSaved={BM_saved} BM_onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: '保存私有配置' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '打开抖音扫码窗口' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '已扫码，读取账号' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: '已扫码，读取账号' }));
  await screen.findByText(/已确认：BM nickname/);
  fireEvent.change(screen.getByLabelText(/自己的作品链接/), {
    target: { value: 'https://www.douyin.com/video/123456789' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存私有配置' }));
  await waitFor(() => expect(BM_saved).toHaveBeenCalled());
  expect(window.electron.BM_watchCreateConfig).toHaveBeenCalledWith({
    BM_works: ['123456789'],
    BM_allow_contains: [],
  });
  BM_view.unmount();
  expect(window.electron.BM_watchLogin).toHaveBeenCalledWith('cancel');
});
it('parses complete official video links and IDs while rejecting short or foreign links', () => {
  expect(BM_parseWorks('123456789\nhttps://www.douyin.com/video/123456789?extra=1')).toEqual([
    '123456789',
  ]);
  expect(() => BM_parseWorks('https://v.douyin.com/BM_short')).toThrow();
  expect(() => BM_parseWorks('https://example.com/video/123456789')).toThrow();
});
it('shows the bounded main-process failure beside the login controls', async () => {
  vi.mocked(window.electron.BM_watchLogin).mockResolvedValue({
    BM_status: 'failed',
    BM_code: 'BM_account_name_missing',
  });
  render(<BM_CreateConfigView BM_onSaved={vi.fn()} BM_onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '打开抖音扫码窗口' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('无法确定昵称所在的账号区域');
  expect(screen.getByRole('button', { name: '保存私有配置' })).toBeDisabled();
});
