export type LiteralString = "" | (string & Record<never, never>);

export type Prettify<T> = {
    [key in keyof T]: T[key];
} & {};