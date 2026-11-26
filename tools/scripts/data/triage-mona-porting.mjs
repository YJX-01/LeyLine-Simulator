import { parseArgs } from 'node:util';
import { buildWorkPackets, runMonaTriage, writeTriageOutputs } from '../../lib/mona-triage.mjs';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'artifacts/mona-triage' },
    wave: { type: 'string' },
    'shard-size': { type: 'string', default: '6' },
    'emit-packets': { type: 'boolean', default: false },
  },
});

const triage = await runMonaTriage();
const shardSize = Math.max(1, Number(values['shard-size']) || 6);
const waves = values.wave ? [values.wave] : values['emit-packets'] ? ['wave1', 'wave2', 'wave3', 'wave4'] : [];
const packets = waves.flatMap(wave => buildWorkPackets(triage, { wave, shardSize }));

writeTriageOutputs(values.out, triage, packets);
console.log(JSON.stringify({
  out: values.out,
  summary: triage.summary,
  packets: packets.map(p => ({ id: p.packetId, entities: p.entities })),
}, null, 2));
