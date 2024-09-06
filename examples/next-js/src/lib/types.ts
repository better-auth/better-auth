import type { InferSession, InferUser } from "better-auth/types";
import type { auth } from "./_auth";

export type User = InferUser<typeof auth>;
export type Session = InferSession<typeof auth>;
