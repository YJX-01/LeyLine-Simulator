import { writeFileSync } from 'node:fs';
import { numericAudit, assertNumericAudit } from '../../lib/numeric-audit.mjs';
const report = numericAudit();
assertNumericAudit(report);
writeFileSync(new URL('../../../tools/data/audits/numeric-precision.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({compared:report.comparedValues,differences:report.differences.length,templateGaps:report.templateParameterGaps.length},null,2));
