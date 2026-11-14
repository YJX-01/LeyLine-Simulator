import { characterDefinitionSchema, projectSchema, type CharacterDefinition, type Project } from '@leyline/schema';

export function copyCharacterDefinition(character: CharacterDefinition, dataVersion: string): CharacterDefinition {
  const copy = JSON.parse(JSON.stringify(character));
  delete copy.damageCoverage;
  return characterDefinitionSchema.parse({ ...copy, id:`custom-${crypto.randomUUID()}`, revision:'1', dataVersion, origin:'custom',
    derivedFrom:{id:character.id,name:character.identity.name,revision:character.revision}, identity:{...character.identity,name:`${character.identity.name} · 自定义`} });
}
export function parseCharacterDefinition(content: string): CharacterDefinition {
  if (new TextEncoder().encode(content).byteLength > 8*1024*1024) throw new Error('角色定义超过 8 MiB。');
  let input: unknown;
  try { input=JSON.parse(content); } catch { throw new Error('角色定义不是有效的 JSON。'); }
  const parsed=characterDefinitionSchema.safeParse(input);
  if(!parsed.success)throw new Error(parsed.error.issues.find(issue=>issue.code==='custom')?.message ?? '角色定义格式无效或版本不受支持，当前草稿保持不变。');
  return parsed.data;
}
/** Text remains a draft until explicit apply/export validates every edited parameter. */
export function prepareCharacterDefinition(draft:CharacterDefinition,edits:Record<string,string>):CharacterDefinition {
  const file=characterDefinitionSchema.parse(draft);
  if (Object.keys(edits).length) delete file.damageCoverage;
  for(const [key,text] of Object.entries(edits)){
    const [skillId,hitText,levelText]=JSON.parse(key) as string[],hit=Number(hitText),level=Number(levelText);
    const talent=file.talents.find(talent=>talent.id===skillId),parameter=talent?.parameters.find(parameter=>parameter.id===talent.hits[hit]?.parameter);
    if(!parameter || !Number.isInteger(hit) || !Number.isInteger(level) || parameter.values[level]===undefined)throw new Error('修改的技能命中或天赋等级已不存在。');
    if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) || !Number.isFinite(Number(text)))throw new Error('技能倍率须为非负有限数值。');
    parameter.values[level]=Number(text);
  }
  return characterDefinitionSchema.parse(file);
}
export function applyCharacterDefinition(project:Project,actorId:string,file:CharacterDefinition):Project {
  const definition=characterDefinitionSchema.parse(file),next=projectSchema.parse(project),actor=next.candidate.actors.find(actor=>actor.id===actorId);
  if(!actor?.build)throw new Error('请先在当前轴中选择有真实配装的队员。');
  const character=actor.build.character;
  if(definition.dataVersion!==actor.build.dataVersion)throw new Error('角色数据版本与当前配装不同，请先核对版本；当前轴保持原快照。');
  const original=character.derivedFrom?.id ?? character.id;
  if(definition.id!==character.id && definition.derivedFrom?.id!==original && definition.derivedFrom?.id!==character.id)throw new Error('请使用从当前队员角色复制的元数据，避免套用另一角色的动作和效果。');
  if(definition.identity.weaponType!==actor.build.weapon.weaponType)throw new Error('角色定义与所选队员的武器类型不匹配。');
  actor.build.character=definition;actor.name=definition.identity.name;
  const snapshot=next.definitions.find(item=>item.id===actor.character);
  if(!snapshot)throw new Error('当前队员的角色定义快照缺失。');
  snapshot.source={kind:'user',reference:`${definition.id}@${definition.revision}`,verified:false};snapshot.name=`${definition.identity.name} · 自定义角色快照`;
  return projectSchema.parse(next);
}
