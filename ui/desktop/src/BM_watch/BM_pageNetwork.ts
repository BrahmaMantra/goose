import { z } from 'zod';
import { performance as BM_clock } from 'node:perf_hooks';
const BM_requestSchema = z.object({
  requestId: z.string(),
  type: z.string(),
  request: z.object({ url: z.string() }),
});
const BM_responseSchema = z.object({
  requestId: z.string(),
  response: z.object({ status: z.number() }),
});
export class BM_PageNetwork {
  private BM_active = new Map<
    string,
    { BM_host: string; BM_path: string; BM_type: string; BM_at: number }
  >();
  private BM_failed: Array<{
    BM_host: string;
    BM_path: string;
    BM_type: string;
    BM_error: string;
  }> = [];
  BM_event(BM_method: string, BM_params: unknown): void {
    if (BM_method === 'Network.requestWillBeSent') {
      const BM_request = BM_requestSchema.safeParse(BM_params);
      if (!BM_request.success) return;
      try {
        const BM_url = new URL(BM_request.data.request.url);
        if (!['https:', 'http:'].includes(BM_url.protocol)) return;
        if (this.BM_active.size >= 500) this.BM_active.delete(this.BM_active.keys().next().value!);
        this.BM_active.set(BM_request.data.requestId, {
          BM_host: BM_url.hostname,
          BM_path: BM_url.pathname,
          BM_type: BM_request.data.type,
          BM_at: BM_clock.now(),
        });
      } catch {
        return;
      }
    }
    if (BM_method === 'Network.responseReceived') {
      const BM_response = BM_responseSchema.safeParse(BM_params);
      if (BM_response.success && BM_response.data.response.status >= 400)
        this.BM_failure(BM_response.data.requestId, 'HTTP_' + BM_response.data.response.status);
    }
    if (BM_method === 'Network.loadingFailed') {
      const BM_result = z
        .object({ requestId: z.string(), errorText: z.string() })
        .safeParse(BM_params);
      if (BM_result.success)
        this.BM_failure(
          BM_result.data.requestId,
          /^net::ERR_[A-Z_]+$/.test(BM_result.data.errorText)
            ? BM_result.data.errorText
            : 'loading_failed'
        );
    }
    if (BM_method === 'Network.loadingFinished') {
      const BM_result = z.object({ requestId: z.string() }).safeParse(BM_params);
      if (BM_result.success) this.BM_active.delete(BM_result.data.requestId);
    }
  }
  private BM_failure(BM_id: string, BM_error: string): void {
    const BM_request = this.BM_active.get(BM_id);
    if (!BM_request) return;
    const { BM_at: _BM_at, ...BM_detail } = BM_request;
    this.BM_failed.push({ ...BM_detail, BM_error });
    this.BM_failed = this.BM_failed.slice(-30);
    this.BM_active.delete(BM_id);
  }
  BM_snapshot(): unknown {
    return {
      BM_failed: this.BM_failed,
      BM_pending: [...this.BM_active.values()]
        .map(({ BM_at, ...BM_request }) => ({ ...BM_request, BM_age_ms: BM_clock.now() - BM_at }))
        .sort((BM_a, BM_b) => BM_b.BM_age_ms - BM_a.BM_age_ms)
        .slice(0, 20),
    };
  }
}
