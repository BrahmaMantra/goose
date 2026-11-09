import { z } from 'zod';
import { BM_sourceCommentSchema } from './BM_commentPage';
import { BM_validReply } from './BM_types';

export const BM_sendRequestSchema = z
  .object({
    BM_action: z.literal('send'),
    BM_message: BM_sourceCommentSchema,
    BM_reply: z.string().min(1).max(4000),
  })
  .strict();
export type BM_SendRequest = z.infer<typeof BM_sendRequestSchema>;
export const BM_deliverySchema = z
  .object({
    BM_state: z.enum(['accepted', 'rejected', 'blocked', 'unknown']),
    BM_code: z.string().max(100),
    BM_reply_id: z.string().min(1).max(512).nullable(),
  })
  .strict();
export type BM_Delivery = z.infer<typeof BM_deliverySchema>;
export const BM_delivery = (BM_state: BM_Delivery['BM_state'], BM_code: string): BM_Delivery => ({
  BM_state,
  BM_code,
  BM_reply_id: null,
});

const BM_modernReplyRoutes = [
  '/web/api/third_party/aweme/janus/creator/comment/aweme/v1/web/comment/multi_publish/',
  '/aweme/janus/creator/comment/aweme/v1/web/comment/multi_publish/',
];
const BM_legacyReplyRoute = '/aweme/v1/creator/comment/reply/';
export function BM_replyRoute(BM_url: string): boolean {
  try {
    const BM_value = new URL(BM_url);
    return (
      BM_value.origin === 'https://creator.douyin.com' &&
      (BM_modernReplyRoutes.includes(BM_value.pathname) ||
        BM_value.pathname === BM_legacyReplyRoute)
    );
  } catch {
    return false;
  }
}

export function BM_matchReplyRequest(
  BM_url: string,
  BM_method: string,
  BM_body: string,
  BM_request: BM_SendRequest,
  BM_itemIds: Set<string>
): boolean {
  if (BM_method !== 'POST' || !BM_replyRoute(BM_url)) return false;
  const BM_value = new URL(BM_url);
  try {
    const BM_modern = BM_modernReplyRoutes.includes(BM_value.pathname);
    if (
      BM_modern &&
      ['aweme_id', 'reply_to_comment_ids', 'text'].some(
        (BM_key) => BM_value.searchParams.getAll(BM_key).length !== 1
      )
    )
      return false;
    const BM_data = BM_modern ? Object.fromEntries(BM_value.searchParams) : JSON.parse(BM_body);
    if (BM_modern && BM_body) {
      const BM_post = JSON.parse(BM_body);
      if (
        ['aweme_id', 'reply_to_comment_ids', 'text'].some(
          (BM_key) => BM_key in BM_post && BM_post[BM_key] !== BM_data[BM_key]
        )
      )
        return false;
    }
    const BM_item = BM_data.aweme_id ?? BM_data.item_id;
    const BM_comment = BM_data.reply_to_comment_ids ?? BM_data.comment_Id;
    return (
      typeof BM_item === 'string' &&
      BM_itemIds.has(BM_item) &&
      BM_comment === BM_request.BM_message.BM_comment &&
      BM_data.text === BM_request.BM_reply
    );
  } catch {
    return false;
  }
}

export function BM_parseReplyReceipt(BM_value: unknown, BM_request: BM_SendRequest): BM_Delivery {
  const BM_payload = z
    .object({
      status_code: z.number().int(),
      comments: z.array(z.unknown()).optional(),
      comment_info: z.unknown().optional(),
    })
    .safeParse(BM_value);
  if (!BM_payload.success) return BM_delivery('unknown', 'BM_receipt_invalid');
  if (BM_payload.data.status_code !== 0) return BM_delivery('rejected', 'BM_platform_rejected');
  const BM_rows = BM_payload.data.comments;
  if (BM_rows) {
    if (BM_rows.length !== 1) return BM_delivery('unknown', 'BM_receipt_invalid');
    const BM_row = z
      .object({
        code: z.number().int(),
        reply_to_comment_id: z.string(),
        comment: z.unknown().optional(),
      })
      .safeParse(BM_rows[0]);
    if (!BM_row.success || BM_row.data.reply_to_comment_id !== BM_request.BM_message.BM_comment)
      return BM_delivery('unknown', 'BM_receipt_mismatch');
    if (BM_row.data.code !== 0) return BM_delivery('rejected', 'BM_platform_rejected');
    const BM_comment = z
      .object({ cid: z.string().min(1), text: z.string() })
      .safeParse(BM_row.data.comment);
    if (!BM_comment.success || BM_comment.data.text !== BM_request.BM_reply)
      return BM_delivery('unknown', 'BM_receipt_mismatch');
    return {
      BM_state: 'accepted',
      BM_code: 'BM_platform_accepted',
      BM_reply_id: BM_comment.data.cid,
    };
  }
  const BM_comment = z
    .object({ comment_id: z.string().min(1), text: z.string() })
    .safeParse(BM_payload.data.comment_info);
  if (!BM_comment.success || BM_comment.data.text !== BM_request.BM_reply)
    return BM_delivery('unknown', 'BM_receipt_invalid');
  return {
    BM_state: 'accepted',
    BM_code: 'BM_platform_accepted',
    BM_reply_id: BM_comment.data.comment_id,
  };
}

