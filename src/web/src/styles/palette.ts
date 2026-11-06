export const elementPalette = [
  { id: 'anemo', name: '风', primary: '#4CA98B', light: '#E5F4ED', deep: '#246B58' },
  { id: 'geo', name: '岩', primary: '#C49A45', light: '#FAF0D8', deep: '#785818' },
  { id: 'electro', name: '雷', primary: '#9475C5', light: '#EFE8F8', deep: '#64458A' },
  { id: 'dendro', name: '草', primary: '#7A9E45', light: '#EEF4E1', deep: '#4C6824' },
  { id: 'hydro', name: '水', primary: '#4F91C5', light: '#E5F0FA', deep: '#2D608B' },
  { id: 'pyro', name: '火', primary: '#CB725B', light: '#FAE8E2', deep: '#974735' },
  { id: 'cryo', name: '冰', primary: '#73ADBC', light: '#E7F4F6', deep: '#3B6C79' },
] as const;
export const neutralPalette = { canvas: '#F5F7F2', surface: '#FFFEF8', raised: '#FFFFFF', ink: '#283A36', muted: '#62726C', line: '#DAE2D9' };
const luminance = (hex: string) => {
  const parts = hex.replace('#', '').match(/../g)!.map(part => parseInt(part, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
};
export function contrastRatio(a: string, b: string): number { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); }
export function installPalette(): void {
  const style = document.documentElement.style;
  for (const element of elementPalette) for (const shade of ['primary', 'light', 'deep'] as const) style.setProperty(`--element-${element.id}-${shade}`, element[shade]);
  for (const [name, value] of Object.entries(neutralPalette)) style.setProperty(`--neutral-${name}`, value);
}
