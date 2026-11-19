declare module 'virtual:leyline-catalog/list' {
  const catalog: import('./catalog').GameCatalog;
  export default catalog;
}
declare module 'virtual:leyline-catalog/loaders' {
  const loaders: Record<'characters' | 'weapons' | 'sets' | 'actions', Record<string, () => Promise<{ default: unknown }>>>;
  export default loaders;
}
