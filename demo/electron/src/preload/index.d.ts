import type { authClient } from "../lib/auth-client";

declare global {
  type Bridges = typeof authClient.$Infer.Bridges;
  interface Window extends Bridges {}
}
