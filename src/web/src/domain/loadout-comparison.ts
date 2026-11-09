import type {EffectiveRollBasis} from './effective-roll-basis';
import type {RealBuild} from '@leyline/schema';
import type {AccountArtifact,LocalAccount} from './account';
export interface ComparisonSide {title:string;items:AccountArtifact[];build?:RealBuild;account?:LocalAccount;basis?:EffectiveRollBasis}
export interface ComparisonOption extends ComparisonSide {id:string}
