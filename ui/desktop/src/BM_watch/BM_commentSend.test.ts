import { describe, expect, it } from 'vitest';
import {
  BM_matchReplyRequest,
  BM_parseReplyReceipt,
  BM_replyPageScript,
  type BM_SendRequest,
} from './BM_commentSend';
const BM_request: BM_SendRequest = {
  BM_action: 'send',
  BM_reply: '【from BM model】 你好！',
  BM_message: {
    BM_account: 'BM_owner',
    BM_work: '12345678',
    BM_comment: 'BM_comment',
    BM_author: 'creator_uid:BM_reader',
    BM_text: '你好',
    BM_is_ai_reply: false,
  },
};
const BM_route =
  'https://creator.douyin.com/web/api/third_party/aweme/janus/creator/comment/aweme/v1/web/comment/multi_publish/';
const BM_url =
  BM_route +
  '?' +
  new URLSearchParams({
    aweme_id: 'BM_mapped_item',
    reply_to_comment_ids: BM_request.BM_message.BM_comment,
    text: BM_request.BM_reply,
  });
const BM_itemIds = new Set(['12345678', 'BM_mapped_item']);
describe('BM bound comment delivery', () => {
  it('admits only the exact approved text and one target on official reply routes', () => {
    expect(BM_matchReplyRequest(BM_url, 'POST', '', BM_request, BM_itemIds)).toBe(true);
    for (const BM_changed of [
      BM_url.replace('creator.douyin.com', 'example.com'),
      BM_url.replace('multi_publish', 'multi_delete'),
      BM_url + '&reply_to_comment_ids=BM_other',
    ]) {
      expect(BM_matchReplyRequest(BM_changed, 'POST', '', BM_request, BM_itemIds)).toBe(false);
    }
    expect(BM_matchReplyRequest(BM_url, 'GET', '', BM_request, BM_itemIds)).toBe(false);
    expect(
      BM_matchReplyRequest(
        BM_url,
        'POST',
        JSON.stringify({ text: '其他正文' }),
        BM_request,
        BM_itemIds
      )
    ).toBe(false);
    expect(
      BM_matchReplyRequest(
        BM_url,
        'POST',
        '',
        { ...BM_request, BM_reply: '另一份正文' },
        BM_itemIds
      )
    ).toBe(false);
    expect(BM_matchReplyRequest(BM_url, 'POST', '', BM_request, new Set(['BM_other']))).toBe(false);
    expect(
      BM_matchReplyRequest(
        'https://creator.douyin.com/aweme/v1/creator/comment/reply/',
        'POST',
        JSON.stringify({
          comment_Id: 'BM_comment',
          item_id: 'BM_mapped_item',
          text: BM_request.BM_reply,
        }),
        BM_request,
        BM_itemIds
      )
    ).toBe(true);
  });
  it('distinguishes accepted, explicit rejection and missing or mismatched receipts', () => {
    const BM_success = {
      status_code: 0,
      comments: [
        {
          code: 0,
          reply_to_comment_id: 'BM_comment',
          comment: { cid: 'BM_platform_reply', text: BM_request.BM_reply },
        },
      ],
    };
    expect(BM_parseReplyReceipt(BM_success, BM_request)).toEqual({
      BM_state: 'accepted',
      BM_code: 'BM_platform_accepted',
      BM_reply_id: 'BM_platform_reply',
    });
    expect(BM_parseReplyReceipt({ status_code: 8 }, BM_request).BM_state).toBe('rejected');
    expect(
      BM_parseReplyReceipt(
        { status_code: 0, comments: [{ code: 1, reply_to_comment_id: 'BM_comment' }] },
        BM_request
      ).BM_state
    ).toBe('rejected');
    for (const BM_value of [
      { status_code: 0 },
      { ...BM_success, comments: [] },
      { ...BM_success, comments: [{ code: 0, reply_to_comment_id: 'BM_other' }] },
      'bad json',
    ]) {
      expect(BM_parseReplyReceipt(BM_value, BM_request).BM_state).toBe('unknown');
    }
  });
  it('uses only the matched comment card and refuses stale input before clicking send', () => {
    document.body.innerHTML =
      '<div class="comment-item-BM"><button>回复</button></div><div class="comment-item-BM_other"><button>回复</button></div>';
    const BM_card = document.querySelector('.comment-item-BM') as HTMLElement;
    const BM_other = document.querySelector('.comment-item-BM_other') as HTMLElement;
    for (const [BM_el, BM_id] of [
      [BM_card, 'BM_comment'],
      [BM_other, 'BM_other'],
    ] as const) {
      Object.defineProperty(BM_el, '__reactFiber$BM', {
        enumerable: true,
        value: {
          memoizedProps: {},
          return: {
            memoizedProps: {
              itemId: 'BM_mapped_item',
              comment: {
                comment_id: BM_id,
                text: '你好',
                user_info: { user_id: 'BM_reader' },
                is_author: false,
              },
            },
          },
        },
      });
    }
    for (const BM_button of document.querySelectorAll('button'))
      Object.defineProperty(BM_button, 'innerText', { get: () => BM_button.textContent });
    let BM_sent = 0;
    BM_card.querySelector('button')!.addEventListener('click', () => {
      BM_card.insertAdjacentHTML(
        'beforeend',
        '<div contenteditable="true"></div><button class="BM_send">发送</button>'
      );
      const BM_button = BM_card.querySelector('.BM_send')!;
      Object.defineProperty(BM_button, 'innerText', { get: () => BM_button.textContent });
      BM_button.addEventListener('click', () => BM_sent++);
    });
    const BM_run = (BM_action: 'open' | 'fill' | 'submit', BM_override = BM_request) =>
      new Function(
        'location',
        'document',
        'InputEvent',
        'return ' + BM_replyPageScript(BM_override, BM_itemIds, BM_action)
      )(
        {
          origin: 'https://creator.douyin.com',
          pathname: '/creator-micro/work-management/work-detail/12345678',
        },
        document,
        window.InputEvent
      );
    expect(BM_run('open')).toBe(true);
    expect(BM_run('fill')).toBe(true);
    expect(BM_card.querySelector('[contenteditable]')!.textContent).toBe(BM_request.BM_reply);
    expect(BM_run('submit', { ...BM_request, BM_reply: '改变后的正文' })).toBe(false);
    expect(BM_sent).toBe(0);
    expect(BM_run('submit')).toBe(true);
    expect(BM_sent).toBe(1);
    expect(BM_other.querySelector('[contenteditable]')).toBeNull();
    document.body.innerHTML = '';
  });
});