const BM_findReplyCard = `
  const BM_cards=[...document.querySelectorAll('[class*="comment-item-"]')].filter(BM_el=>[...BM_el.classList].some(BM_c=>BM_c.startsWith('comment-item-')));
  const BM_matches=BM_cards.filter(BM_el=>{
    const BM_key=Object.keys(BM_el).find(BM_k=>BM_k.startsWith('__reactFiber$'));
    let BM_f=BM_el[BM_key];
    for(let BM_i=0;BM_f&&BM_i<5;BM_i++,BM_f=BM_f.return){
      const BM_p=BM_f.memoizedProps;
      if(BM_p?.comment){
        const BM_c=BM_p.comment;
        const BM_author=BM_c.is_author?BM_request.BM_message.BM_account:'creator_uid:'+BM_c.user_info?.user_id;
        return BM_c.comment_id===BM_request.BM_message.BM_comment && BM_c.text===BM_request.BM_message.BM_text && BM_author===BM_request.BM_message.BM_author && BM_itemIds.includes(BM_p.itemId);
      }
    }
    return false;
  });
  if(BM_matches.length!==1)return false;
  const BM_card=BM_matches[0];
  const BM_ownControl=BM_el=>BM_el.closest('[class*="comment-item-"]')===BM_card;
`;
export function BM_replyPageScript(
  BM_request: BM_SendRequest,
  BM_itemIds: Set<string>,
  BM_action: 'open' | 'fill' | 'submit'
): string {
  if (!BM_validReply(BM_request.BM_reply, 500) || BM_request.BM_reply.length > 500)
    throw new Error('BM_reply_invalid');
  return `(()=>{
    const BM_request=${JSON.stringify(BM_request)};
    const BM_itemIds=${JSON.stringify([...BM_itemIds])};
    if(location.origin!=='https://creator.douyin.com'||location.pathname.replace(/\\/$/,'')!=='/creator-micro/work-management/work-detail/'+BM_request.BM_message.BM_work)return false;
    ${BM_findReplyCard}
    const BM_inputs=[...BM_card.querySelectorAll('[contenteditable="true"]')].filter(BM_ownControl);
    if(${JSON.stringify(BM_action)}==='open'){
      if(BM_inputs.length===1)return true;
      const BM_buttons=[...BM_card.querySelectorAll('button')].filter(BM_el=>BM_ownControl(BM_el)&&BM_el.innerText.trim()==='回复'&&!BM_el.disabled);
      if(BM_buttons.length!==1)return false;BM_buttons[0].click();return true;
    }
    if(BM_inputs.length!==1)return false;
    const BM_input=BM_inputs[0];
    if(${JSON.stringify(BM_action)}==='fill'){
      BM_input.focus();BM_input.textContent=BM_request.BM_reply;
      BM_input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:BM_request.BM_reply}));return true;
    }
    if(BM_input.textContent!==BM_request.BM_reply)return false;
    const BM_buttons=[...BM_card.querySelectorAll('button')].filter(BM_el=>BM_ownControl(BM_el)&&BM_el.innerText.trim()==='发送'&&!BM_el.disabled&&![...BM_el.classList].some(BM_class=>BM_class.startsWith('input-button-disabled')));
    if(BM_buttons.length!==1)return false;BM_buttons[0].click();return true;
  })()`;
}
