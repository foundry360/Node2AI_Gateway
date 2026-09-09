/**
 * Presentation-only: convert governed AI activity into human-readable
 * Request Review context. Does not affect PDP, policy, or enforcement.
 */

import type { ChangeReviewItem, ChangeReviewPreview } from './change-governance/evaluate.js';

export type ActionReviewKind = 'runtime' | 'lifecycle_change';

export interface ActionReviewTargetAttr {
  label: string;
  value: string;
}

export interface ActionReviewChange {
  label: string;
  before?: string;
  after?: string;
  layout: 'inline' | 'block';
}

export interface ActionReviewAiContext {
  prompt?: string;
  response?: string;
  conversation?: Array<{ role: string; content: string }>;
}

export interface ActionReviewTechnicalDetail {
  label: string;
  value: string;
}

export interface ActionReviewPresentation {
  kind: ActionReviewKind;
  /** Plain-English primary statement of what the AI did / is asking to do. */
  headline: string;
  /** Actual requester / user prompt when retained — prefer showing this. */
  prompt?: string;
  actor_label: string;
  targets: ActionReviewTargetAttr[];
  changes: ActionReviewChange[];
  why_reviewing: string;
  ai_context?: ActionReviewAiContext;
  decision: {
    status: string;
    explanation: string;
  };
  technical: ActionReviewTechnicalDetail[];
}

export interface ActionReviewInput {
  operation?: string;
  model?: string;
  application_id?: string;
  organization_id?: string;
  user_id?: string;
  correlation_id?: string;
  messages?: Array<{ role: string; content: string }>;
  classification?: {
    sensitivity?: string;
    intent?: string;
    risk?: string;
    reason_codes?: string[];
  };
  retained?: boolean;
  change_review?: ChangeReviewPreview;
  machine_decision?: string;
  final_decision?: string;
  human_disposition?: string;
}

