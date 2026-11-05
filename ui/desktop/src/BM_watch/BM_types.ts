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
export const BM_rulesSchema = z
  .object({
    BM_account: z.string().min(1),
    BM_works: z.array(z.string().min(1)).min(1),
    BM_allow_contains: z.array(z.string().min(1)),
    BM_max_reply_chars: z.number().int().min(1).max(1000),
  })
  .strict();
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
  BM_allow_contains: string[];
  BM_max_reply_chars: number;
  BM_interval_seconds: number;
  BM_error?: string;
}
