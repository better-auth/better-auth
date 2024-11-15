import { init } from '@paralleldrive/cuid2';

export const generateId = (size?: number) => {
	const createId = init({ length: size });
	return createId();
};
