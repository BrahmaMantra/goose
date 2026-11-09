import { z } from 'zod';

export const BM_actionSchema = z.enum(['start', 'resume', 'pause', 'shutdown']);
export type BM_WatchAction = z.infer<typeof BM_actionSchema>;
export const BM_statusNames = [
  'queued',
  'processing',
  'review',
  'skipped',
  'failed',
  'sending',
  'accepted',
  'unknown',
] as const;
export const BM_defaultReplyMarker = '【from DeepSeek-V4.1-Flash-1017】';
export const BM_replyMarkerSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .refine(
    (BM_value) =>
      BM_value.startsWith('【') &&
      BM_value.endsWith('】') &&
      BM_value.slice(1, -1).trim().length > 0 &&
      !Array.from(BM_value).some((BM_char) => {
        const BM_code = BM_char.codePointAt(0)!;
        return BM_code < 32 || (BM_code >= 127 && BM_code <= 159);
      })
  );
export function BM_legacyRules(BM_value: unknown): unknown {
  if (
    BM_value &&
    typeof BM_value === 'object' &&
    !Array.isArray(BM_value) &&
    'BM_allow_contains' in BM_value &&
    !('BM_deny_contains' in BM_value)
  ) {
    const { BM_allow_contains, ...BM_rest } = BM_value;
    return { ...BM_rest, BM_deny_contains: BM_allow_contains };
  }
  return BM_value;
}
export const BM_rulesSchema = z.preprocess(
  BM_legacyRules,
  z
    .object({
      BM_account: z.string().min(1),
      BM_works: z.array(z.string().min(1)).min(1),
      BM_deny_contains: z.array(z.string().min(1)).default([]),
      BM_max_reply_chars: z.number().int().min(1).max(1000),
      BM_reply_marker: BM_replyMarkerSchema.default(BM_defaultReplyMarker),
    })
    .strict()
    .refine(
      (BM_rules) => Array.from(BM_rules.BM_reply_marker).length + 1 < BM_rules.BM_max_reply_chars
    )
);
export const BM_taskSchema = z
  .object({ BM_rules: BM_rulesSchema, BM_interval_seconds: z.number().int().positive() })
  .strict();
export const BM_statusSchema = z
  .object({
    BM_enabled: z.boolean(),
    BM_pid: z.number().int().positive(),
    BM_counts: z
      .record(z.string(), z.number().int().nonnegative())
      .refine((BM_counts) =>
        Object.keys(BM_counts).every((BM_key) =>
          (BM_statusNames as readonly string[]).includes(BM_key)
        )
      ),
  })
  .strict();
export const BM_recordSchema = z
  .object({
    BM_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    BM_status: z.enum(BM_statusNames),
    BM_message: z
      .object({
        BM_account: z.string(),
        BM_work: z.string(),
        BM_comment: z.string(),
        BM_author: z.string(),
        BM_text: z.string(),
        BM_is_ai_reply: z.boolean().default(false),
      })
      .strict(),
    BM_reply: z.string().nullable(),
  })
  .strict();
export const BM_recordsSchema = z.object({ BM_records: z.array(BM_recordSchema).max(50) }).strict();
export type BM_Record = z.infer<typeof BM_recordSchema>;
export interface BM_Snapshot {
  BM_configured: boolean;
  BM_config_name: string;
  BM_running: boolean;
  BM_enabled: boolean;
  BM_counts: Record<string, number>;
  BM_pid?: number;
  BM_account: string;
  BM_works: string[];
  BM_deny_contains: string[];
  BM_reply_marker: string;
  BM_requires_restart?: boolean;
  BM_source?: BM_SourceStatus;
  BM_max_reply_chars: number;
  BM_interval_seconds: number;
  BM_error?: string;
}

export const BM_configIdSchema = z.string().regex(/^BM_watch(?:_[a-f0-9]{16})?\.local\.json$/);
export interface BM_ConfigEntry {
  BM_id: string;
  BM_name: string;
  BM_account: string;
  BM_work_count: number;
  BM_selected: boolean;
}

export const BM_sourceStatusSchema = z
  .object({
    BM_state: z.enum([
      'manual',
      'starting',
      'stale',
      'paused',
      'booted',
      'ready',
      'partial',
      'login_required',
      'account_mismatch',
      'page_unavailable',
      'reader_failed',
    ]),
    BM_seen: z.number().int().nonnegative(),
    BM_added: z.number().int().nonnegative(),
    BM_complete: z.boolean(),
    BM_checked_at: z.number().int().nonnegative(),
  })
  .strict();
export type BM_SourceStatus = z.infer<typeof BM_sourceStatusSchema>;
