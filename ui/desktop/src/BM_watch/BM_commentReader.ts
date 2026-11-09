import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import { BM_readAccountScript, BM_allowedLoginUrl, BM_creatorUrl } from './BM_login';
import { BM_privateDirectory, BM_accountSchema } from './BM_privateConfig';
import { BM_rulesSchema } from './BM_types';
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
    const BM_session = session.fromPath(BM_browser, { cache: false });
    BM_session.setPermissionRequestHandler((_BM_contents, _BM_permission, BM_callback) =>
      BM_callback(false)
    );
    BM_session.setPermissionCheckHandler(() => false);
    BM_session.on('will-download', (BM_event) => BM_event.preventDefault());
    BM_session.webRequest.onBeforeRequest(
      { urls: ['https://creator.douyin.com/*'] },
      (BM_details, BM_callback) => {
        const BM_path = new URL(BM_details.url).pathname;
        BM_callback({ cancel: BM_path.includes('/comment/') && BM_details.method !== 'GET' });
      }
    );
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
    let BM_stage = 'initialization';
    const BM_diagnostic = async () => {
      let BM_page = {};
      try {
        BM_page = await BM_timeout(
          BM_view.webContents.executeJavaScript(
            `({BM_ready:document.readyState,BM_login_visible:/扫码登录/.test(document.body?.innerText??''),BM_comment_tab_count:document.querySelectorAll('[data-comment-entry-guide-target]').length,BM_comment_card_count:document.querySelectorAll('[class*="comment-item-"]').length})`
          ),
          2000
        );
      } catch {
        /* The renderer may not be ready. */
      }
      await fs.writeFile(
        path.join(BM_data, 'BM_reader_diagnostic.local.json'),
        JSON.stringify({ BM_stage, ...BM_page }),
        { mode: 0o600 }
      );
    };
    const BM_navigate = async (BM_url: string) => {
      let BM_ready: (() => void) | undefined;
      const BM_dom = new Promise<void>((BM_resolve) => {
        BM_ready = BM_resolve;
        BM_view.webContents.once('dom-ready', BM_ready);
      });
      try {
        await BM_timeout(Promise.race([BM_view.loadURL(BM_url), BM_dom]));
      } finally {
        if (BM_ready) BM_view.webContents.removeListener('dom-ready', BM_ready);
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
    let BM_current: {
      BM_work: string;
      BM_pages: ReturnType<typeof BM_parseCommentPage>[];
      BM_failed: boolean;
      BM_requests: Map<string, string>;
      BM_itemIds: Set<string>;
    } | null = null;
    BM_view.webContents.debugger.on('message', (_BM_event, BM_method, BM_params) => {
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
    const BM_poll = async (BM_input: unknown) => {
      const BM_request = z
        .object({ BM_work: z.string().regex(/^\d{5,30}$/) })
        .strict()
        .parse(BM_input);
      if (!BM_config.BM_rules.BM_works.includes(BM_request.BM_work))
        throw new Error('BM_work_out_of_scope');
      BM_current = null;
      BM_stage = 'home_navigation';
      await BM_navigate(BM_creatorUrl);
      BM_stage = 'account_read';
      let BM_identity: z.infer<typeof BM_accountSchema> | undefined;
      const BM_homeDeadline = Date.now() + 8000;
      while (Date.now() < BM_homeDeadline) {
        const BM_result = await BM_timeout(
          BM_view.webContents.executeJavaScript(BM_readAccountScript)
        );
        const BM_account = BM_accountSchema.safeParse(BM_result?.BM_account);
        if (BM_account.success) {
          BM_identity = BM_account.data;
          break;
        }
        await BM_wait(400);
      }
      if (!BM_identity) {
        BM_view.show();
        BM_view.focus();
        return { BM_state: 'login_required', BM_comments: [], BM_complete: false };
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
        BM_view.show();
        BM_view.focus();
        return { BM_state: 'account_mismatch', BM_comments: [], BM_complete: false };
      }
      BM_view.hide();
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
      const BM_deadline = Date.now() + 15000;
      while (!BM_batch.BM_pages.length && Date.now() < BM_deadline) {
        await BM_timeout(
          BM_view.webContents.executeJavaScript(
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
        if (!(await BM_timeout(BM_view.webContents.executeJavaScript(BM_nextCommentsScript, true))))
          break;
        const BM_until = Date.now() + 5000;
        while (
          BM_batch.BM_pages.length === BM_count &&
          !BM_batch.BM_failed &&
          Date.now() < BM_until
        )
          await BM_wait(200);
        if (BM_batch.BM_pages.length === BM_count || BM_batch.BM_failed) break;
      }
      const BM_complete = !BM_batch.BM_failed && !BM_batch.BM_pages.at(-1)!.BM_has_more;
      // Recheck identity before handing any observed data to the business queue.
      BM_current = null;
      BM_stage = 'account_recheck';
      await BM_navigate(BM_creatorUrl);
      let BM_after;
      const BM_afterDeadline = Date.now() + 8000;
      while (Date.now() < BM_afterDeadline) {
        BM_after = await BM_timeout(BM_view.webContents.executeJavaScript(BM_readAccountScript));
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
    process.stdout.write(
      JSON.stringify({ BM_state: 'booted', BM_comments: [], BM_complete: false }) + '\n'
    );
    const BM_lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const BM_line of BM_lines) {
      try {
        if (BM_line.length > 2048) throw new Error('BM_request_too_large');
        const BM_result = await BM_poll(JSON.parse(BM_line));
        process.stdout.write(JSON.stringify(BM_result) + '\n');
      } catch {
        BM_current = null;
        await BM_diagnostic();
        if (BM_stage === 'home_navigation' || BM_stage === 'account_read') {
          BM_view.show();
          BM_view.focus();
        }
        process.stdout.write(
          JSON.stringify({ BM_state: 'page_unavailable', BM_comments: [], BM_complete: false }) +
            '\n'
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
