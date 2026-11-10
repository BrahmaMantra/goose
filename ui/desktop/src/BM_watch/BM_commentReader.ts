import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { performance as BM_clock } from 'node:perf_hooks';
import { z } from 'zod';
import { BM_readAccountScript, BM_allowedLoginUrl, BM_creatorUrl } from './BM_login';
import { BM_privateDirectory, BM_accountSchema } from './BM_privateConfig';
import { BM_rulesSchema, BM_validReply } from './BM_types';
import { BM_PageRuntime, BM_needsNavigation } from './BM_pageRuntime';
import { BM_PageNetwork } from './BM_pageNetwork';
import {
  BM_delivery,
  BM_sendRequestSchema,
  BM_replyRoute,
  BM_matchReplyRequest,
  BM_parseReplyReceipt,
  BM_replyPageScript,
  BM_verifyReplyScript,
  type BM_SendRequest,
  type BM_Delivery,
} from './BM_commentSend';
import {
  BM_commentRequest,
  BM_parseCommentPage,
  BM_nextCommentsScript,
  type BM_SourceComment,
} from './BM_commentPage';

async function BM_privateJson(BM_file: string): Promise<unknown> {
  const BM_handle = await fs.open(BM_file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const BM_stat = await BM_handle.stat();
    if (!BM_stat.isFile() || (BM_stat.mode & 0o077) !== 0 || BM_stat.size > 1024 * 1024)
      throw new Error('BM_private_file_invalid');
    return JSON.parse(await BM_handle.readFile('utf8'));
  } finally {
    await BM_handle.close();
  }
}
async function BM_timeout<T>(BM_work: Promise<T>, BM_ms = 10000): Promise<T> {
  let BM_timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      BM_work,
      new Promise<never>((_BM_resolve, BM_reject) => {
        BM_timer = setTimeout(() => BM_reject(new Error('BM_page_timeout')), BM_ms);
      }),
    ]);
  } finally {
    if (BM_timer) clearTimeout(BM_timer);
  }
}
const BM_wait = (BM_ms: number) => new Promise<void>((BM_resolve) => setTimeout(BM_resolve, BM_ms));

