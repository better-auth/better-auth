import { Bcrypt } from "oslo/password";

const bcrypt = new Bcrypt();
export const hashPassword = bcrypt.hash;
export const verifyPassword = bcrypt.verify;
