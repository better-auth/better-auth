declare const value: unknown;

// biome-ignore format: preserve parenthesized assertion syntax for audit coverage
export const parenthesizedDouble = (value as unknown) as { id: string };
// biome-ignore format: preserve angle-bracket assertion syntax for audit coverage
export const angleDouble = <{ id: string }><unknown>value;
export const nonNullUnknownDouble = (value as unknown)! as { id: string };
export const neverDouble = value as never as { id: string };
export const anyDouble = value as any as { id: string };

// biome-ignore lint/suspicious/noTsIgnore: this prose is a scanner false-positive fixture
// This explanation mentions @ts-ignore but is not a directive.
export type SafeUnknown<T = unknown> = T;
export type SafeObject<T = object> = T;
