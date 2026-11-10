import { z } from 'zod';
const number = z.number().finite();
const flat = z.object({ rankLevel:number, itemType:z.string(), icon:z.string(), equipType:z.string().optional(), setId:number.optional(),
  reliquaryMainstat:z.object({ mainPropId:z.string(), statValue:number.optional(), propValue:number.optional() }).optional(),
  reliquarySubstats:z.array(z.object({ appendPropId:z.string().optional(), appendPropID:z.string().optional(), statValue:number.optional(), propValue:number.optional() })).optional() });
const equip = z.object({ itemId:number, flat, weapon:z.object({ level:number, promoteLevel:number, affixMap:z.record(z.string(),number).optional() }).optional(), reliquary:z.object({ level:number, appendPropIdList:z.array(number).max(9).optional() }).optional() });
export const enkaAvatarSchema = z.object({ avatarId:number, skillDepotId:number.optional(), propMap:z.record(z.string(),z.object({ val:z.string().optional(), ival:z.string().optional() })), talentIdList:z.array(number).optional(), skillLevelMap:z.record(z.string(),number), equipList:z.array(equip).max(6) });
export const enkaResponseSchema = z.object({ uid:z.union([number,z.string()]).optional(), ttl:number.optional(), playerInfo:z.object({ nickname:z.string().optional() }), avatarInfoList:z.array(z.unknown()).max(30).optional() });
