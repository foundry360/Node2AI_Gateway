const INTENT_KEYWORDS: Array<{ intent: string; patterns: RegExp[] }> = [
  { intent: 'summarization', patterns: [/\bsummar(y|ize|ise)\b/i, /\btldr\b/i] },
  { intent: 'classification', patterns: [/\bclassif(y|ication)\b/i, /\bcategorize\b/i] },
  { intent: 'extraction', patterns: [/\bextract\b/i, /\bpull out\b/i] },
  { intent: 'generation', patterns: [/\bgenerat(e|ion)\b/i, /\bdraft\b/i, /\bwrite\b/i] },
  { intent: 'analysis', patterns: [/\banaly[sz]e\b/i, /\banalysis\b/i] },
  { intent: 'retrieval', patterns: [/\bretriev(e|al)\b/i, /\blook up\b/i, /\bsearch\b/i] },
  { intent: 'decision_support', patterns: [/\brecommend\b/i, /\bshould I\b/i, /\bdecide\b/i] },
  { intent: 'tool_execution', patterns: [/\bcall tool\b/i, /\binvoke\b/i, /\bexecute action\b/i] },
  { intent: 'data_modification', patterns: [/\bupdate\b/i, /\bdelete\b/i, /\bmodify\b/i, /\bwrite to\b/i] },
];

const OPERATION_TO_INTENT: Record<string, string> = {
  summarize: 'summarization',
  classify: 'classification',
  extract: 'extraction',
  generate: 'generation',
  analyze: 'analysis',
  retrieve: 'retrieval',
  decide: 'decision_support',
  tool: 'tool_execution',
  write: 'data_modification',
};

export function classifyIntent(operation: string, text: string): string {
  const fromOp = OPERATION_TO_INTENT[operation.toLowerCase()];
  if (fromOp) return fromOp;

  for (const entry of INTENT_KEYWORDS) {
    if (entry.patterns.some((p) => p.test(text))) {
      return entry.intent;
    }
  }

  return 'generation';
}
