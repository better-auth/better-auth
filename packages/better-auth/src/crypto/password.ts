import argon2 from "argon2";

export const hashPassword = argon2.hash;
export const verifyPassword = argon2.verify;
