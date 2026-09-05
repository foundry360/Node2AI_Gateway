import type { LocalModelRuntime, ModelMessage } from '../types.js';
import {
  buildHeuristicActionItems,
  type ActionItemFacts,
} from '../../admin/action-items.js';
import {
  classifyApplicationHeuristic,
  type AppRiskInput,
} from '../../admin/risk-classification.js';
import {
  PRIORITY_FRAMEWORKS,
  scoreFrameworkHeuristic,
  overallComplianceScore,
  type PackFact,
  type PolicyFact,
} from '../../admin/compliance-score.js';

/**
 * Deterministic local runtime for CI / air-gap MVP without Ollama installed.
 * Swappable for OllamaLocalRuntime in appliance deployments.
 */
export class StubLocalRuntime implements LocalModelRuntime {
  readonly runtimeId = 'stub-local';

  constructor(private readonly modelIds: string[] = ['local-general-v1']) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  supports(model: string): boolean {
    return this.modelIds.includes(model);
  }

  async generate(input: {
    model: string;
    messages: ModelMessage[];
    request_id: string;
    num_predict?: number;
    signal?: AbortSignal;
  }): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }> {
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
    const content = lastUser?.content ?? '';

    // Console insights: return structured action items from embedded facts JSON.
    if (content.includes('Analyze these live facts') && content.includes('{')) {
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
          const facts = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as ActionItemFacts;
          const items = buildHeuristicActionItems(facts);
          return {
            content: JSON.stringify({
              summary: `Local runtime (${input.model}) assessed activity and performance from live console signals.`,
              items,
            }),
            usage: {
              input_tokens: Math.ceil(content.length / 4),
              output_tokens: 64,
            },
          };
        } catch {
          // fall through
        }
      }
    }

    // Console risk classification: classify each application from embedded JSON array.
    if (content.includes('Classify each application') && content.includes('[')) {
      const jsonStart = content.indexOf('[');
      const jsonEnd = content.lastIndexOf(']');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
          const apps = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as AppRiskInput[];
          const applications = apps.map(classifyApplicationHeuristic);
          return {
            content: JSON.stringify({
              summary: `Local runtime (${input.model}) analyzed and classified application risk.`,
              applications,
            }),
            usage: {
              input_tokens: Math.ceil(content.length / 4),
              output_tokens: Math.max(64, applications.length * 24),
            },
          };
        } catch {
          // fall through
        }
      }
    }

    // Console compliance score: score priority frameworks from pack/policy facts.
    if (content.includes('Score compliance for each priority framework') && content.includes('{')) {
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
          const payload = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as {
            packs?: PackFact[];
            policies?: PolicyFact[];
          };
          const packs = payload.packs ?? [];
          const policies = payload.policies ?? [];
          const frameworks = PRIORITY_FRAMEWORKS.map((def) =>
            scoreFrameworkHeuristic(def, packs, policies),
          );
          return {
            content: JSON.stringify({
              summary: `Local runtime (${input.model}) scored priority framework compliance.`,
              overall: overallComplianceScore(frameworks),
              frameworks,
            }),
            usage: {
              input_tokens: Math.ceil(content.length / 4),
              output_tokens: 64,
            },
          };
        } catch {
          // fall through
        }
      }
    }

    const preview = content.slice(0, 80);
    return {
      content: `[local-runtime:${input.model}] ${preview}`,
      usage: {
        input_tokens: Math.ceil(content.length / 4),
        output_tokens: 24,
      },
    };
  }
}