export async function BM_runCommentReader(): Promise<void> {
  let BM_window: BrowserWindow | undefined;
  try {
    const BM_file = z.string().refine(path.isAbsolute).parse(process.env.BM_READER_CONFIG);
    const BM_config = z
      .object({ BM_data_dir: z.string().refine(path.isAbsolute), BM_rules: BM_rulesSchema })
      .parse(await BM_privateJson(BM_file));
    const BM_data = await BM_privateDirectory(BM_config.BM_data_dir);
    const BM_profile = path.dirname(BM_data);
    const BM_browser = path.join(BM_data, 'BM_reader_browser');
    await BM_privateDirectory(path.join(BM_data, 'BM_reader_app'));
    app.setPath('userData', path.join(BM_data, 'BM_reader_app'));
    app.commandLine.appendSwitch('disable-logging');
    // A reader owns its copy; it never opens the desktop login profile concurrently.
    try {
      await fs.lstat(BM_browser);
    } catch {
      await fs.cp(path.join(BM_profile, 'BM_browser'), BM_browser, {
        recursive: true,
        filter: (BM_path) =>
          ![
            'blob_storage',
            'DawnGraphiteCache',
            'GPUCache',
            'File System',
            'Shared Dictionary',
            'DawnWebGPUCache',
            'Code Cache',
          ].includes(path.basename(BM_path)),
      });
    }
    await BM_privateDirectory(BM_browser);
    await app.whenReady();
    const BM_session = session.fromPath(BM_browser, { cache: true });
    BM_session.setPermissionRequestHandler((_BM_contents, _BM_permission, BM_callback) =>
      BM_callback(false)
    );
    BM_session.setPermissionCheckHandler(() => false);
    BM_session.on('will-download', (BM_event) => BM_event.preventDefault());
    let BM_sending: {
      BM_request: BM_SendRequest;
      BM_itemIds: Set<string>;
      BM_attempted: boolean;
      BM_networkId?: string;
      BM_result?: BM_Delivery;
      BM_rejected: boolean;
    } | null = null;
    BM_session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (BM_details, BM_callback) => {
      const BM_path = new URL(BM_details.url).pathname;
      if (!BM_path.includes('/comment/') || BM_details.method === 'GET') {
        BM_callback({ cancel: false });
        return;
      }
      const BM_attempt = BM_sending;
      const BM_body = (BM_details.uploadData ?? [])
        .map((BM_part) => BM_part.bytes?.toString('utf8') ?? '')
        .join('');
      const BM_allowed =
        !!BM_attempt &&
        !BM_attempt.BM_attempted &&
        BM_matchReplyRequest(
          BM_details.url,
          BM_details.method,
          BM_body,
          BM_attempt.BM_request,
          BM_attempt.BM_itemIds
        );
      if (BM_attempt && !BM_allowed) {
        const BM_url = new URL(BM_details.url);
        let BM_post: Record<string, unknown> = {};
        try {
          const BM_value = JSON.parse(BM_body);
          if (BM_value && typeof BM_value === 'object') BM_post = BM_value;
        } catch {
          BM_post = Object.fromEntries(new URLSearchParams(BM_body));
        }
        const BM_query = Object.fromEntries(BM_url.searchParams);
        void fs
          .writeFile(
            path.join(BM_data, 'BM_reply_request_check.local.json'),
            JSON.stringify({
              BM_host: BM_url.hostname,
              BM_path: BM_url.pathname,
              BM_method: BM_details.method,
              BM_query_keys: Object.keys(BM_query),
              BM_body_keys: Object.keys(BM_post),
              BM_route_matches: BM_replyRoute(BM_details.url),
              BM_query_item_matches: BM_attempt.BM_itemIds.has(
                BM_query.aweme_id ?? BM_query.item_id
              ),
              BM_query_comment_matches:
                (BM_query.reply_to_comment_ids ?? BM_query.comment_Id) ===
                BM_attempt.BM_request.BM_message.BM_comment,
              BM_query_text_matches: BM_query.text === BM_attempt.BM_request.BM_reply,
              BM_body_item_matches: BM_attempt.BM_itemIds.has(
                String(BM_post.aweme_id ?? BM_post.item_id)
              ),
              BM_body_comment_matches:
                (BM_post.reply_to_comment_ids ?? BM_post.comment_Id) ===
                BM_attempt.BM_request.BM_message.BM_comment,
              BM_body_text_matches: BM_post.text === BM_attempt.BM_request.BM_reply,
            }),
            { mode: 0o600 }
          )
          .catch(() => undefined);
      }
      if (BM_allowed) BM_attempt!.BM_attempted = true;
      else if (BM_attempt) BM_attempt.BM_rejected = true;
      BM_callback({ cancel: !BM_allowed });
    });
    // Session cookies need an explicit private snapshot to survive browser/session restarts.
    try {
      const BM_cookies = z
        .array(
          z.object({
            name: z.string(),
            value: z.string(),
            domain: z.string(),
            path: z.string(),
            secure: z.boolean(),
            httpOnly: z.boolean(),
            sameSite: z.enum(['unspecified', 'no_restriction', 'lax', 'strict']),
            expirationDate: z.number().optional(),
          })
        )
        .max(500)
        .parse(
          await BM_privateJson(
            await fs
              .access(path.join(BM_data, 'BM_reader_cookies.local.json'))
              .then(() => path.join(BM_data, 'BM_reader_cookies.local.json'))
              .catch(() => path.join(BM_profile, 'BM_cookies.local.json'))
          )
        );
      for (const BM_cookie of BM_cookies) {
        if (!(BM_cookie.domain === 'douyin.com' || BM_cookie.domain?.endsWith('.douyin.com')))
          continue;
        await BM_session.cookies.set({
          ...BM_cookie,
          url: `https://${BM_cookie.domain.replace(/^\./, '')}${BM_cookie.path}`,
        });
      }
    } catch {
      /* Existing profiles may predate cookie snapshots. The official login page handles recovery. */
    }
    BM_window = new BrowserWindow({
      show: false,
      title: '抖音评论读取 · 请扫码登录',
      width: 1100,
      height: 800,
      webPreferences: {
        session: BM_session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: false,
        backgroundThrottling: false,
      },
    });
    const BM_view = BM_window;
    BM_view.setTitle(`抖音评论读取 · 配置账号 ${BM_config.BM_rules.BM_account}`);
    const BM_network = new BM_PageNetwork();
    const BM_runtime = new BM_PageRuntime(BM_view.webContents.debugger);
    let BM_stage = 'initialization';
    let BM_lastAccountCode = 'BM_page_loading';
    let BM_loginWindowShown = false;
    const BM_showLogin = () => {
      if (!BM_loginWindowShown) {
        BM_view.show();
        BM_view.focus();
        BM_loginWindowShown = true;
      }
    };
    type BM_AccountObservation = {
      BM_account?: z.infer<typeof BM_accountSchema>;
      BM_code?: string;
    };
    const BM_eval = <T = unknown>(BM_script: string, BM_gesture = false) =>
      BM_runtime.BM_evaluate<T>(BM_script, BM_gesture);
    const BM_diagnostic = async () => {
      let BM_page = {};
      try {
        BM_page = await BM_timeout(
          BM_eval<Record<string, unknown>>(
            `({BM_ready:document.readyState,BM_login_visible:/扫码登录/.test(document.body?.innerText??''),BM_comment_tab_count:document.querySelectorAll('[data-comment-entry-guide-target]').length,BM_comment_card_count:document.querySelectorAll('[class*="comment-item-"]').length,BM_at_home:location.pathname==='/creator-micro/home',BM_main_count:document.querySelectorAll('main').length,BM_iframe_count:document.querySelectorAll('iframe').length,BM_label_count:[...document.querySelectorAll('*')].filter(BM_el=>/^抖音号[：:]/.test(BM_el.innerText??'')&&BM_el.getClientRects().length>0).length})`
          ),
          2000
        );
      } catch {
        /* The renderer may not be ready. */
      }
      try {
        const BM_capture = await BM_timeout(
          BM_view.webContents.capturePage(undefined, { stayHidden: true }),
          3000
        );
        await fs.writeFile(
          path.join(BM_data, 'BM_reader_diagnostic.local.png'),
          BM_capture.toPNG(),
          { mode: 0o600 }
        );
      } catch {
        /* A failed capture must not affect the queue or page operation. */
      }
      await fs.writeFile(
        path.join(BM_data, 'BM_network_diagnostic.local.json'),
        JSON.stringify(BM_network.BM_snapshot()),
        { mode: 0o600 }
      );
      await fs.writeFile(
        path.join(BM_data, 'BM_reader_diagnostic.local.json'),
        JSON.stringify({ BM_stage, BM_lastAccountCode, ...BM_page }),
        { mode: 0o600 }
      );
    };
    const BM_navigate = async (BM_url: string) => {
      if (!BM_needsNavigation(BM_view.webContents.getURL(), BM_url)) return;
      const BM_currentUrl = BM_view.webContents.getURL();
      if (
        BM_currentUrl.startsWith('https://creator.douyin.com/') &&
        BM_currentUrl.includes('/creator-micro/home') !== BM_url.includes('/creator-micro/home')
      ) {
        await BM_timeout(BM_view.loadURL('about:blank'), 5000);
      }
      try {
        await BM_timeout(BM_view.loadURL(BM_url), 25000);
      } catch (BM_error) {
        if (BM_needsNavigation(BM_view.webContents.getURL(), BM_url)) throw BM_error;
        const BM_state = await BM_timeout(BM_eval<string>('document.readyState'), 2000);
        if (!['interactive', 'complete'].includes(BM_state)) throw BM_error;
      }
    };
    BM_view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    BM_view.webContents.on('will-navigate', (BM_event) => {
      if (!BM_allowedLoginUrl(BM_event.url)) BM_event.preventDefault();
    });
    BM_view.webContents.on('will-redirect', (BM_event) => {
      if (BM_event.isMainFrame && !BM_allowedLoginUrl(BM_event.url)) BM_event.preventDefault();
    });
    BM_view.on('close', (BM_event) => {
      BM_event.preventDefault();
      BM_view.hide();
    });
    await BM_timeout(BM_view.loadURL('about:blank'));
    BM_view.webContents.debugger.attach('1.3');
    await BM_timeout(BM_view.webContents.debugger.sendCommand('Network.enable'));
    await BM_runtime.BM_initialize();
    let BM_current: {
      BM_work: string;
      BM_pages: ReturnType<typeof BM_parseCommentPage>[];
      BM_failed: boolean;
      BM_requests: Map<string, string>;
      BM_itemIds: Set<string>;
    } | null = null;
    BM_view.webContents.debugger.on('message', (_BM_event, BM_method, BM_params) => {
      BM_network.BM_event(BM_method, BM_params);
      const BM_attempt = BM_sending;
      if (BM_attempt) {
        if (
          BM_method === 'Network.requestWillBeSent' &&
          BM_params.request.method === 'POST' &&
          BM_replyRoute(BM_params.request.url)
        ) {
          BM_attempt.BM_networkId = BM_params.requestId;
        }
        if (
          BM_params.requestId === BM_attempt.BM_networkId &&
          BM_method === 'Network.loadingFailed'
        )
          BM_attempt.BM_result = BM_delivery('unknown', 'BM_transport_unknown');
        if (
          BM_params.requestId === BM_attempt.BM_networkId &&
          BM_method === 'Network.loadingFinished'
        ) {
          void BM_view.webContents.debugger
            .sendCommand('Network.getResponseBody', { requestId: BM_params.requestId })
            .then((BM_body) => {
              if (BM_sending !== BM_attempt) return;
              const BM_text = BM_body.base64Encoded
                ? Buffer.from(BM_body.body, 'base64').toString()
                : BM_body.body;
              if (Buffer.byteLength(BM_text) > 1024 * 1024) throw new Error('BM_receipt_too_large');
              void fs
                .writeFile(path.join(BM_data, 'BM_reply_receipt.local.json'), BM_text, {
                  mode: 0o600,
                })
                .catch(() => undefined);
              BM_attempt.BM_result = BM_parseReplyReceipt(
                JSON.parse(BM_text),
                BM_attempt.BM_request
              );
            })
            .catch(() => {
              BM_attempt.BM_result = BM_delivery('unknown', 'BM_receipt_invalid');
            });
        }
      }
      const BM_batch = BM_current;
      if (!BM_batch) return;
      if (
        BM_method === 'Network.requestWillBeSent' &&
        BM_params.request.method === 'GET' &&
        new URL(BM_params.request.url).origin === 'https://creator.douyin.com'
      ) {
        const BM_url = new URL(BM_params.request.url);
        if (
          BM_commentRequest(
            BM_url.href,
            BM_url.searchParams.get('aweme_id') ?? BM_url.searchParams.get('item_id') ?? ''
          ) ||
          (BM_url.pathname === '/web/api/creator/data/item/summarize' &&
            BM_url.searchParams.get('item_id') === BM_batch.BM_work)
        )
          BM_batch.BM_requests.set(BM_params.requestId, BM_url.href);
      }
      if (BM_method === 'Network.loadingFailed' && BM_batch.BM_requests.has(BM_params.requestId))
        BM_batch.BM_failed = true;
      if (BM_method !== 'Network.loadingFinished') return;
      const BM_requestUrl = BM_batch.BM_requests.get(BM_params.requestId);
      if (!BM_requestUrl) return;
      BM_batch.BM_requests.delete(BM_params.requestId);
      void BM_view.webContents.debugger
        .sendCommand('Network.getResponseBody', { requestId: BM_params.requestId })
        .then((BM_result) => {
          if (BM_current !== BM_batch) return;
          const BM_body = BM_result.base64Encoded
            ? Buffer.from(BM_result.body, 'base64').toString()
            : BM_result.body;
          if (Buffer.byteLength(BM_body) > 1024 * 1024) throw new Error('BM_page_too_large');
          const BM_payload = JSON.parse(BM_body);
          const BM_url = new URL(BM_requestUrl);
          if (BM_url.pathname === '/web/api/creator/data/item/summarize') {
            if (
              BM_payload.status_code === 0 &&
              typeof BM_payload.item_list?.[0]?.sec_item_id === 'string'
            )
              BM_batch.BM_itemIds.add(BM_payload.item_list[0].sec_item_id);
            return;
          }
          if (
            ![...BM_batch.BM_itemIds].some((BM_itemId) =>
              BM_commentRequest(BM_requestUrl, BM_itemId)
            )
          )
            return;
          const BM_rows = BM_payload.comments ?? BM_payload.comment_info_list ?? [];
          void fs
            .writeFile(
              path.join(BM_data, 'BM_reader_response_schema.local.json'),
              JSON.stringify({
                BM_keys: Object.keys(BM_payload),
                BM_status:
                  typeof BM_payload.status_code === 'number' ? BM_payload.status_code : null,
                BM_count: BM_rows.length,
                BM_comments_type: Array.isArray(BM_payload.comments)
                  ? 'array'
                  : BM_payload.comments === null
                    ? 'null'
                    : typeof BM_payload.comments,
                BM_cursor_type: typeof BM_payload.cursor,
                BM_cursor_number: typeof BM_payload.cursor === 'number' ? BM_payload.cursor : null,
                BM_has_more_type: typeof BM_payload.has_more,
                BM_has_more_value: [0, 1, true, false, '0', '1'].includes(BM_payload.has_more)
                  ? BM_payload.has_more
                  : null,
                BM_row_keys: Object.keys(BM_rows[0] ?? {}),
                BM_user_keys: Object.keys(BM_rows[0]?.user ?? BM_rows[0]?.user_info ?? {}),
              }),
              { mode: 0o600 }
            )
            .catch(() => undefined);
          BM_batch.BM_pages.push(
            BM_parseCommentPage(BM_payload, BM_config.BM_rules.BM_account, BM_batch.BM_work)
          );
        })
        .catch(() => {
          BM_batch.BM_failed = true;
        });
    });
    const BM_poll = async (BM_input: unknown, BM_keepPage = false) => {
      const BM_request = z
        .object({ BM_work: z.string().regex(/^\d{5,30}$/) })
        .strict()
        .parse(BM_input);
      if (!BM_config.BM_rules.BM_works.includes(BM_request.BM_work))
        throw new Error('BM_work_out_of_scope');
      BM_current = null;
      BM_stage = 'home_navigation';
      if (!BM_loginWindowShown) await BM_navigate(BM_creatorUrl);
      BM_stage = 'account_read';
      let BM_identity: z.infer<typeof BM_accountSchema> | undefined;
      let BM_loginCode = 'BM_page_loading';
      const BM_homeDeadline = BM_clock.now() + 20000;
      while (BM_clock.now() < BM_homeDeadline) {
        const BM_result = await BM_timeout(BM_eval<BM_AccountObservation>(BM_readAccountScript));
        BM_loginCode = BM_result?.BM_code ?? 'BM_page_read_failed';
        BM_lastAccountCode = BM_loginCode;
        const BM_account = BM_accountSchema.safeParse(BM_result?.BM_account);
        if (BM_account.success) BM_lastAccountCode = 'BM_authenticated';
        if (BM_account.success) {
          BM_identity = BM_account.data;
          break;
        }
        await BM_wait(400);
      }
      if (!BM_identity) {
        await BM_diagnostic();
        if (BM_loginCode === 'BM_login_required') BM_showLogin();
        return {
          BM_state: BM_loginCode === 'BM_login_required' ? 'login_required' : 'page_unavailable',
          BM_comments: [],
          BM_complete: false,
        };
      }
      const BM_cookies = (await BM_session.cookies.get({})).filter(
        (BM_cookie) =>
          BM_cookie.domain === 'douyin.com' || BM_cookie.domain?.endsWith('.douyin.com')
      );
      const BM_cookieTargets = [path.join(BM_data, 'BM_reader_cookies.local.json')];
      if (BM_identity.BM_douyin_id === BM_config.BM_rules.BM_account)
        BM_cookieTargets.push(path.join(BM_profile, 'BM_cookies.local.json'));
      for (const BM_cookieFile of BM_cookieTargets) {
        const BM_cookieTmp = `${BM_cookieFile}.BM_${randomUUID()}`;
        try {
          await fs.writeFile(BM_cookieTmp, JSON.stringify(BM_cookies), { mode: 0o600, flag: 'wx' });
          await fs.rename(BM_cookieTmp, BM_cookieFile);
        } finally {
          await fs.rm(BM_cookieTmp, { force: true });
        }
      }
      if (BM_identity.BM_douyin_id !== BM_config.BM_rules.BM_account) {
        const BM_diagnosticFile = path.join(BM_data, 'BM_reader_identity.local.json');
        await fs.writeFile(
          BM_diagnosticFile,
          JSON.stringify({
            BM_expected: BM_config.BM_rules.BM_account,
            BM_observed: BM_identity.BM_douyin_id,
          }),
          { mode: 0o600 }
        );
        BM_showLogin();
        return { BM_state: 'account_mismatch', BM_comments: [], BM_complete: false };
      }
      BM_view.hide();
      BM_loginWindowShown = false;
      const BM_batch = {
        BM_work: BM_request.BM_work,
        BM_pages: [] as ReturnType<typeof BM_parseCommentPage>[],
        BM_failed: false,
        BM_requests: new Map<string, string>(),
        BM_itemIds: new Set([BM_request.BM_work]),
      };
      BM_current = BM_batch;
      BM_stage = 'comment_navigation';
      await BM_navigate(
        `https://creator.douyin.com/creator-micro/work-management/work-detail/${BM_request.BM_work}?tabKey=commentManagement`
      );
      BM_stage = 'comment_capture';
      const BM_deadline = BM_clock.now() + 45000;
      while (!BM_batch.BM_pages.length && BM_clock.now() < BM_deadline) {
        await BM_timeout(
          BM_eval(
            `(()=>{const BM_el=document.querySelector('[data-comment-entry-guide-target="true"]');const BM_tab=BM_el?.closest('[role="tab"]');if(BM_el&&BM_tab?.getAttribute('aria-selected')!=='true')BM_el.click();})()`,
            true
          )
        );
        await BM_wait(400);
      }
      if (!BM_batch.BM_pages.length) {
        await BM_diagnostic();
        return { BM_state: 'page_unavailable', BM_comments: [], BM_complete: false };
      }
      BM_stage = 'pagination';
      const BM_comments = new Map<string, BM_SourceComment>();
      let BM_lastCursor = '';
      for (let BM_pageIndex = 0; BM_pageIndex < 20; BM_pageIndex++) {
        const BM_page = BM_batch.BM_pages.at(-1)!;
        for (const BM_comment of BM_page.BM_comments)
          BM_comments.set(BM_comment.BM_comment, BM_comment);
        if (!BM_page.BM_has_more) break;
        if (BM_page.BM_cursor === BM_lastCursor) break;
        BM_lastCursor = BM_page.BM_cursor;
        const BM_count = BM_batch.BM_pages.length;
        if (!(await BM_timeout(BM_eval(BM_nextCommentsScript, true)))) break;
        const BM_until = BM_clock.now() + 5000;
        while (
          BM_batch.BM_pages.length === BM_count &&
          !BM_batch.BM_failed &&
          BM_clock.now() < BM_until
        )
          await BM_wait(200);
        if (BM_batch.BM_pages.length === BM_count || BM_batch.BM_failed) break;
      }
      const BM_complete = !BM_batch.BM_failed && !BM_batch.BM_pages.at(-1)!.BM_has_more;
      if (BM_keepPage)
        return {
          BM_state: BM_complete ? 'ready' : 'partial',
          BM_comments: [...BM_comments.values()],
          BM_complete,
        };
      // Recheck identity before handing any observed data to the business queue.
      BM_current = null;
      BM_stage = 'account_recheck';
      await BM_navigate(BM_creatorUrl);
      let BM_after;
      const BM_afterDeadline = BM_clock.now() + 8000;
      while (BM_clock.now() < BM_afterDeadline) {
        BM_after = await BM_timeout(BM_eval<BM_AccountObservation>(BM_readAccountScript));
        if (BM_after?.BM_account) break;
        await BM_wait(400);
      }
      if (BM_after?.BM_account?.BM_douyin_id !== BM_identity.BM_douyin_id)
        return { BM_state: 'account_mismatch', BM_comments: [], BM_complete: false };
      return {
        BM_state: BM_complete ? 'ready' : 'partial',
        BM_comments: [...BM_comments.values()],
        BM_complete,
      };
    };
    const BM_verify = async (BM_input: unknown): Promise<BM_Delivery> => {
      const BM_request = BM_sendRequestSchema.parse({ ...(BM_input as object), BM_action: 'send' });
      if (
        BM_request.BM_message.BM_account !== BM_config.BM_rules.BM_account ||
        !BM_config.BM_rules.BM_works.includes(BM_request.BM_message.BM_work)
      )
        return BM_delivery('unknown', 'BM_target_mismatch');
      const BM_page = await BM_poll({ BM_work: BM_request.BM_message.BM_work }, true);
      if (!['ready', 'partial'].includes(BM_page.BM_state))
        return BM_delivery('unknown', 'BM_' + BM_page.BM_state);
      const BM_itemIds = BM_current!.BM_itemIds;
      for (let BM_index = 0; BM_index < 20; BM_index++) {
        const BM_replyId = await BM_timeout(
          BM_eval<string | null>(BM_verifyReplyScript(BM_request, BM_itemIds, false))
        );
        if (BM_replyId)
          return { BM_state: 'accepted', BM_code: 'BM_reply_confirmed', BM_reply_id: BM_replyId };
        if (
          !(await BM_timeout(
            BM_eval<boolean>(BM_verifyReplyScript(BM_request, BM_itemIds, true), true)
          ))
        )
          break;
        await BM_wait(750);
      }
      return BM_delivery('unknown', 'BM_reply_not_confirmed');
    };
    const BM_send = async (BM_input: unknown): Promise<BM_Delivery> => {
      const BM_request = BM_sendRequestSchema.parse(BM_input);
      if (
        !BM_config.BM_rules.BM_works.includes(BM_request.BM_message.BM_work) ||
        BM_request.BM_message.BM_account !== BM_config.BM_rules.BM_account
      )
        return BM_delivery('blocked', 'BM_target_mismatch');
      if (
        !BM_validReply(BM_request.BM_reply, BM_config.BM_rules.BM_max_reply_chars) ||
        BM_request.BM_reply.length > 500
      )
        return BM_delivery('blocked', 'BM_reply_invalid');
      const BM_page = await BM_poll({ BM_work: BM_request.BM_message.BM_work }, true);
      if (!['ready', 'partial'].includes(BM_page.BM_state))
        return BM_delivery('blocked', 'BM_' + BM_page.BM_state);
      const BM_found = BM_page.BM_comments.filter(
        (BM_comment) =>
          BM_comment.BM_comment === BM_request.BM_message.BM_comment &&
          BM_comment.BM_text === BM_request.BM_message.BM_text &&
          BM_comment.BM_author === BM_request.BM_message.BM_author
      );
      if (BM_found.length !== 1) return BM_delivery('blocked', 'BM_comment_unavailable');
      const BM_itemIds = BM_current!.BM_itemIds;
      for (const BM_action of ['open', 'fill'] as const) {
        if (
          !(await BM_timeout(BM_eval(BM_replyPageScript(BM_request, BM_itemIds, BM_action), true)))
        )
          return BM_delivery('blocked', 'BM_reply_control_unavailable');
        await BM_wait(250);
      }
      const BM_attempt = {
        BM_request,
        BM_itemIds,
        BM_attempted: false,
        BM_rejected: false,
      } as NonNullable<typeof BM_sending>;
      BM_sending = BM_attempt;
      try {
        if (
          !(await BM_timeout(BM_eval(BM_replyPageScript(BM_request, BM_itemIds, 'submit'), true)))
        )
          return BM_delivery('blocked', 'BM_reply_control_unavailable');
        const BM_deadline = BM_clock.now() + 15000;
        while (!BM_attempt.BM_result && !BM_attempt.BM_rejected && BM_clock.now() < BM_deadline)
          await BM_wait(100);
        if (BM_attempt.BM_result) return BM_attempt.BM_result;
        if (!BM_attempt.BM_attempted)
          return BM_delivery(
            'blocked',
            BM_attempt.BM_rejected ? 'BM_request_mismatch' : 'BM_no_submission'
          );
        return BM_delivery('unknown', 'BM_receipt_timeout');
      } catch {
        return BM_delivery(BM_attempt.BM_attempted ? 'unknown' : 'blocked', 'BM_transport_unknown');
      } finally {
        BM_sending = null;
        BM_current = null;
      }
    };
    process.stdout.write(
      JSON.stringify({ BM_state: 'booted', BM_comments: [], BM_complete: false }) + '\n'
    );
    const BM_lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const BM_line of BM_lines) {
      let BM_isSend = false;
      try {
        if (BM_line.length > 24000) throw new Error('BM_request_too_large');
        const BM_input = JSON.parse(BM_line);
        BM_isSend = ['send', 'verify'].includes(BM_input?.BM_action);
        const BM_result =
          BM_input?.BM_action === 'send'
            ? await BM_send(BM_input)
            : BM_input?.BM_action === 'verify'
              ? await BM_verify(BM_input)
              : await BM_poll(BM_input);
        process.stdout.write(JSON.stringify(BM_result) + '\n');
      } catch {
        BM_current = null;
        await BM_diagnostic();
        if (BM_lastAccountCode === 'BM_login_required') {
          BM_showLogin();
        }
        process.stdout.write(
          JSON.stringify(
            BM_isSend
              ? BM_delivery('blocked', 'BM_page_unavailable')
              : { BM_state: 'page_unavailable', BM_comments: [], BM_complete: false }
          ) + '\n'
        );
      }
    }
  } catch {
    process.stdout.write(
      JSON.stringify({ BM_state: 'reader_failed', BM_comments: [], BM_complete: false }) + '\n'
    );
  } finally {
    BM_window?.destroy();
    app.quit();
  }
}
