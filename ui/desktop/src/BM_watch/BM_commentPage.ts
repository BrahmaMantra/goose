import { z } from 'zod';

const BM_reference = z.string().min(1).max(512);
export const BM_sourceCommentSchema = z
  .object({
    BM_account: BM_reference,
    BM_work: BM_reference,
    BM_comment: BM_reference,
    BM_author: BM_reference,
    BM_text: z.string().min(1).max(16000),
    BM_is_ai_reply: z.boolean(),
  })
  .strict();
export type BM_SourceComment = z.infer<typeof BM_sourceCommentSchema>;
const BM_pageSchema = z.object({
  status_code: z.literal(0),
  has_more: z.union([z.boolean(), z.literal(0), z.literal(1)]),
  cursor: z.union([z.string(), z.number().int().nonnegative()]),
  comments: z.array(z.unknown()).nullable().optional(),
  comment_info_list: z.array(z.unknown()).nullable().optional(),
});
const BM_modernComment = z.object({
  cid: BM_reference,
  text: z.string(),
  user: z.object({ uid: BM_reference }),
  label_type: z.number().optional(),
  label_text: z.string().optional(),
});
const BM_legacyComment = z.object({
  comment_id: BM_reference,
  text: z.string(),
  user_info: z.object({ user_id: BM_reference }),
  is_author: z.boolean().optional(),
});
export const BM_commentRoutes = [
  '/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/',
  '/aweme/v1/creator/comment/list',
] as const;

export function BM_commentRequest(BM_value: string, BM_work: string): boolean {
  try {
    const BM_url = new URL(BM_value);
    return (
      BM_url.origin === 'https://creator.douyin.com' &&
      (BM_commentRoutes as readonly string[]).includes(BM_url.pathname) &&
      (BM_url.searchParams.get('aweme_id') === BM_work ||
        BM_url.searchParams.get('item_id') === BM_work)
    );
  } catch {
    return false;
  }
}

export function BM_parseCommentPage(BM_value: unknown, BM_account: string, BM_work: string) {
  const BM_page = BM_pageSchema.parse(BM_value);
  const BM_rows =
    BM_page.comments ??
    BM_page.comment_info_list ??
    (!BM_page.has_more && (BM_page.comments === null || BM_page.comment_info_list === null)
      ? []
      : undefined);
  if (!BM_rows) throw new Error('BM_comment_layout_changed');
  const BM_comments = BM_rows.map((BM_row) => {
    const BM_modern = BM_modernComment.safeParse(BM_row);
    const BM_legacy = BM_modern.success ? null : BM_legacyComment.parse(BM_row);
    const BM_own = BM_modern.success
      ? BM_modern.data.label_type === 1 || BM_modern.data.label_text === '作者'
      : BM_legacy!.is_author === true;
    return BM_sourceCommentSchema.parse({
      BM_account,
      BM_work,
      BM_comment: BM_modern.success ? BM_modern.data.cid : BM_legacy!.comment_id,
      BM_author: BM_own
        ? BM_account
        : `creator_uid:${BM_modern.success ? BM_modern.data.user.uid : BM_legacy!.user_info.user_id}`,
      BM_text: BM_modern.success ? BM_modern.data.text : BM_legacy!.text,
      BM_is_ai_reply: false,
    });
  });
  return { BM_comments, BM_has_more: Boolean(BM_page.has_more), BM_cursor: String(BM_page.cursor) };
}

export const BM_nextCommentsScript = `(() => {
  if(location.origin !== 'https://creator.douyin.com' || !/^\\/creator-micro\\/work-management\\/work-detail\\/\\d+$/.test(location.pathname.replace(/\\/$/,''))) return false;
  const BM_visible = BM_el => BM_el.getClientRects().length > 0 && getComputedStyle(BM_el).visibility !== 'hidden';
  const BM_buttons = [...document.querySelectorAll('button')].filter(BM_el => BM_visible(BM_el) && /^(加载更多|查看更多|加载更多评论)$/.test(BM_el.innerText.trim()));
  if(BM_buttons.length === 1){ BM_buttons[0].click(); return true; }
  const BM_lists = [...document.querySelectorAll('div')].filter(BM_el => BM_visible(BM_el) && [...BM_el.classList].some(BM_class => BM_class.startsWith('list-')) && BM_el.querySelector('[class*="comment-item-"]'));
  const BM_scroll = BM_lists.filter(BM_el => BM_el.scrollHeight > BM_el.clientHeight && /auto|scroll/.test(getComputedStyle(BM_el).overflowY));
  if(BM_scroll.length === 1){ BM_scroll[0].scrollTop=BM_scroll[0].scrollHeight; BM_scroll[0].dispatchEvent(new Event('scroll',{bubbles:true})); return true; }
  const BM_scroller=document.scrollingElement;
  if(!BM_scroller)return false;
  BM_scroller.scrollTop=BM_scroller.scrollHeight;
  window.dispatchEvent(new Event('scroll')); return true;
})()`;
