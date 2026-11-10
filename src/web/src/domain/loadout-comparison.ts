import type {EffectiveRollBasis} from './effective-roll-basis';
import type {Build} from '@leyline/schema';
import type {AccountArtifact,LocalAccount} from './account';
export interface ComparisonSide {title:string;items:AccountArtifact[];build?:Build;account?:LocalAccount;basis?:EffectiveRollBasis}
export interface ComparisonOption extends ComparisonSide {id:string}
