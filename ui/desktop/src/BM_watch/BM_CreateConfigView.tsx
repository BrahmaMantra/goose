import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import type { BM_Account } from './BM_privateConfig';
import type { BM_Snapshot } from './BM_types';
import { BM_loginMessages } from './BM_loginStatus';
import { BM_worksMessages, type BM_Work, type BM_WorksAction } from './BM_works';
import BM_WorkPicker from './BM_WorkPicker';

export default function BM_CreateConfigView({
  BM_onSaved,
  BM_onClose,
}: {
  BM_onSaved: (BM_snapshot: BM_Snapshot) => void;
  BM_onClose: () => void;
}) {
  const [BM_account, BM_setAccount] = useState<BM_Account | null>(null);
  const [BM_busy, BM_setBusy] = useState(false);
  const [BM_works, BM_setWorks] = useState<BM_Work[]>([]);
  const [BM_selected, BM_setSelected] = useState<string[]>([]);
  const [BM_order, BM_setOrder] = useState('');
  const [BM_more, BM_setMore] = useState(false);
  const [BM_workLoading, BM_setWorkLoading] = useState(false);
  const [BM_worksLoaded, BM_setWorksLoaded] = useState(false);
  const [BM_keywords, BM_setKeywords] = useState('');
  const [BM_error, BM_setError] = useState('');
  const [BM_opened, BM_setOpened] = useState(false);
  const [BM_loginAction, BM_setLoginAction] = useState<'open' | 'confirm' | null>(null);
  useEffect(
    () => () => {
      void window.electron.BM_watchLogin('cancel').catch(() => undefined);
    },
    []
  );
  const BM_loadWorks = async (BM_action: BM_WorksAction) => {
    BM_setBusy(true);
    BM_setWorkLoading(true);
    BM_setError('');
    if (BM_action === 'refresh') {
      BM_setWorks([]);
      BM_setSelected([]);
      BM_setWorksLoaded(false);
    }
    try {
      const BM_result = await window.electron.BM_watchListWorks(BM_action);
      if (BM_result.BM_status === 'failed') {
        BM_setError(BM_worksMessages[BM_result.BM_code]);
        if (BM_result.BM_code === 'BM_works_login_changed') {
          BM_setAccount(null);
          BM_setWorks([]);
          BM_setSelected([]);
        }
        return;
      }
      BM_setWorks(BM_result.BM_items);
      BM_setOrder(BM_result.BM_order_text);
      BM_setMore(BM_result.BM_can_load_more);
      BM_setWorksLoaded(true);
    } catch {
      BM_setError('无法读取作品列表，请重新确认扫码账号后重试。');
    } finally {
      BM_setBusy(false);
      BM_setWorkLoading(false);
    }
  };
  const BM_login = async (BM_action: 'open' | 'confirm') => {
    BM_setBusy(true);
    BM_setLoginAction(BM_action);
    BM_setError('');
    try {
      const BM_result = await window.electron.BM_watchLogin(BM_action);
      if (BM_result.BM_status === 'failed') {
        BM_setAccount(null);
        BM_setError(BM_loginMessages[BM_result.BM_code]);
        if (BM_result.BM_code === 'BM_window_unavailable') BM_setOpened(false);
        return;
      }
      BM_setOpened(true);
      BM_setAccount(BM_result.BM_account ?? null);
      BM_setWorks([]);
      BM_setSelected([]);
      BM_setWorksLoaded(false);
      if (BM_result.BM_status === 'authenticated') {
        BM_setLoginAction(null);
        await BM_loadWorks('refresh');
      }
    } catch {
      BM_setError(
        BM_action === 'open'
          ? '无法打开扫码窗口，请检查网络与私有目录权限。'
          : '尚未读取到账号，请完成扫码、进入创作者中心首页并等待加载；窗口关闭后请重新打开。'
      );
    } finally {
      BM_setBusy(false);
      BM_setLoginAction(null);
    }
  };
  const BM_save = async () => {
    BM_setBusy(true);
    BM_setError('');
    try {
      const BM_ids = BM_selected;
      if (!BM_ids.length) {
        BM_setError('请至少填写一条自己的作品。');
        return;
      }
      const BM_snapshot = await window.electron.BM_watchCreateConfig({
        BM_works: BM_ids,
        BM_allow_contains: BM_keywords.split(/\n/)
          .map((BM_value) => BM_value.trim())
          .filter(Boolean),
      });
      BM_onSaved(BM_snapshot);
    } catch {
      BM_setError('保存未完成，请检查勾选的作品、私有目录权限，并确认扫码窗口仍使用同一账号。');
    } finally {
      BM_setBusy(false);
    }
  };
  return (
    <section
      aria-label="创建私有配置"
      className="space-y-4 rounded-xl border border-border-primary bg-background-secondary p-5"
    >
      <h2 className="font-medium">创建新配置</h2>
      <p className="text-sm text-text-secondary">
        在抖音官方窗口扫码登录，回到这里确认账号。登录状态、昵称和抖音号只保存到本机私有目录。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={BM_busy}
          onClick={() => {
            void BM_login('open');
          }}
        >
          打开抖音扫码窗口
        </Button>
        <Button
          variant="outline"
          disabled={BM_busy || !BM_opened}
          onClick={() => {
            void BM_login('confirm');
          }}
        >
          已扫码，读取账号
        </Button>
      </div>
      {BM_loginAction && (
        <p role="status" className="text-sm">
          {BM_loginAction === 'open' ? '正在打开官方扫码窗口…' : '正在读取官方首页账号…'}
        </p>
      )}
      {BM_error && (
        <p role="alert" className="text-sm">
          {BM_error}
        </p>
      )}
      {BM_account && (
        <p role="status">
          已确认：{BM_account.BM_display_name}（抖音号：{BM_account.BM_douyin_id}）
        </p>
      )}
      {BM_account && (
        <section className="space-y-3" aria-label="作品列表">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">选择自己的作品</h3>
            <Button
              variant="outline"
              disabled={BM_busy}
              onClick={() => {
                void BM_loadWorks('refresh');
              }}
            >
              刷新作品列表
            </Button>
            <Button
              variant="outline"
              disabled={BM_busy || !BM_worksLoaded || !BM_more}
              onClick={() => {
                void BM_loadWorks('more');
              }}
            >
              加载更多作品
            </Button>
          </div>
          <p className="text-sm text-text-secondary">
            {BM_order || '沿用官方页面顺序'} · 已选择 {BM_selected.length} 条
          </p>
          {BM_workLoading && (
            <p role="status" className="text-sm">
              正在读取官方作品列表，请稍候…
            </p>
          )}
          {BM_worksLoaded && !BM_works.length && (
            <p className="text-sm">当前未读取到作品，可刷新重试。</p>
          )}
          <BM_WorkPicker
            BM_items={BM_works}
            BM_selected={BM_selected}
            BM_onChange={BM_setSelected}
            BM_busy={BM_busy}
          />
          <p className="text-sm text-text-secondary">
            仅展示当前读取的作品，按官方页面顺序排列；置顶标记不改变排列顺序。点击加载更多继续读取，最多展示
            100 条。
          </p>
        </section>
      )}
      <label className="block space-y-2 text-sm">
        <span>自动处理关键词（每行一个，可留空）</span>
        <textarea
          className="w-full rounded-lg border border-border-primary bg-background-primary p-3"
          rows={2}
          value={BM_keywords}
          onChange={(BM_event) => BM_setKeywords(BM_event.target.value)}
          disabled={BM_busy}
        />
      </label>
      <p className="text-sm text-text-secondary">
        保存后绑定此配置，后台保持未启动。扫码登录不授予开放平台 API
        权限；只能保存当前扫码账号已读取并勾选的作品。
      </p>
      <div className="flex gap-2">
        <Button
          disabled={BM_busy || !BM_account || !BM_selected.length}
          onClick={() => {
            void BM_save();
          }}
        >
          保存私有配置
        </Button>
        <Button variant="outline" disabled={BM_busy} onClick={BM_onClose}>
          取消创建
        </Button>
      </div>
    </section>
  );
}
