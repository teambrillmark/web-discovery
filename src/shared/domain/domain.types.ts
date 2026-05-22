export type NormalizationOutcome =
  | { ok: true; domain: string }
  | { ok: false; reason: string };

export type ValidationOutcome =
  | { ok: true }
  | { ok: false; reason: string };
