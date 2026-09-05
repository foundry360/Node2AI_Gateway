/**
 * Serialize Insight LLM enhance calls so three cards don't triple-queue on Ollama.
 */
let chain: Promise<unknown> = Promise.resolve();

export function enqueueInsightLlm<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
