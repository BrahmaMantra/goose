import type { BM_Account } from './BM_privateConfig';

export const BM_loginMessages = {
  BM_window_unavailable: '扫码窗口已关闭或不属于当前页面，请重新打开扫码窗口。',
  BM_not_creator_home: '请在扫码窗口进入抖音创作者中心首页，然后再次读取账号。',
  BM_page_loading: '官方页面尚未加载完成，请稍候重试。',
  BM_login_required: '官方页面仍显示登录入口，请完成扫码及手机确认。',
  BM_account_header_missing: '已打开首页，但未识别到可见的抖音号标签；请刷新官方页面后重试。',
  BM_account_header_ambiguous: '页面存在多个抖音号标签，暂时无法确定账号，请停留在创作者中心首页。',
  BM_account_name_missing: '已识别抖音号，但无法确定昵称所在的账号区域，请刷新官方首页后重试。',
  BM_page_read_failed: '读取官方页面失败，请重新打开扫码窗口后重试。',
  BM_read_timeout: '读取账号超时，请确认官方首页加载完成后重试。',
} as const;
export type BM_LoginCode = keyof typeof BM_loginMessages;
export type BM_LoginResult =
  | { BM_status: 'opened' | 'cancelled'; BM_account?: BM_Account }
  | { BM_status: 'authenticated'; BM_account: BM_Account }
  | { BM_status: 'failed'; BM_code: BM_LoginCode };
