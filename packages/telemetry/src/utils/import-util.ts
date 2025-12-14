export const importRuntime = <T>(m: string): Promise<T> => {
	return (Function("mm", "return import(mm)") as any)(m);
};
