import type { Debugger } from 'electron';
import { z } from 'zod';

// Unlike executeJavaScript, CDP can inspect an interactive document while load events are pending.
export async function BM_evaluatePage<T>(
  BM_debugger: Pick<Debugger, 'sendCommand'>,
  BM_expression: string,
  BM_userGesture = false,
  BM_contextId?: number
): Promise<T> {
  const BM_result = await BM_debugger.sendCommand('Runtime.evaluate', {
    expression: BM_expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: BM_userGesture,
    ...(BM_contextId === undefined ? {} : { contextId: BM_contextId }),
  });
  if (BM_result.exceptionDetails || !BM_result.result) throw new Error('BM_page_script_failed');
  return BM_result.result.value as T;
}

export function BM_needsNavigation(BM_current: string, BM_target: string): boolean {
  try {
    const BM_url = new URL(BM_current);
    const BM_destination = new URL(BM_target);
    return (
      BM_url.origin !== BM_destination.origin ||
      BM_url.pathname.replace(/\/$/, '') !== BM_destination.pathname.replace(/\/$/, '') ||
      BM_url.search !== BM_destination.search
    );
  } catch {
    return true;
  }
}

export class BM_PageRuntime {
  private BM_contexts = new Map<number, string>();
  constructor(private readonly BM_debugger: Pick<Debugger, 'on' | 'sendCommand'>) {
    BM_debugger.on('message', (_BM_event, BM_method, BM_params, BM_sessionId) => {
      if (BM_sessionId) return;
      if (BM_method === 'Runtime.executionContextsCleared') this.BM_contexts.clear();
      if (BM_method === 'Runtime.executionContextDestroyed') {
        const BM_value = z.object({ executionContextId: z.number() }).safeParse(BM_params);
        if (BM_value.success) this.BM_contexts.delete(BM_value.data.executionContextId);
      }
      if (BM_method === 'Runtime.executionContextCreated') {
        const BM_value = z
          .object({
            context: z.object({
              id: z.number(),
              auxData: z.object({ isDefault: z.boolean(), frameId: z.string() }),
            }),
          })
          .safeParse(BM_params);
        if (BM_value.success && BM_value.data.context.auxData.isDefault)
          this.BM_contexts.set(BM_value.data.context.id, BM_value.data.context.auxData.frameId);
      }
    });
  }
  async BM_initialize(): Promise<void> {
    await this.BM_debugger.sendCommand('Page.enable');
    await this.BM_debugger.sendCommand('Runtime.enable');
  }
  async BM_evaluate<T>(BM_expression: string, BM_gesture = false): Promise<T> {
    const BM_tree = await this.BM_debugger.sendCommand('Page.getFrameTree');
    const BM_frame = z
      .object({ frameTree: z.object({ frame: z.object({ id: z.string() }) }) })
      .parse(BM_tree).frameTree.frame.id;
    const BM_context = [...this.BM_contexts]
      .reverse()
      .find(([, BM_frameId]) => BM_frameId === BM_frame)?.[0];
    if (BM_context === undefined) throw new Error('BM_main_frame_unavailable');
    return BM_evaluatePage<T>(this.BM_debugger, BM_expression, BM_gesture, BM_context);
  }
}
