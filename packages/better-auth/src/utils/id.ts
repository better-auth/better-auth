import {
	alphabet,
	generateRandomString as generateRandom,
} from "../crypto/random";
import { nanoid } from "nanoid";

export const generateId = (size?: number) => {
	return nanoid(size);
};
