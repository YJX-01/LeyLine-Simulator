import release from '../../../package.json' with { type: 'json' };

export const APP_VERSION = release.version;
export const storageKeyFor = domain => `leyline-${domain}-${APP_VERSION}`;
