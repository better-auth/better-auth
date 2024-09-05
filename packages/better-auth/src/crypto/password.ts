import { Scrypt } from "oslo/password";

const password = new Scrypt();
export const { hash: hashPassword, verify: verifyPassword } = password;
