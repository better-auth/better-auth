export function prepareChatStep({ stepNumber }: { stepNumber: number }) {
	if (stepNumber === 0) {
		return { toolChoice: "required" as const };
	}

	return {};
}
