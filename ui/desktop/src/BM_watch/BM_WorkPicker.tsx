import type { BM_Work } from './BM_works';

export default function BM_WorkPicker({
  BM_items,
  BM_selected,
  BM_onChange,
  BM_busy,
}: {
  BM_items: BM_Work[];
  BM_selected: string[];
  BM_onChange: (BM_ids: string[]) => void;
  BM_busy: boolean;
}) {
  return (
    <div className="max-h-96 space-y-2 overflow-y-auto" aria-label="选择自己的作品">
      {BM_items.map((BM_item, BM_position) => (
        <label
          key={`${BM_item.BM_index}:${BM_item.BM_id}`}
          className="flex items-start gap-3 rounded-lg border border-border-primary p-3 text-sm"
        >
          <input
            type="checkbox"
            className="mt-1"
            disabled={BM_busy || BM_item.BM_disabled || !BM_item.BM_id}
            checked={!!BM_item.BM_id && BM_selected.includes(BM_item.BM_id)}
            onChange={(BM_event) => {
              if (!BM_item.BM_id) return;
              BM_onChange(
                BM_event.target.checked
                  ? [...new Set([...BM_selected, BM_item.BM_id])]
                  : BM_selected.filter((BM_id) => BM_id !== BM_item.BM_id)
              );
            }}
          />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block break-words">
              {BM_position + 1}. {BM_item.BM_title_text || '（无标题）'}
            </span>
            <span className="block text-text-secondary">
              {BM_item.BM_publish_time_text || '页面未显示发布时间'}
              {BM_item.BM_status_text && ` · ${BM_item.BM_status_text}`}
              {BM_item.BM_pinned && ' · 置顶'}
            </span>
            {BM_item.BM_disabled && (
              <span className="block text-text-secondary">
                该作品当前无法取得可用的官方详情标识，暂不可选
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
