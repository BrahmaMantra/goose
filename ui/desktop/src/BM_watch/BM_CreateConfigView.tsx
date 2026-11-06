import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import type { BM_Account } from './BM_privateConfig';
import type { BM_Snapshot } from './BM_types';
import { BM_loginMessages } from './BM_loginStatus';

export function BM_parseWorks(BM_text: string): string[] {
  return [
    ...new Set(
      BM_text.split(/[\s,，]+/)
        .filter(Boolean)
        .map((BM_value) => {
          if (/^\d{5,30}$/.test(BM_value)) return BM_value;
          try {
            const BM_url = new URL(BM_value);
            if (
              BM_url.protocol === 'https:' &&
              ['www.douyin.com', 'douyin.com'].includes(BM_url.hostname)
            ) {
              const BM_id = /^\/video\/(\d{5,30})\/?$/.exec(BM_url.pathname)?.[1];
              if (BM_id) return BM_id;
            }
          } catch {
            /* Invalid links are reported together below. */
          }
          throw new Error(
            '请填写作品 ID 或完整的 https://www.douyin.com/video/… 链接，暂不支持短链接'
          );
        })
    ),
  ];
}

export default function BM_CreateConfigView({
  BM_onSaved,
  BM_onClose,
}: {
  BM_onSaved: (BM_snapshot: BM_Snapshot) => void;
  BM_onClose: () => void;
}) {
  const [BM_account, BM_setAccount] = useState<BM_Account | null>(null);
  const [BM_busy, BM_setBusy] = useState(false);
  const [BM_works, BM_setWorks] = useState('');
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
      const BM_ids = BM_parseWorks(BM_works);
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
      BM_setError('保存未完成，请检查作品链接、私有目录权限，并确认扫码窗口仍停留在同一账号首页。');
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
      <label className="block space-y-2 text-sm">
        <span>自己的作品链接或 ID（多条用换行分隔）</span>
        <textarea
          className="w-full rounded-lg border border-border-primary bg-background-primary p-3"
          rows={3}
          value={BM_works}
          onChange={(BM_event) => BM_setWorks(BM_event.target.value)}
          placeholder="https://www.douyin.com/video/…"
          disabled={BM_busy}
        />
      </label>
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
        权限，作品归属将在真实平台接入时校验。
      </p>
      <div className="flex gap-2">
        <Button
          disabled={BM_busy || !BM_account || !BM_works.trim()}
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
