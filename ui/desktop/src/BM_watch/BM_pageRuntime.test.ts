import { expect, it, vi } from 'vitest';
import { BM_evaluatePage, BM_needsNavigation, BM_PageRuntime } from './BM_pageRuntime';
it('reads through CDP and preserves the explicit user gesture for reply controls', async () => {
  const BM_send = vi.fn(async () => ({ result: { value: { BM_ready: 'interactive' } } }));
  expect(await BM_evaluatePage({ sendCommand: BM_send }, 'document.readyState', true)).toEqual({
    BM_ready: 'interactive',
  });
  expect(BM_send).toHaveBeenCalledWith('Runtime.evaluate', {
    expression: 'document.readyState',
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  BM_send.mockResolvedValueOnce({ exceptionDetails: {}, result: { value: null } } as never);
  await expect(BM_evaluatePage({ sendCommand: BM_send }, 'throw 1')).rejects.toThrow(
    'BM_page_script_failed'
  );
});
it('keeps the current login page in place instead of restarting the same navigation', () => {
  const BM_home = 'https://creator.douyin.com/creator-micro/home';
  expect(BM_needsNavigation(BM_home, BM_home)).toBe(false);
  expect(BM_needsNavigation(BM_home + '/', BM_home)).toBe(false);
  expect(BM_needsNavigation('https://example.com/creator-micro/home', BM_home)).toBe(true);
  expect(BM_needsNavigation(BM_home + '?tab=1', BM_home)).toBe(true);
});

it('selects the default main-frame context instead of an iframe or isolated world', async () => {
  let BM_listener: ((BM_event: unknown, BM_method: string, BM_params: unknown) => void) | undefined;
  const BM_send = vi.fn(async (BM_command: string) =>
    BM_command === 'Page.getFrameTree'
      ? { frameTree: { frame: { id: 'BM_main' } } }
      : { result: { value: true } }
  );
  const BM_on = vi.fn((_BM_name: string, BM_fn: typeof BM_listener) => {
    BM_listener = BM_fn;
    return {} as never;
  });
  const BM_runtime = new BM_PageRuntime({ on: BM_on as never, sendCommand: BM_send });
  await BM_runtime.BM_initialize();
  for (const [BM_id, BM_frame, BM_default] of [
    [10, 'BM_main', true],
    [20, 'BM_iframe', true],
    [30, 'BM_main', false],
  ] as const)
    BM_listener!({}, 'Runtime.executionContextCreated', {
      context: { id: BM_id, auxData: { frameId: BM_frame, isDefault: BM_default } },
    });
  expect(await BM_runtime.BM_evaluate('document.body')).toBe(true);
  expect(BM_send).toHaveBeenLastCalledWith(
    'Runtime.evaluate',
    expect.objectContaining({ contextId: 10 })
  );
  BM_listener!({}, 'Runtime.executionContextsCleared', {});
  await expect(BM_runtime.BM_evaluate('document.body')).rejects.toThrow(
    'BM_main_frame_unavailable'
  );
});

it('accepts successful side effects that return undefined instead of reporting an execution error', async () => {
  const BM_send = vi.fn(async () => ({ result: { type: 'undefined' } }));
  await expect(
    BM_evaluatePage({ sendCommand: BM_send }, 'document.querySelector("button")?.click()')
  ).resolves.toBeUndefined();
});
