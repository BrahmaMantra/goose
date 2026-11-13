import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import {
  BM_defaultManualReply,
  BM_markManualReply,
  BM_validManualReply,
  type BM_ManualReplyMode,
  type BM_Record,
  type BM_Snapshot,
} from './BM_types';

export function BM_DefaultReplySettings({
  BM_snapshot,
  BM_disabled,
  BM_onSaved,
}: {
  BM_snapshot: BM_Snapshot;
  BM_disabled: boolean;
  BM_onSaved: () => Promise<void>;
}) {
  const [BM_text, BM_setText] = useState(BM_snapshot.BM_default_reply ?? BM_defaultManualReply);
  const [BM_busy, BM_setBusy] = useState(false);
  const [BM_error, BM_setError] = useState('');
  useEffect(() => {
    BM_setText(BM_snapshot.BM_default_reply ?? BM_defaultManualReply);
  }, [BM_snapshot.BM_default_reply]);
  const BM_valid = BM_validManualReply(
    BM_markManualReply(BM_text, BM_snapshot.BM_reply_marker),
    BM_snapshot.BM_reply_marker,
    BM_snapshot.BM_max_reply_chars
  );
  const BM_save = async () => {
    BM_setBusy(true);
    BM_setError('');
    try {
      await window.electron.BM_watchSetDefaultReply(BM_text);
      await BM_onSaved();
    } catch {
      BM_setError('默认回复未保存，请检查长度、私有目录权限及配置。');
    } finally {
      BM_setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        默认回复正文
        <textarea
          aria-label="默认回复正文"
          className="mt-1 w-full rounded border bg-background-default p-2"
          value={BM_text}
          disabled={BM_disabled || BM_busy}
          onChange={(BM_event) => BM_setText(BM_event.target.value)}
        />
      </label>
      <p className="text-xs text-text-secondary">
        仅保存到当前配置的私有目录；保存不会发送评论。使用时会展示完整回复供你确认。
      </p>
      <Button
        variant="outline"
        disabled={BM_disabled || BM_busy || !BM_valid}
        onClick={() => {
          void BM_save();
        }}
      >
        保存默认回复
      </Button>
      {BM_error && <p role="alert">{BM_error}</p>}
    </div>
  );
}

export function BM_ManualReplyActions({
  BM_record,
  BM_snapshot,
  BM_disabled,
  BM_onDone,
}: {
  BM_record: BM_Record;
  BM_snapshot: BM_Snapshot;
  BM_disabled: boolean;
  BM_onDone: () => Promise<void>;
}) {
  const [BM_mode, BM_setMode] = useState<BM_ManualReplyMode | null>(null);
  const [BM_text, BM_setText] = useState('');
  const [BM_busy, BM_setBusy] = useState(false);
  const [BM_error, BM_setError] = useState('');
  const BM_default = BM_snapshot.BM_default_reply ?? BM_defaultManualReply;
  const BM_reply = BM_markManualReply(
    BM_mode === 'default' ? BM_default : BM_text,
    BM_snapshot.BM_reply_marker
  );
  useEffect(() => {
    BM_setMode(null);
    BM_setText('');
    BM_setError('');
  }, [BM_record.BM_reply]);
  const BM_confirm = async () => {
    if (!BM_mode) return;
    BM_setBusy(true);
    BM_setError('');
    try {
      await window.electron.BM_watchManualReply(
        BM_record.BM_id,
        BM_record.BM_reply,
        BM_reply,
        BM_mode
      );
      BM_setMode(null);
      await BM_onDone();
    } catch {
      BM_setError('未批准发送，请刷新记录；状态、候选正文或默认回复可能已变化。');
    } finally {
      BM_setBusy(false);
    }
  };
  const BM_locked = BM_disabled || BM_busy || !BM_snapshot.BM_manual_reply_ready;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={BM_locked}
          onClick={() => {
            BM_setMode('default');
            BM_setError('');
          }}
        >
          默认回复
        </Button>
        <Button
          variant="outline"
          disabled={BM_locked}
          onClick={() => {
            BM_setMode('custom');
            BM_setError('');
          }}
        >
          自定义回复
        </Button>
      </div>
      {!BM_snapshot.BM_manual_reply_ready && (
        <p className="text-xs text-text-secondary">更新并重启后台后可使用默认回复和自定义回复。</p>
      )}
      {BM_mode && (
        <div className="space-y-2 rounded border p-3">
          {BM_mode === 'custom' && (
            <label className="block text-sm">
              自定义回复正文
              <textarea
                aria-label="自定义回复正文"
                className="mt-1 w-full rounded border bg-background-default p-2"
                value={BM_text}
                disabled={BM_busy}
                onChange={(BM_event) => BM_setText(BM_event.target.value)}
              />
            </label>
          )}
          <p className="text-sm">将发送的完整回复：</p>
          <p className="whitespace-pre-wrap break-words">{BM_reply || '请填写回复正文'}</p>
          <p className="text-xs text-text-secondary">
            {Array.from(BM_reply).length} / {BM_snapshot.BM_max_reply_chars}{' '}
            字符。确认代表你的人工批准；后台开始值守后按队列发送。
          </p>
          <Button
            disabled={
              BM_locked ||
              !BM_validManualReply(
                BM_reply,
                BM_snapshot.BM_reply_marker,
                BM_snapshot.BM_max_reply_chars
              )
            }
            onClick={() => {
              void BM_confirm();
            }}
          >
            确认并批准发送
          </Button>
          <Button variant="outline" disabled={BM_busy} onClick={() => BM_setMode(null)}>
            取消
          </Button>
        </div>
      )}
      {BM_error && <p role="alert">{BM_error}</p>}
    </div>
  );
}
