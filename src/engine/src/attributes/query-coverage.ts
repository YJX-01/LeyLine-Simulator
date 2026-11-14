import { findDamageCoverage, type Build, type DamageRequest } from '@leyline/schema';

/** No proof means the existing coarse guards remain in force. Equipment/rule guards are separate. */
export function damageCoverage(build: Build, damage?: Pick<DamageRequest, 'skillId' | 'hitIndex'>) {
  return findDamageCoverage(build.character, build.constellation, damage);
}
