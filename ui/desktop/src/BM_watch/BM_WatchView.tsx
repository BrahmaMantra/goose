import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Play, Pause, Square, RefreshCw, MessageSquare } from 'lucide-react';
import { MainPanelLayout } from '../components/Layout/MainPanelLayout';
import { Button } from '../components/ui/button';
import type { BM_Record, BM_Snapshot, BM_WatchAction } from './BM_types';

const BM_labels: Record<string, string> = {
  queued: '待处理',
  processing: '处理中',
  review: '待审核',
  skipped: '已跳过',
  failed: '失败',
  sending: '提交中',
  accepted: '平台已接受',
  unknown: '结果未知',
};

export default function BM_WatchView() {
  const [BM_snapshot, BM_setSnapshot] = useState<BM_Snapshot | null>(null);
  const [BM_records, BM_setRecords] = useState<BM_Record[]>([]);
  const [BM_busy, BM_setBusy] = useState(false);
  const [BM_error, BM_setError] = useState('');
  const BM_cursor = useRef<number | undefined>(undefined);
  const BM_refresh = useCallback(async (BM_reset = false) => {
    if (BM_reset) BM_cursor.current = undefined;
    try {
      const BM_next = await window.electron.BM_watchSnapshot();
      BM_setSnapshot(BM_next);
      if (BM_next.BM_running)
        BM_setRecords(await window.electron.BM_watchRecords(BM_cursor.current));
      else BM_setRecords([]);
      BM_setError('');
    } catch {
      BM_setError('无法读取值守状态，请检查私有配置或后台连接。');
    }
  }, []);
  useEffect(() => {
    void BM_refresh(true);
    const BM_timer = setInterval(() => {
      void BM_refresh();
    }, 5000);
    return () => clearInterval(BM_timer);
  }, [BM_refresh]);
  const BM_action = async (BM_action: BM_WatchAction) => {
    BM_setBusy(true);
    BM_setError('');
    try {
      BM_setSnapshot(await window.electron.BM_watchAction(BM_action));
      await BM_refresh();
    } catch {
      BM_setError('操作未完成，请检查私有配置、后台程序和连接。');
    } finally {
      BM_setBusy(false);
    }
  };
  const BM_select = async () => {
    BM_setBusy(true);
    BM_setError('');
    try {
      const BM_next = await window.electron.BM_watchSelectConfig();
      if (BM_next) {
        BM_cursor.current = undefined;
        BM_setSnapshot(BM_next);
        BM_setRecords([]);
      }
    } catch {
      BM_setError('无法绑定配置。请使用仓库外的私有 JSON 文件，并先停止现有后台。');
    } finally {
      BM_setBusy(false);
    }
  };
  const BM_skip = async (BM_id: number) => {
    BM_setBusy(true);
    try {
      await window.electron.BM_watchSkip(BM_id);
      await BM_refresh();
    } catch {
      BM_setError('无法跳过此记录，它的状态可能已经变化。');
    } finally {
      BM_setBusy(false);
    }
  };
  const BM_older = async () => {
    const BM_last = BM_records.at(-1);
    if (!BM_last) return;
    BM_setBusy(true);
    try {
      const BM_olderRecords = await window.electron.BM_watchRecords(BM_last.BM_id);
      BM_cursor.current = BM_last.BM_id;
      BM_setRecords(BM_olderRecords);
    } catch {
      BM_setError('无法读取更早的记录。');
    } finally {
      BM_setBusy(false);
    }
  };
  const BM_running = BM_snapshot?.BM_running ?? false;
  return (
    <MainPanelLayout>
      <main className="flex-1 overflow-y-auto p-6 text-text-primary">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <MessageSquare size={24} />
                评论值守
              </h1>
              <p className="mt-2 text-sm text-text-secondary">
                管理评论处理任务，查看队列和候选回复。
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void BM_refresh();
              }}
              disabled={BM_busy}
            >
              <RefreshCw size={16} />
              刷新
            </Button>
          </header>
          <section className="rounded-xl border border-border-primary bg-background-secondary p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium">值守任务</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {BM_snapshot?.BM_config_name || '尚未绑定私有配置'}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  void BM_select();
                }}
                disabled={BM_busy || BM_running}
              >
                <FolderOpen size={16} />
                选择私有配置
              </Button>
            </div>
            {BM_snapshot?.BM_configured && (
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-text-secondary">账号引用</dt>
                  <dd className="mt-1 break-all">{BM_snapshot.BM_account}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">监督作品</dt>
                  <dd className="mt-1 break-all">{BM_snapshot.BM_works.join('、')}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">批次间隔</dt>
                  <dd className="mt-1">{BM_snapshot.BM_interval_seconds} 秒</dd>
                </div>
              </dl>
            )}
            <p className="text-sm text-text-secondary">
              回复条件：
              {BM_snapshot?.BM_allow_contains.length
                ? BM_snapshot.BM_allow_contains.join('、')
                : '尚未配置自动处理关键词，消息将进入待审核'}
              。修改私有配置后，请停止并重新启动后台。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 rounded-full bg-background-tertiary px-3 py-1 text-sm">
                {!BM_running ? '后台未连接' : BM_snapshot?.BM_enabled ? '值守运行中' : '值守已暂停'}
              </span>
              <Button
                onClick={() => {
                  void BM_action('start');
                }}
                disabled={BM_busy || !BM_snapshot?.BM_configured || BM_running}
              >
                <Play size={16} />
                启动后台
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void BM_action(BM_snapshot?.BM_enabled ? 'pause' : 'resume');
                }}
                disabled={BM_busy || !BM_running}
              >
                {BM_snapshot?.BM_enabled ? <Pause size={16} /> : <Play size={16} />}
                {BM_snapshot?.BM_enabled ? '暂停值守' : '开始值守'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void BM_action('shutdown');
                }}
                disabled={BM_busy || !BM_running}
              >
                <Square size={16} />
                停止后台
              </Button>
            </div>
            <p className="text-sm text-text-secondary">
              关闭窗口后，已经启动的后台会继续运行。当前平台接入尚未完成：仅处理已入队消息并生成候选回复，不会自动读取或发送抖音评论。
            </p>
          </section>
          {BM_error && (
            <p role="alert" className="rounded-lg bg-background-tertiary p-3 text-sm">
              {BM_error}
            </p>
          )}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="队列统计">
            {['queued', 'review', 'failed', 'accepted'].map((BM_status) => (
              <div key={BM_status} className="rounded-xl border border-border-primary p-4">
                <div className="text-sm text-text-secondary">{BM_labels[BM_status]}</div>
                <div className="mt-2 text-2xl font-semibold">
                  {BM_snapshot?.BM_counts[BM_status] ?? 0}
                </div>
              </div>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">评论与候选回复</h2>
            {BM_records.length === 0 && (
              <p className="rounded-xl border border-border-primary p-8 text-center text-text-secondary">
                {BM_running ? '暂无处理记录' : '连接后台后可查看私有处理记录'}
              </p>
            )}
            {BM_records.map((BM_record) => (
              <article
                key={BM_record.BM_id}
                className="rounded-xl border border-border-primary p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="break-all text-text-secondary">
                    作品 {BM_record.BM_message.BM_work} · 评论 {BM_record.BM_message.BM_comment}
                  </span>
                  <span className="shrink-0">
                    {BM_labels[BM_record.BM_status] || BM_record.BM_status}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words">{BM_record.BM_message.BM_text}</p>
                {BM_record.BM_reply && (
                  <div className="rounded-lg bg-background-secondary p-3">
                    <p className="mb-1 text-xs text-text-secondary">候选回复</p>
                    <p className="whitespace-pre-wrap break-words">{BM_record.BM_reply}</p>
                  </div>
                )}
                {['review', 'failed'].includes(BM_record.BM_status) && (
                  <Button
                    variant="outline"
                    disabled={BM_busy}
                    onClick={() => {
                      void BM_skip(BM_record.BM_id);
                    }}
                  >
                    跳过
                  </Button>
                )}
              </article>
            ))}
            {BM_records.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  void BM_older();
                }}
                disabled={BM_busy || !BM_running}
              >
                更早记录
              </Button>
            )}
          </section>
        </div>
      </main>
    </MainPanelLayout>
  );
}
