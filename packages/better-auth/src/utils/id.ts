import { nanoid } from "nanoid";

export const generateId = (size?: number) => {
	return nanoid(size);
};
