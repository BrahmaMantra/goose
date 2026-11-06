import { expect, it, vi } from 'vitest';
import {
  BM_readWorksScript,
  BM_scrollWorksScript,
  BM_clickWorkScript,
  BM_workDetailId,
  BM_worksObservationSchema,
} from './BM_works';

it('accepts only numeric IDs from official readonly detail URLs', () => {
  expect(
    BM_workDetailId(
      'https://creator.douyin.com/creator-micro/work-management/work-detail/123456789?enter_from=content'
    )
  ).toBe('123456789');
  for (const BM_url of [
    'https://example.com/creator-micro/work-management/work-detail/123456789',
    'http://creator.douyin.com/creator-micro/work-management/work-detail/123456789',
    'https://creator.douyin.com/creator-micro/content/upload?iid=123456789',
    'https://user@creator.douyin.com/creator-micro/work-management/work-detail/123456789',
  ])
    expect(BM_workDetailId(BM_url)).toBeNull();
});
it('preserves DOM order and pin badges, ignores hidden cards and clicks only the card root', () => {
  document.body.innerHTML = `<div aria-label="作品排序">最新发布</div><div class="manage-v2-list-BM_test"><div class="list-scroll-BM_test">
    <div class="video-card-v2-BM_test"><span class="info-title-text-BM_test">BM older pinned</span><span class="info-time-BM_test">BM time</span><span class="badge-top-BM_test">置顶</span><button>BM edit</button></div>
    <div class="video-card-v2-BM_test"><span class="info-title-text-BM_test">BM newer</span></div>
    <div class="video-card-v2-BM_test" style="display:none"><span class="info-title-text-BM_test">BM hidden</span></div>
  </div></div>`;
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (window.getComputedStyle(this).display === 'none' ? [] : [{}]) as unknown as ReturnType<
      Element['getClientRects']
    >;
  });
  const BM_location = {
    origin: 'https://creator.douyin.com',
    pathname: '/creator-micro/content/manage',
  };
  const BM_eval = (BM_script: string) =>
    new Function('location', 'document', 'getComputedStyle', 'Event', `return ${BM_script}`)(
      BM_location,
      document,
      window.getComputedStyle,
      window.Event
    );
  try {
    const BM_result = BM_worksObservationSchema.parse(BM_eval(`${BM_readWorksScript}(12)`));
    expect(BM_result.BM_items.map((BM_item) => BM_item.BM_title_text)).toEqual([
      'BM older pinned',
      'BM newer',
    ]);
    expect(BM_result.BM_items[0].BM_pinned).toBe(true);
    const BM_cards = document.querySelectorAll('[class^="video-card-v2-"]');
    const BM_rootClick = vi.fn();
    const BM_editClick = vi.fn();
    BM_cards[0].addEventListener('click', BM_rootClick);
    BM_cards[0].querySelector('button')?.addEventListener('click', BM_editClick);
    expect(BM_eval(BM_clickWorkScript(BM_result.BM_items[0]))).toBe(true);
    expect(BM_rootClick).toHaveBeenCalledOnce();
    expect(BM_editClick).not.toHaveBeenCalled();
    expect(
      BM_eval(BM_clickWorkScript({ ...BM_result.BM_items[0], BM_title_text: 'BM changed' }))
    ).toBe(false);
    const BM_scroll = document.querySelector('[class^="list-scroll-"]');
    const BM_scrolled = vi.fn();
    BM_scroll?.addEventListener('scroll', BM_scrolled);
    expect(BM_eval(BM_scrollWorksScript)).toBe(true);
    expect(BM_scrolled).toHaveBeenCalledOnce();
  } finally {
    vi.restoreAllMocks();
  }
});
