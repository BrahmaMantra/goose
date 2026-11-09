import { describe, expect, it } from 'vitest';
import { BM_commentRequest, BM_parseCommentPage } from './BM_commentPage';
const BM_comment = {
  cid: '1234567890123456789',
  text: 'test',
  user: { uid: '9876543210123456789', nickname: 'BM_same_name' },
};
describe('official creator page comment observation', () => {
  it('accepts only readonly list routes for the selected work', () => {
    const BM_route =
      'https://creator.douyin.com/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/';
    expect(BM_commentRequest(BM_route + '?aweme_id=12345678', '12345678')).toBe(true);
    expect(BM_commentRequest(BM_route + '?aweme_id=99999999', '12345678')).toBe(false);
    expect(
      BM_commentRequest(
        BM_route.replace('creator.douyin.com', 'example.com') + '?aweme_id=12345678',
        '12345678'
      )
    ).toBe(false);
    expect(
      BM_commentRequest(
        'https://creator.douyin.com/aweme/v1/creator/comment/reply/list?item_id=12345678',
        '12345678'
      )
    ).toBe(false);
  });
  it('preserves IDs and text and uses the official author label rather than nicknames', () => {
    const BM_page = BM_parseCommentPage(
      {
        status_code: 0,
        has_more: 1,
        cursor: 10,
        comments: [BM_comment, { ...BM_comment, cid: '1234567890123456790', label_type: 1 }],
      },
      'BM_owner',
      '12345678'
    );
    expect(BM_page.BM_comments[0]).toEqual({
      BM_account: 'BM_owner',
      BM_work: '12345678',
      BM_comment: BM_comment.cid,
      BM_author: 'creator_uid:' + BM_comment.user.uid,
      BM_text: 'test',
      BM_is_ai_reply: false,
    });
    expect(BM_page.BM_comments[1].BM_author).toBe('BM_owner');
    expect(BM_page.BM_has_more).toBe(true);
  });
  it('accepts an explicit null terminal list without masking incomplete or malformed responses', () => {
    const BM_empty = BM_parseCommentPage(
      { status_code: 0, comments: null, cursor: 10, has_more: 0 },
      'BM_owner',
      '12345678'
    );
    expect(BM_empty.BM_comments).toEqual([]);
    expect(BM_empty.BM_has_more).toBe(false);
    expect(() =>
      BM_parseCommentPage(
        { status_code: 0, comments: null, cursor: 10, has_more: 1 },
        'BM_owner',
        '12345678'
      )
    ).toThrow();
    expect(() =>
      BM_parseCommentPage({ status_code: 0, cursor: 0, has_more: 0 }, 'BM_owner', '12345678')
    ).toThrow();
  });
  it('accepts legacy creator page responses and fails closed on platform errors or missing identities', () => {
    expect(
      BM_parseCommentPage(
        {
          status_code: 0,
          has_more: false,
          cursor: 0,
          comment_info_list: [
            {
              comment_id: 'BM_id',
              text: 'test',
              user_info: { user_id: 'BM_uid' },
              is_author: true,
            },
          ],
        },
        'BM_owner',
        '12345678'
      ).BM_comments[0].BM_author
    ).toBe('BM_owner');
    expect(() =>
      BM_parseCommentPage(
        { status_code: 8, has_more: false, cursor: 0, comments: [] },
        'BM_owner',
        '12345678'
      )
    ).toThrow();
    expect(() =>
      BM_parseCommentPage(
        { status_code: 0, has_more: false, cursor: 0, comments: [{ ...BM_comment, user: {} }] },
        'BM_owner',
        '12345678'
      )
    ).toThrow();
    expect(() =>
      BM_parseCommentPage(
        {
          status_code: 0,
          has_more: false,
          cursor: 0,
          comments: [{ ...BM_comment, cid: Number('1234567890123456789') }],
        },
        'BM_owner',
        '12345678'
      )
    ).toThrow();
  });
});
