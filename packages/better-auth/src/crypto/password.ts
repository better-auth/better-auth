import { Argon2id } from "oslo/password";

const bcrypt = new Argon2id();
export const hashPassword = bcrypt.hash;
export const verifyPassword = bcrypt.verify;
