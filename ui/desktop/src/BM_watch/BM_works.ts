import { z } from 'zod';

export const BM_worksActionSchema = z.enum(['refresh', 'more']);
export type BM_WorksAction = z.infer<typeof BM_worksActionSchema>;
export const BM_workSchema = z
  .object({
    BM_index: z.number().int().nonnegative().max(500),
    BM_title_text: z.string().max(500),
    BM_publish_time_text: z.string().max(100),
    BM_status_text: z.string().max(100),
    BM_pinned: z.boolean(),
    BM_disabled: z.boolean(),
    BM_id: z
      .string()
      .regex(/^\d{5,30}$/)
      .nullable(),
  })
  .strict();
export type BM_Work = z.infer<typeof BM_workSchema>;
export const BM_worksObservationSchema = z
  .object({
    BM_items: z.array(BM_workSchema).max(100),
    BM_order_text: z.string().max(100),
  })
  .strict();
export const BM_worksMessages = {
  BM_works_login_changed: '扫码窗口的账号已变化，请重新确认账号后读取作品。',
  BM_works_not_ready: '尚未读取到作品管理列表，请等待官方页面加载后重试。',
  BM_works_layout_changed: '官方作品列表结构无法识别，请停留在作品管理页面后重试。',
  BM_works_read_failed: '读取作品未完成，请检查扫码窗口与网络后重试。',
} as const;
export type BM_WorksResult =
  | {
      BM_status: 'ready';
      BM_items: BM_Work[];
      BM_order_text: string;
      BM_can_load_more: boolean;
      BM_complete: false;
    }
  | { BM_status: 'failed'; BM_code: keyof typeof BM_worksMessages };

export function BM_workDetailId(BM_value: string): string | null {
  try {
    const BM_url = new URL(BM_value);
    if (BM_url.origin !== 'https://creator.douyin.com' || BM_url.username || BM_url.password)
      return null;
    return (
      /^\/creator-micro\/work-management\/work-detail\/(\d{5,30})\/?$/.exec(BM_url.pathname)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

// Public creator_content/manage component: visible v2 cards and their readonly root click.
const BM_workDom = `
  const BM_visible = BM_el => BM_el.getClientRects().length > 0 && getComputedStyle(BM_el).visibility !== 'hidden';
  const BM_text = BM_el => (BM_el?.innerText ?? BM_el?.textContent ?? '').trim();
  const BM_field = (BM_el, BM_key) => [...BM_el.classList].some(BM_token => BM_token === BM_key || BM_token.startsWith(BM_key + '-'));
  const BM_lists = [...document.querySelectorAll('div')].filter(BM_el => BM_field(BM_el, 'manage-v2-list') && BM_visible(BM_el));
  if (location.origin !== 'https://creator.douyin.com' || location.pathname !== '/creator-micro/content/manage' || BM_lists.length !== 1) return null;
  const BM_list = BM_lists[0];
  const BM_cards = [...BM_list.querySelectorAll('div')].filter(BM_el => BM_field(BM_el, 'video-card-v2') && BM_visible(BM_el));
`;
export const BM_readWorksScript = `(BM_limit => {${BM_workDom}
  const BM_items = BM_cards.slice(0, BM_limit).map((BM_card, BM_index) => {
    const BM_find = BM_key => [...BM_card.querySelectorAll('*')].filter(BM_el => BM_field(BM_el, BM_key) && BM_visible(BM_el));
    const BM_titles = BM_find('info-title-text');
    if (BM_titles.length !== 1) return null;
    const BM_times = BM_find('info-time');
    const BM_statuses = BM_find('info-status');
    return {BM_index, BM_title_text:Array.from(BM_text(BM_titles[0])).slice(0,500).join(''),
      BM_publish_time_text:Array.from(BM_text(BM_times[0])).slice(0,100).join(''),
      BM_status_text:Array.from(BM_text(BM_statuses[0])).slice(0,100).join(''),
      BM_pinned:BM_find('badge-top').some(BM_el => BM_text(BM_el) === '置顶'),
      BM_disabled:BM_field(BM_card,'video-card-new-disabled'), BM_id:null};
  });
  if (BM_items.some(BM_item => !BM_item)) return null;
  const BM_sort = document.querySelector('[aria-label="作品排序"]');
  const BM_order_text = BM_sort && BM_visible(BM_sort) ? BM_text(BM_sort).slice(0,100) : '沿用官方页面顺序';
  return {BM_items, BM_order_text};
})`;
export const BM_scrollWorksScript = `(() => {${BM_workDom}
  const BM_scroll = [...BM_list.querySelectorAll('div')].filter(BM_el => BM_field(BM_el,'list-scroll') && BM_visible(BM_el));
  if (BM_scroll.length !== 1) return false;
  BM_scroll[0].scrollTop = BM_scroll[0].scrollHeight;
  BM_scroll[0].dispatchEvent(new Event('scroll', {bubbles:true}));
  return true;
})()`;
export function BM_clickWorkScript(BM_item: BM_Work): string {
  const BM_expected = JSON.stringify({
    BM_index: BM_item.BM_index,
    BM_title_text: BM_item.BM_title_text,
  });
  return `(BM_expected => {${BM_workDom}
    const BM_card = BM_cards[BM_expected.BM_index];
    if (!BM_card || BM_field(BM_card,'video-card-new-disabled')) return false;
    const BM_titles = [...BM_card.querySelectorAll('*')].filter(BM_el => BM_field(BM_el,'info-title-text') && BM_visible(BM_el));
    if (BM_titles.length !== 1 || Array.from(BM_text(BM_titles[0])).slice(0,500).join('') !== BM_expected.BM_title_text) return false;
    BM_card.click();
    return true;
  })(${BM_expected})`;
}
