const acquisitionKey = /^(?:sha(?:1|224|256|384|512)?|md5|digest|checksum|fingerprint|upstream(?:Path|Url)?|commit(?:Id)?|repository|accessedAt|capturedAt|sourceUrl)$/i;
const acquisitionValue = /https?:\/\/|(?:^|[^a-f\d])(?:[a-f\d]{32}|[a-f\d]{40,})(?:$|[^a-f\d])|(?:\.references|ExcelBinOutput|genshin-db\/src\/data|tools\/data\/sources)[/\\]/i;

/** Return the first acquisition field in authored JSON, including nested formulas and support text. */
export function metadataAcquisitionPath(value) {
  const path = [];
  function visit(node, field) {
    if (typeof node === 'string') return acquisitionValue.test(node) || field === 'revision' && /^(?=.*[a-f])[\da-f]{7,39}$/i.test(node);
    if (!node || typeof node !== 'object') return false;
    for (const [key, child] of Object.entries(node)) {
      path.push(Array.isArray(node) ? Number(key) : key);
      if (acquisitionKey.test(key) || visit(child, key)) return true;
      path.pop();
    }
    return false;
  }
  return visit(value, '') ? path : undefined;
}
