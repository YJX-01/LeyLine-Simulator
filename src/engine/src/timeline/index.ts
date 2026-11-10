import { projectSchema, type EvaluationResult } from '@leyline/schema';
import { evaluateDependencyGraph } from '../effects/graph';
export function evaluateTimeline(input: unknown): EvaluationResult {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { status:'invalid',points:[],objectiveValue:null,totalValue:null,plan:null,
    diagnostics:parsed.error.issues.map(issue=>({code:'invalid-input',path:issue.path.join('.'),message:issue.message})) };
  return evaluateDependencyGraph(parsed.data);
}
