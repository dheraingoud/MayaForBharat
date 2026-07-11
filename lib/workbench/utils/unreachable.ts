// Source: bolt.diy/app/utils/unreachable.ts
export function unreachable(message: string): never {
  throw new Error(`Unreachable: ${message}`);
}
