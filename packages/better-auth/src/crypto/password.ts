import { Argon2id } from "oslo/password";

const argon2 = new Argon2id();

export const hashPassword = argon2.hash;
export const verifyPassword = argon2.verify;
