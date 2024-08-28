import { InferSession, InferUser } from "better-auth/types";
import type { auth } from "./auth";

export type User = InferUser<typeof auth>;
export type Session = InferSession<typeof auth>;
