import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

const workerUrl = new URL('./audit-worker.mjs', import.meta.url);

export function auditWorkerCount(maxJobs = 12) {
  const configured = Number(process.env.LEYLINE_AUDIT_WORKERS);
  if (Number.isInteger(configured) && configured >= 1) return Math.min(configured, maxJobs);
  return Math.min(maxJobs, 12, Math.max(1, availableParallelism() - 2));
}

/** Run independent audit jobs across a reusable worker_threads pool. */
export async function runAuditWorkers(jobs, requestedWorkers = auditWorkerCount(jobs.length)) {
  const count = Math.max(1, Math.min(requestedWorkers, jobs.length));
  const results = new Array(jobs.length);
  const workers = Array.from({ length: count }, () => new Worker(workerUrl));
  let nextIndex = 0;
  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      const dispatch = () => {
        if (nextIndex >= jobs.length) {
          resolve();
          return;
        }
        const index = nextIndex++;
        worker.postMessage({ id: index, task: jobs[index].task, payload: jobs[index].payload });
      };
      worker.on('message', message => {
        if (!message.ok) {
          reject(new Error(message.error));
          return;
        }
        results[message.id] = message.result;
        dispatch();
      });
      worker.on('error', reject);
      worker.on('exit', code => {
        if (code !== 0) reject(new Error(`Audit worker exited with code ${code}`));
      });
      dispatch();
    })));
  } finally {
    await Promise.allSettled(workers.map(worker => worker.terminate()));
  }
  return results;
}

export function shardCharacterIds(characterIds, shards) {
  const buckets = Array.from({ length: Math.max(1, Math.min(shards, characterIds.length)) }, () => []);
  characterIds.forEach((id, index) => buckets[index % buckets.length].push(id));
  return buckets;
}

export function mergeSingleHitModifierResults(parts) {
  const rows = [];
  const unsampled = [];
  for (const part of parts) {
    rows.push(...part.rows);
    unsampled.push(...part.unsampled);
  }
  const dedupedUnsampled = [...new Map(unsampled.map(row => [JSON.stringify(row), row])).values()];
  const failures = rows.filter(row => row.status !== 'passed').concat(dedupedUnsampled.filter(row => row.required));
  return { rows, unsampled: dedupedUnsampled, failures };
}
