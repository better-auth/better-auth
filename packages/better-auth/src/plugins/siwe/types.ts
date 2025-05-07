import type { User } from "../../types";

export interface SiweUser extends User {
	publicKey?: string;
}