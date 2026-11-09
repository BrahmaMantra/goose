export default function BM_ReviewSwitch({
  BM_enabled,
  BM_disabled,
  BM_onChange,
}: {
  BM_enabled: boolean;
  BM_disabled: boolean;
  BM_onChange: (BM_enabled: boolean) => void;
}) {
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          role="switch"
          aria-label="自动审核"
          checked={BM_enabled}
          disabled={BM_disabled}
          onChange={(BM_event) => BM_onChange(BM_event.target.checked)}
        />
        <span>自动审核：{BM_enabled ? 'ON' : 'OFF'}</span>
      </label>
      <p className="text-text-secondary">
        ON：低风险候选自动批准，其余待人工审核。OFF：所有候选待人工审核。关闭时，未发送的自动批准回复撤回待审核；已有待审核内容不会因开启而批量放行。
      </p>
    </div>
  );
}
