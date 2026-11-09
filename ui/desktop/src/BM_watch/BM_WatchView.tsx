import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Play, Pause, Square, RefreshCw, MessageSquare } from 'lucide-react';
import { MainPanelLayout } from '../components/Layout/MainPanelLayout';
import { Button } from '../components/ui/button';
import {
  BM_validReply,
  type BM_ConfigEntry,
  type BM_Record,
  type BM_Snapshot,
  type BM_WatchAction,
} from './BM_types';
import BM_CreateConfigView from './BM_CreateConfigView';
import BM_ReviewSwitch from './BM_ReviewSwitch';

const BM_sourceLabels: Record<string, string> = {
  manual: '未配置评论读取器',
  starting: '正在启动评论读取器',
  stale: '评论读取状态已超时，请检查或重启后台',
  paused: '读取已暂停，开始值守后继续读取',
  booted: '评论读取器已启动',
  ready: '官方页面评论读取成功',
  partial: '已读取部分评论，尚未读取完整列表',
  login_required: '需要登录：请在抖音评论读取窗口扫码，然后等待下一次读取',
  account_mismatch: '扫码账号与当前配置不一致，请切换为配置中的账号',
  page_unavailable: '官方评论页面暂不可读，请检查登录、网络或页面结构',
  reader_failed: '评论读取器未就绪，请检查私有配置和后台版本',
};
const BM_labels: Record<string, string> = {
  queued: '待处理',
  processing: '处理中',
  review: '待审核',
  approved: '已批准，等待发送',
  skipped: '已跳过',
  failed: '失败',
  sending: '提交中',
  accepted: '平台已接受',
  unknown: '结果未知',
  rejected: '平台拒绝',
};

const BM_reviewReasons: Record<string, string> = {
  benign: '普通交流，符合低风险条件',
  injection: '涉及指令或权限操纵',
  privacy: '涉及隐私或凭据',
  harmful: '可能涉及有害内容',
  sensitive_advice: '涉及高风险专业建议',
  commitment: '涉及身份冒充或现实承诺',
  unclear: '上下文或安全性无法确定',
  invalid_reply: '回复为空、超长或包含控制字符，不能批准',
  manual_required: '自动审核已关闭',
  reviewer_failed: '自动审核未完成，转人工处理',
  policy_changed: '自动审核已关闭，撤回自动批准',
  manual_approved: '管理员已批准当前正文',
  manual_rejected: '管理员已跳过',
};

const BM_deliveryMessages: Record<string, string> = {
  BM_platform_accepted: '平台已接受提交',
  BM_platform_rejected: '平台明确拒绝回复',
  BM_login_required: '需要在官方窗口重新扫码登录',
  BM_account_mismatch: '扫码账号与配置不一致',
  BM_page_unavailable: '官方页面暂不可用',
  BM_browser_unavailable: '浏览器适配器未就绪',
  BM_comment_unavailable: '原评论已变化或未在当前读取范围内',
  BM_target_mismatch: '目标与配置不一致，已阻止',
  BM_reply_invalid: '回复超过限制或格式不符合要求',
  BM_reply_control_unavailable: '官方回复控件不可用',
  BM_request_mismatch: '页面提交目标或正文不匹配，已阻止',
  BM_no_submission: '页面未发起回复提交',
  BM_receipt_invalid: '无法识别回执，请在抖音核对',
  BM_receipt_mismatch: '回执内容不匹配，请在抖音核对',
  BM_receipt_timeout: '提交后未收到回执，请在抖音核对',
  BM_transport_unknown: '连接中断，请在抖音核对',
};

