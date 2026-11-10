export function thirdPartyBundle(): {
  name: string;
  configResolved(): void;
  generateBundle(options: unknown, bundle: Record<string, unknown>): void;
};
