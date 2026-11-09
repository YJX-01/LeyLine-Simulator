import type {InjectionKey} from 'vue';
import type {ArtifactReferenceTarget} from '../domain/artifact-references';
import type {AccountArtifact} from '../domain/account';
export interface ArtifactReferenceOrigin {accountId:string;item:AccountArtifact;readonly?:boolean}
export const artifactReferenceNavigation:InjectionKey<(target:ArtifactReferenceTarget,origin:ArtifactReferenceOrigin)=>void>=Symbol('artifact-reference-navigation');