export default function BM_WatchView() {
  const [BM_snapshot, BM_setSnapshot] = useState<BM_Snapshot | null>(null);
  const [BM_records, BM_setRecords] = useState<BM_Record[]>([]);
  const [BM_busy, BM_setBusy] = useState(false);
  const [BM_error, BM_setError] = useState('');
  const [BM_configs, BM_setConfigs] = useState<BM_ConfigEntry[] | null>(null);
  const [BM_creating, BM_setCreating] = useState(false);
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
  const BM_listConfigs = async () => {
    BM_setBusy(true);
    BM_setError('');
    try {
      BM_setConfigs(await window.electron.BM_watchListConfigs());
    } catch {
      BM_setError('无法读取已保存配置，请检查私有目录权限。');
    } finally {
      BM_setBusy(false);
    }
  };
  const BM_select = async (BM_id: string) => {
    BM_setBusy(true);
    BM_setError('');
    try {
      const BM_next = await window.electron.BM_watchSelectConfig(BM_id);
      if (BM_next) {
        BM_cursor.current = undefined;
        BM_setSnapshot(BM_next);
        BM_setRecords([]);
        BM_setConfigs(null);
      }
    } catch {
      BM_setError('无法使用此配置，请刷新列表，并先停止现有后台。');
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
  const BM_setPolicy = async (BM_enabled: boolean) => {
    BM_setBusy(true);
    BM_setError('');
    try {
      BM_setSnapshot(await window.electron.BM_watchSetAutoReview(BM_enabled));
      await BM_refresh();
    } catch {
      await BM_refresh();
      BM_setError('自动审核更新未完成；请确认后台已暂停，检查配置并重启后台。');
    } finally {
      BM_setBusy(false);
    }
  };
  const BM_approve = async (BM_record: BM_Record) => {
    BM_setBusy(true);
    BM_setError('');
    try {
      await window.electron.BM_watchApprove(BM_record.BM_id, BM_record.BM_reply!);
      await BM_refresh();
    } catch {
      BM_setError('无法批准，请刷新记录；正文或状态可能已变化，也可能超出回复长度限制。');
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
                  void BM_listConfigs();
                }}
                disabled={BM_busy || BM_running || BM_creating}
              >
                <FolderOpen size={16} />
                选择私有配置
              </Button>
              <Button
                variant="outline"
                disabled={BM_busy || BM_running || BM_creating}
                onClick={() => {
                  BM_setConfigs(null);
                  BM_setCreating(true);
                }}
              >
                创建新配置
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
              拒绝词：
              {BM_snapshot?.BM_deny_contains.length
                ? BM_snapshot.BM_deny_contains.join('、')
                : '未配置；范围内的人工评论可进入模型处理'}
              。修改私有配置后，请停止并重新启动后台。
            </p>
            <p className="text-sm text-text-secondary">
              AI 回复标记：{BM_snapshot?.BM_reply_marker || ''}
              。自己的人工评论也会触发，自己的 AI 回复会跳过。
            </p>
            <BM_ReviewSwitch
              BM_enabled={BM_snapshot?.BM_auto_review ?? false}
              BM_disabled={
                BM_busy ||
                BM_creating ||
                !BM_snapshot?.BM_configured ||
                !!BM_snapshot?.BM_requires_restart
              }
              BM_onChange={(BM_enabled) => {
                void BM_setPolicy(BM_enabled);
              }}
            />
            {BM_snapshot?.BM_requires_restart && (
              <p role="alert" className="text-sm">
                后台需要更新，请先停止并重新启动，以启用当前触发规则和评论读取。
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 rounded-full bg-background-tertiary px-3 py-1 text-sm">
                {!BM_running ? '后台未连接' : BM_snapshot?.BM_enabled ? '值守运行中' : '值守已暂停'}
              </span>
              <Button
                onClick={() => {
                  void BM_action('start');
                }}
                disabled={BM_busy || BM_creating || !BM_snapshot?.BM_configured || BM_running}
              >
                <Play size={16} />
                启动后台
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void BM_action(BM_snapshot?.BM_enabled ? 'pause' : 'resume');
                }}
                disabled={
                  BM_busy ||
                  !BM_running ||
                  (!BM_snapshot?.BM_enabled && BM_snapshot?.BM_requires_restart)
                }
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
            <p role="status" className="text-sm text-text-secondary">
              评论读取：{BM_sourceLabels[BM_snapshot?.BM_source?.BM_state ?? 'manual']}
              {BM_snapshot?.BM_source &&
                `；最近读取 ${BM_snapshot.BM_source.BM_seen} 条，新增入队 ${BM_snapshot.BM_source.BM_added} 条`}
            </p>
            <p className="text-sm text-text-secondary">
              发送状态：
              {BM_snapshot?.BM_write_ready
                ? '发送端已启用；只提交已批准回复'
                : '发送功能未启用，已批准回复不会发送'}
              。
            </p>
            <p className="text-sm text-text-secondary">
              关闭窗口后，已经启动的后台会继续运行。后台通过官方创作者页面读取评论；值守运行中且发送端已启用时，才提交已批准正文。
            </p>
          </section>
          {BM_configs !== null && (
            <section
              aria-label="已保存的私有配置"
              className="rounded-xl border border-border-primary p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-medium">已保存的私有配置</h2>
                <Button variant="outline" onClick={() => BM_setConfigs(null)}>
                  收起列表
                </Button>
              </div>
              <p className="text-sm text-text-secondary">
                选择之前创建并保存的配置；账号登录资料仍保存在本机私有目录。
              </p>
              {BM_configs.length === 0 && <p>暂无可用配置，请点击「创建新配置」完成扫码并保存。</p>}
              <ul className="space-y-2">
                {BM_configs.map((BM_config) => (
                  <li key={BM_config.BM_id}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-border-primary p-4 text-left hover:bg-background-secondary disabled:opacity-50"
                      disabled={BM_busy || BM_running || BM_creating}
                      aria-label={`选择配置 ${BM_config.BM_name} ${BM_config.BM_id}`}
                      onClick={() => {
                        void BM_select(BM_config.BM_id);
                      }}
                    >
                      <span className="font-medium">{BM_config.BM_name}</span>
                      {BM_config.BM_selected && <span className="ml-3 text-sm">当前配置</span>}
                      <span className="mt-1 block text-sm text-text-secondary">
                        抖音号：{BM_config.BM_account} · {BM_config.BM_work_count} 条作品
                      </span>
                      <span className="mt-1 block text-xs text-text-secondary">
                        {BM_config.BM_id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {BM_creating && (
            <BM_CreateConfigView
              BM_onClose={() => BM_setCreating(false)}
              BM_onSaved={(BM_next) => {
                BM_cursor.current = undefined;
                BM_setSnapshot(BM_next);
                BM_setRecords([]);
                BM_setCreating(false);
              }}
            />
          )}
          {(BM_error || BM_snapshot?.BM_error) && (
            <p role="alert" className="rounded-lg bg-background-tertiary p-3 text-sm">
              {BM_error || BM_snapshot?.BM_error}
            </p>
          )}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="队列统计">
            {['queued', 'review', 'approved', 'accepted'].map((BM_status) => (
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
                    {BM_record.BM_status === 'approved' && !BM_snapshot?.BM_write_ready
                      ? '已批准，发送功能未启用'
                      : BM_labels[BM_record.BM_status] || BM_record.BM_status}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words">{BM_record.BM_message.BM_text}</p>
                {BM_record.BM_reply && (
                  <div className="rounded-lg bg-background-secondary p-3">
                    <p className="mb-1 text-xs text-text-secondary">候选回复</p>
                    <p className="whitespace-pre-wrap break-words">{BM_record.BM_reply}</p>
                  </div>
                )}
                {BM_record.BM_delivery && (
                  <p className="text-sm text-text-secondary">
                    发送回执：
                    {BM_deliveryMessages[BM_record.BM_delivery.BM_code] ??
                      '请核对官方页面的提交结果'}
                    {BM_record.BM_delivery.BM_reply_id ? '；已记录平台回复 ID' : ''}
                  </p>
                )}
                {BM_record.BM_review && (
                  <p className="text-sm text-text-secondary">
                    审核：{BM_reviewReasons[BM_record.BM_review.BM_assessment.BM_reason]} ·
                    {BM_record.BM_review.BM_actor === 'auto'
                      ? '自动批准'
                      : BM_record.BM_review.BM_actor === 'admin'
                        ? '人工处理'
                        : '规则与审核检查'}
                  </p>
                )}
                {BM_record.BM_status === 'review' && (
                  <Button
                    disabled={
                      BM_busy ||
                      !!BM_snapshot?.BM_requires_restart ||
                      !BM_validReply(BM_record.BM_reply ?? '', BM_snapshot?.BM_max_reply_chars ?? 0)
                    }
                    onClick={() => {
                      void BM_approve(BM_record);
                    }}
                  >
                    批准此回复
                  </Button>
                )}
                {['review', 'failed', 'approved', 'rejected'].includes(BM_record.BM_status) && (
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