function titleCaseWords(raw: string): string {
  return raw
    .trim()
    .replace(/[_./:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === 'id' || lower === 'ai' || lower === 'api') {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function humanTargetType(targetType: string): string {
  const t = targetType.trim().toLowerCase();
  if (t === 'application' || t === 'agent') return 'AI system';
  if (t === 'tool') return 'Tool';
  if (t === 'model') return 'Model';
  if (t === 'component') return 'Component';
  return titleCaseWords(targetType);
}

function humanBoolCapability(value: string | undefined, kind: string): string | undefined {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '—' || v === '-') return undefined;
  if (kind.includes('write')) {
    if (v === 'true' || v === '1' || v === 'yes') return 'Read + Write';
    if (v === 'false' || v === '0' || v === 'no') return 'Read only';
  }
  if (v === 'true') return 'Enabled';
  if (v === 'false') return 'Disabled';
  return value;
}

function humanChangeLabel(item: ChangeReviewItem): string {
  const id = item.id.toLowerCase();
  if (id.includes('write_capability')) {
    return 'Ability to create or modify records';
  }
  if (item.kind === 'tool') {
    const toolName = item.id.replace(/^tool:/i, '');
    return `Tool: ${titleCaseWords(toolName)}`;
  }
  if (item.kind === 'data_source') {
    const name = item.id.replace(/^data_source:/i, '');
    return `Data source: ${titleCaseWords(name)}`;
  }
  if (item.kind === 'capability') {
    return titleCaseWords(item.label || item.id.replace(/^capability:/i, ''));
  }
  if (item.kind === 'configuration') {
    return titleCaseWords(item.label || item.id.replace(/^config:/i, ''));
  }
  return item.label || titleCaseWords(item.id);
}

function humanChangeValue(
  item: ChangeReviewItem,
  side: 'before' | 'after',
): string | undefined {
  const raw = side === 'before' ? item.before : item.after;
  if (raw == null || raw === '—') return undefined;
  if (item.id.toLowerCase().includes('write_capability')) {
    return humanBoolCapability(raw, 'write');
  }
  if (item.kind === 'tool') {
    // Prefer a short capability phrase when write= is present.
    const writeMatch = /write=(true|false)/i.exec(raw);
    if (writeMatch) {
      return writeMatch[1].toLowerCase() === 'true'
        ? 'Write allowed'
        : 'Read only';
    }
    return raw;
  }
  return raw;
}

function isLongText(value: string | undefined): boolean {
  if (!value) return false;
  return value.length > 120 || value.includes('\n');
}

function mapChangeItems(items: ChangeReviewItem[]): ActionReviewChange[] {
  const out: ActionReviewChange[] = [];
  for (const item of items) {
    const before = humanChangeValue(item, 'before');
    const after = humanChangeValue(item, 'after');
    if (before == null && after == null) continue;
    const layout =
      isLongText(before) || isLongText(after) ? 'block' : 'inline';
    out.push({
      label: humanChangeLabel(item),
      ...(before != null ? { before } : {}),
      ...(after != null ? { after } : {}),
      layout,
    });
  }
  return out;
}

function businessHeadlineFromPrompt(prompt: string | undefined): string | undefined {
  if (!prompt) return undefined;
  let p = prompt.trim().replace(/\s+/g, ' ');
  if (!p) return undefined;

  const enablePatterns = [
    /^please\s+enable\s+write(?:\s+capability)?\s+so\s+(?:you\s+can\s+|we\s+can\s+|the\s+[\w\s-]+\s+can\s+)?/i,
    /^enable\s+write(?:\s+capability)?\s+so\s+(?:you\s+can\s+|we\s+can\s+|the\s+[\w\s-]+\s+can\s+)?/i,
  ];
  for (const re of enablePatterns) {
    if (re.test(p)) {
      const rest = p.replace(re, '').replace(/\.$/, '').trim();
      if (rest) return `AI system wants to ${rest}.`;
    }
  }

  if (
    /^(update|create|send|delete|change|append|modify|add)\b/i.test(p) &&
    p.length <= 180
  ) {
    const body = p.replace(/\.$/, '');
    return `AI system wants to ${body.charAt(0).toLowerCase()}${body.slice(1)}.`;
  }

  return undefined;
}

function headlineFromLifecycle(change: ChangeReviewPreview): string {
  const fromPrompt = businessHeadlineFromPrompt(
    change.evidence?.requester_prompt,
  );
  // Prefer a concrete business ask from the requester when available,
  // unless it is only "enable write" with no further action described.
  if (
    fromPrompt &&
    !/^AI system wants to enable write\b/i.test(fromPrompt)
  ) {
    return fromPrompt;
  }

  const items = change.items ?? [];
  const write = items.find((i) =>
    i.id.toLowerCase().includes('write_capability'),
  );
  const writeTools = items.filter(
    (i) =>
      i.kind === 'tool' &&
      (i.action === 'added' || i.action === 'modified') &&
      /write=true/i.test(i.after ?? ''),
  );
  const removedTools = items.filter(
    (i) => i.kind === 'tool' && i.action === 'removed',
  );
  const autonomy = items.find((i) =>
    i.id.toLowerCase().includes('autonomy'),
  );

  if (write && write.before === 'false' && write.after === 'true') {
    return 'AI system is gaining the ability to update records.';
  }

  if (write && write.before === 'true' && write.after === 'false') {
    return 'AI system is losing the ability to update records.';
  }

  if (writeTools.length > 0 && !write) {
    return 'AI system is gaining the ability to update records.';
  }

  if (removedTools.length > 0) {
    return 'AI system is requesting to remove a tool.';
  }

  if (autonomy) {
    return `AI system wants to change autonomy from ${autonomy.before ?? '—'} to ${autonomy.after ?? '—'}.`;
  }

  if (items.length === 1) {
    const only = items[0];
    const label = humanChangeLabel(only);
    if (only.action === 'added') {
      return `AI system wants to add ${label}.`;
    }
    if (only.action === 'removed') {
      return `AI system wants to remove ${label}.`;
    }
    if (only.before != null && only.after != null) {
      return `AI system wants to change ${label} from ${only.before} to ${only.after}.`;
    }
  }

  if (items.length > 1) {
    return 'AI system wants to change its capabilities.';
  }

  return 'AI system wants to make a change that requires review.';
}

function whyReviewingLifecycle(change: ChangeReviewPreview): string {
  const items = change.items ?? [];
  const write = items.find((i) =>
    i.id.toLowerCase().includes('write_capability'),
  );
  if (write && write.before === 'false' && write.after === 'true') {
    return 'The AI system is gaining the ability to modify records.';
  }
  if (write && write.before === 'true' && write.after === 'false') {
    return 'The AI system would lose the ability to modify records.';
  }
  if (items.some((i) => i.id.toLowerCase().includes('autonomy'))) {
    return 'The AI system’s autonomy level would change.';
  }
  if (items.some((i) => i.kind === 'tool')) {
    return 'The AI system’s available tools would change.';
  }
  return 'This change needs human authorization before it can take effect.';
}

function whyReviewingRuntime(input: ActionReviewInput): string {
  return 'This AI action needs human authorization before it can proceed.';
}

function messageByRole(
  messages: Array<{ role: string; content: string }> | undefined,
  role: string,
): string | undefined {
  if (!messages?.length) return undefined;
  const hit = messages.find((m) => m.role.toLowerCase() === role.toLowerCase());
  const content = hit?.content?.trim();
  return content || undefined;
}

function looksLikeSyntheticHeadline(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.startsWith('ai system is gaining') ||
    t.startsWith('ai system is losing') ||
    t.startsWith('ai system wants to') ||
    t.startsWith('ai system is requesting') ||
    t.startsWith('technical change inventory') ||
    // Capability-elevation / inventory stand-ins — not the end-user business ask.
    t.startsWith('enable write capability') ||
    t.startsWith('disable write capability') ||
    t.startsWith('authorize the proposed capability') ||
    t.includes('elevating the governed application') ||
    t.includes('need write capability approved')
  );
}

function clipOptional(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractPromptFromSystemBrief(content: string): string | undefined {
  const match = /Requester prompt:\s*\n([\s\S]+?)(?:\n\s*\n(?:Rationale|Agent rationale|Intended outcome|If Authorize|If Deny)|$)/i.exec(
    content,
  );
  const prompt = match?.[1]?.trim();
  return prompt && !looksLikeSyntheticHeadline(prompt) ? prompt : undefined;
}

/** Best-effort retained prompt from held messages + change review evidence.
 * Prompt = the end-user’s business ask to the agent (send email, update case, …).
 * Never invent capability-inventory or write-justification text. */
export function extractRetainedPrompt(input: {
  messages?: Array<{ role: string; content: string }>;
  change_review?: ChangeReviewPreview;
}): string | undefined {
  const fromEvidence = clipOptional(input.change_review?.evidence?.requester_prompt);
  if (fromEvidence && !looksLikeSyntheticHeadline(fromEvidence)) {
    return fromEvidence;
  }

  for (const m of input.messages ?? []) {
    if (m.role.toLowerCase() !== 'user') continue;
    const content = clipOptional(m.content);
    if (!content || looksLikeSyntheticHeadline(content)) continue;
    if (content.startsWith('Technical change inventory')) continue;
    return content;
  }

  for (const m of input.messages ?? []) {
    if (m.role.toLowerCase() !== 'system') continue;
    const fromBrief = extractPromptFromSystemBrief(m.content ?? '');
    if (fromBrief) return fromBrief;
  }

  return undefined;
}


function runtimeHeadline(input: ActionReviewInput): string {
  const fromPrompt = businessHeadlineFromPrompt(
    messageByRole(input.messages, 'user') ??
      input.messages?.find((m) => m.role !== 'system')?.content,
  );
  if (fromPrompt) return fromPrompt;

  const op = (input.operation ?? '').toLowerCase().trim();
  const intent = input.classification?.intent?.trim();

  if (op === 'lifecycle_change' || op.includes('lifecycle')) {
    return 'AI system wants to change its capabilities.';
  }
  if (op === 'summarize') {
    return 'AI system wants to summarize content.';
  }
  if (op === 'write' || op === 'update' || op === 'modify') {
    return 'AI system wants to update records.';
  }
  if (op === 'delete') {
    return 'AI system wants to delete a resource.';
  }
  if (op === 'send' || op === 'email') {
    return 'AI system wants to send a message.';
  }
  if (op && op !== '—') {
    return `AI system wants to perform a ${titleCaseWords(op)} action.`;
  }
  if (intent) {
    return `AI system wants to take an action related to ${titleCaseWords(intent)}.`;
  }
  return 'AI system wants to take an action that requires review.';
}

function decisionPresentation(input: ActionReviewInput): {
  status: string;
  explanation: string;
} {
  const disposition = (input.human_disposition ?? '').toUpperCase();
  const finalDec = (input.final_decision ?? '').toUpperCase();
  const machine = (input.machine_decision ?? 'REVIEW').toUpperCase();

  if (disposition === 'AUTHORIZE' || finalDec === 'ALLOW') {
    return {
      status: 'AUTHORIZED',
      explanation:
        'A human authorized this action. Enigma will apply the authorized outcome according to governance rules.',
    };
  }
  if (disposition === 'DENY' || finalDec === 'DENY' || finalDec === 'BLOCK') {
    return {
      status: 'DENIED',
      explanation:
        'A human denied this action. The proposed change or request remains blocked.',
    };
  }
  if (machine === 'REVIEW') {
    return {
      status: 'REVIEW REQUIRED',
      explanation:
        'Enigma needs you to Authorize or Deny before this can proceed.',
    };
  }
  return {
    status: titleCaseWords(machine),
    explanation: 'This is the current Enigma decision for the request.',
  };
}

function buildTechnical(
  input: ActionReviewInput,
  change?: ChangeReviewPreview,
): ActionReviewTechnicalDetail[] {
  const rows: ActionReviewTechnicalDetail[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value != null && String(value).trim()) {
      rows.push({ label, value: String(value) });
    }
  };
  push('Request ID', change?.request_id ?? input.correlation_id);
  push('Correlation ID', input.correlation_id);
  push('Application ID', input.application_id);
  push('Organization ID', input.organization_id);
  push('User ID', input.user_id);
  push('Operation', input.operation);
  push('Model', input.model);
  if (change) {
    push('Change ID', change.change_id);
    push('Target type', change.target_type);
    push('Target ID', change.target_id);
    push('Previous baseline', change.previous_baseline_id);
    push('Source', change.source);
    push('Actor', change.actor);
    push('Materiality', change.materiality);
    push('Lifecycle decision', change.lifecycle_decision);
    if (change.change_types?.length) {
      push('Change types', change.change_types.join(', '));
    }
    if (change.governance_impacts?.length) {
      push('Governance impacts', change.governance_impacts.join(', '));
    }
    if (change.materiality_reasons?.length) {
      push('Materiality reasons', change.materiality_reasons.join(', '));
    }
    for (const item of change.items ?? []) {
      const before = item.before ?? '—';
      const after = item.after ?? '—';
      push(
        `Inventory: ${item.id}`,
        `${item.action} · ${item.label} · ${before} → ${after}`,
      );
    }
    if (change.evidence?.requester_prompt) {
      push('Requester prompt', change.evidence.requester_prompt);
    }
    if (change.evidence?.rationale) {
      push('Rationale', change.evidence.rationale);
    }
    if (change.evidence?.intended_outcome) {
      push('Intended outcome', change.evidence.intended_outcome);
    }
  }
  if (input.classification?.reason_codes?.length) {
    push('Signals', input.classification.reason_codes.join(', '));
  }
  push('Sensitivity', input.classification?.sensitivity);
  push('Risk', input.classification?.risk);
  return rows;
}

/** Build human-readable Request Review presentation from existing Enigma data. */
export function buildActionReviewPresentation(
  input: ActionReviewInput,
): ActionReviewPresentation {
  const change = input.change_review;
  const kind: ActionReviewKind = change ? 'lifecycle_change' : 'runtime';
  const actor_label = 'AI system';

  if (change) {
    // Primary screen: only meaningful field-level deltas (not capability/tool inventory).
    const changes = mapChangeItems(
      (change.items ?? []).filter((item) => {
        const id = item.id.toLowerCase();
        if (id.includes('write_capability')) return false;
        if (item.kind === 'tool' || item.kind === 'data_source') return false;
        return true;
      }),
    );
    const targets: ActionReviewTargetAttr[] = [
      {
        label: humanTargetType(change.target_type),
        value: change.target_id,
      },
    ];
    if (change.previous_baseline_id) {
      targets.push({
        label: 'Previous baseline',
        value: change.previous_baseline_id,
      });
    }

    const prompt = extractRetainedPrompt({
      messages: input.messages,
      change_review: change,
    });

    return {
      kind,
      headline: prompt ?? headlineFromLifecycle(change),
      ...(prompt ? { prompt } : {}),
      actor_label,
      targets,
      changes,
      why_reviewing: whyReviewingLifecycle(change),
      decision: decisionPresentation(input),
      technical: buildTechnical(input, change),
    };
  }

  const userPrompt = extractRetainedPrompt({
    messages: input.messages,
    change_review: input.change_review,
  });
  const assistant =
    messageByRole(input.messages, 'assistant') ??
    messageByRole(input.messages, 'system');

  const ai_context: ActionReviewAiContext | undefined =
    input.retained && (userPrompt || assistant)
      ? {
          ...(userPrompt ? { prompt: userPrompt } : {}),
          ...(assistant ? { response: assistant } : {}),
          ...(input.messages?.length
            ? { conversation: input.messages }
            : {}),
        }
      : undefined;

  const targets: ActionReviewTargetAttr[] = [];
  if (input.application_id) {
    targets.push({ label: 'Application', value: input.application_id });
  }
  if (input.model) {
    targets.push({ label: 'Model', value: input.model });
  }

  return {
    kind,
    headline: userPrompt ?? runtimeHeadline(input),
    ...(userPrompt ? { prompt: userPrompt } : {}),
    actor_label,
    targets,
    changes: [],
    why_reviewing: whyReviewingRuntime(input),
    ...(ai_context ? { ai_context } : {}),
    decision: decisionPresentation(input),
    technical: buildTechnical(input),
  };
}
