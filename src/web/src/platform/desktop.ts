export interface DesktopBridge {
  lookupEnka?(uid: string): Promise<string>;
  openProject(): Promise<string | null>;
  saveProject(content: string): Promise<boolean>;
}

declare global {
  interface Window {
    leylineDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.leylineDesktop;
}
