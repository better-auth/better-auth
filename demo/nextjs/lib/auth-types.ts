import type { auth } from "./auth";
import { organization } from "./auth-client";

export type Session = typeof auth['$infer']['session']
export type ActiveOrganization = typeof organization.$Infer.ActiveOrganization
export type Invitation = typeof organization.$Infer.Invitation
