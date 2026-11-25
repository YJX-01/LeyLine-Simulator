import { validateMonaTransformativeReviews } from './mona-transformative-audit.mjs';

/** Classify the existing difference mappings without treating an untested event sequence as resolved. */
export function classifyMonaDifferences(links, wrongArmRows = [], transformative, leylineRows = []) {
  const verifiedReactions = new Set(validateMonaTransformativeReviews(links, transformative ?? { rows: [] }, leylineRows)
    .reviews.map(review => review.id));
  return links.filter(link => link.disposition === 'different').map(link => {
    const id = link.id;
    let cause = 'unclassified', status = 'open';
    if (verifiedReactions.has(id)) {
      cause = 'reaction-coefficient-version';
      status = 'attributed';
    } else if (id.startsWith('ordinary-wrong-arm:')) {
      const row = wrongArmRows.find(item => item.status === 'different' && link.mona?.includes(item.mona)
        && link.leyline?.some(ref => ref.id === item.leyline));
      if (row?.arm?.path && link.sources?.includes(row.arm.path + ':' + row.arm.line)
        && row.ratios?.length === 15 && row.cases?.length === 3 && row.ratios.every((item, index) => item.level === index + 1 &&
        [item.mona, item.rust, item.official].every(Number.isFinite)
        && Math.abs(item.mona - item.rust) <= .000001 && Math.abs(item.mona - item.official) > .001)
        && row.cases.every((item, index) => item.level === [1, 6, 10][index] && Number.isFinite(item.actual) && Number.isFinite(item.expected)
          && Math.abs(item.actual - item.expected) <= Math.max(.000001, Math.abs(item.expected) * .000001))) {
        cause = 'talent-parameter-branch';
        status = 'attributed';
      }
    }
    return { id, cause, status, evidence: Array.isArray(link.sources) ? [...link.sources] : [],
      explanation: link.explanation ?? '', comparisons: Array.isArray(link.comparisons) ? link.comparisons : [] };
  });
}
