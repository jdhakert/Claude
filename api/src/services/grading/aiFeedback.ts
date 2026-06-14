/**
 * AI-feedback abstraction layer (Phase 11 §4).
 *
 * Beta does NOT require a live AI integration. We define the interface and a
 * default no-op provider so the grading workflow can call a single seam; a real
 * provider can be dropped in post-beta without touching callers.
 */
export interface EssayForFeedback {
  prompt: string;
  modelAnswer: string | null;
  responseText: string;
  rubricDimensions: string[];
}

export interface EssayAIFeedback {
  provider: string;
  perDimension: Array<{ dimension: string; score: number; comment: string }>;
  summary: string;
}

export interface EssayFeedbackProvider {
  readonly name: string;
  readonly enabled: boolean;
  generate(input: EssayForFeedback): Promise<EssayAIFeedback | null>;
}

/** Default provider: disabled in beta. Returns null (no automated feedback). */
export class NoopFeedbackProvider implements EssayFeedbackProvider {
  readonly name = "noop";
  readonly enabled = false;
  async generate(): Promise<EssayAIFeedback | null> {
    return null;
  }
}

let provider: EssayFeedbackProvider = new NoopFeedbackProvider();

export function getFeedbackProvider(): EssayFeedbackProvider {
  return provider;
}

/** Allows post-beta wiring (or tests) to inject a real provider. */
export function setFeedbackProvider(p: EssayFeedbackProvider): void {
  provider = p;
}
