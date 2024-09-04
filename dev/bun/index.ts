import { Argon2id } from "oslo/password";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils";
import { managedNonce } from "@noble/ciphers/webcrypto";
import { sha256 } from "@noble/hashes/sha256";
import { auth } from "./auth";
import { symmetricDecrypt, symmetricEncrypt } from "./ec";
const a2Id = new Argon2id();

Bun.serve({
	fetch(request, server) {
		auth;
		return new Response("Hello, World!");
	},
});
