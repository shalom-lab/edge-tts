interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  SYNTH_RATE_LIMITER: RateLimit;
}
