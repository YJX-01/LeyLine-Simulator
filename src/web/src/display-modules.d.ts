declare module 'virtual:leyline-display/game-icon-index' {
  const table: Record<string,Record<string,{file:string;name:string;element?:string;revision?:string;rarity?:number}>>;
  export default table;
}
declare module 'virtual:leyline-display/artifact-rolls' {
  const table: Record<string,{stat:string;value:number;rarity:number}>;
  export default table;
}
declare module 'virtual:leyline-display/effective-roll-basis' {
  const table: {defaults:{hp:number;attack:number;defense:number}};
  export default table;
}
declare module 'virtual:leyline-display/character-effective-stats' {
  const table: {characters:Record<string,string[]>};
  export default table;
}
declare module 'virtual:leyline-display/artifact-set-short-names' {
  const table: Record<string,string>;
  export default table;
}
declare module 'virtual:leyline-display/mona-set-aliases' {
  const table: Record<string,string>;
  export default table;
}
declare module 'virtual:leyline-display/enka-catalog' {
  const table: {characters:Record<string,{id:string;skills:number[];skillDepotId?:number}>;weapons:Record<string,string>;sets:Record<string,string>};
  export default table;
}
declare module 'virtual:leyline-display/catalog-release-metadata' {
  const table: Record<'weapons'|'characters'|'artifacts',Record<string,{name:string;version:string;gameId:number;rarity?:number}>>;
  export default table;
}
declare module 'virtual:leyline-display/character-talent-display' {
  const table: {characters:Record<string,{key:string;name:string;label:string;icon:string;constellations:number[]}[]>};
  export default table;
}
declare module 'virtual:leyline-display/game-detail-icon-index' {
  const table: Record<string,Record<string,{file:string;name:string;element?:string;revision?:string;rarity?:number}>>;
  export default table;
}
