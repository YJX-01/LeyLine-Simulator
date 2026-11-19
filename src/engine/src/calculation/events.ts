import { type CalculationDiagnostic, type CombatContext } from '@leyline/schema';
import { eventOrder } from './effects';

/** Validate supplied causal records without inventing additional actions or damage occurrences. */
export function validateCalculationEvents(context: CombatContext): CalculationDiagnostic[] {
  const diagnostics: CalculationDiagnostic[] = [], events = new Map(context.events.map(event => [event.id, event]));
  const edges = new Map<string, string[]>(), degree = new Map(context.events.map(event => [event.id, 0]));
  for (const [index, event] of context.events.entries()) for (const sourceId of event.sourceEventIds) {
    const source = events.get(sourceId)!, order = eventOrder(source, event);
    if (order !== null && order >= 0) diagnostics.push({ code: 'invalid-range', jsonPointer: `/events/${index}/sourceEventIds`, severity: 'error', eventId: event.id, affectedOutputIds: [], message: '来源事件必须先于派生事件。' });
    const outgoing = edges.get(sourceId) ?? []; outgoing.push(event.id); edges.set(sourceId, outgoing);
    degree.set(event.id, degree.get(event.id)! + 1);
  }
  const ready = context.events.filter(event => degree.get(event.id) === 0).map(event => event.id);
  for (let index = 0; index < ready.length; index++) for (const next of edges.get(ready[index]) ?? []) {
    degree.set(next, degree.get(next)! - 1);
    if (degree.get(next) === 0) ready.push(next);
  }
  if (ready.length !== context.events.length) diagnostics.push({ code: 'cycle', jsonPointer: '/events', severity: 'error', affectedOutputIds: [], message: '事件来源存在依赖循环。' });
  return diagnostics;
}
