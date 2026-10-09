import { describe, expect, it, vi } from "vitest";
import type { OneTapPromptNotification } from "./client";
import { decidePromptNotification } from "./client";

/**
 * @see https://github.com/better-auth/better-auth/issues/10380
 */
describe("decidePromptNotification", () => {
	it("stops on dismissed credential_returned without retrying", () => {
		const notification: OneTapPromptNotification = {
			isDismissedMoment: () => true,
			getDismissedReason: () => "credential_returned",
		};

		expect(
			decidePromptNotification({
				useFedCM: true,
				attempt: 0,
				maxAttempts: 5,
				notification,
			}),
		).toBe("stop");
	});

	it("retries dismissals that are not terminal when attempts remain", () => {
		const notification: OneTapPromptNotification = {
			isDismissedMoment: () => true,
			getDismissedReason: () => "flow_restarted",
		};

		expect(
			decidePromptNotification({
				useFedCM: true,
				attempt: 0,
				maxAttempts: 5,
				notification,
			}),
		).toBe("retry");
	});

	it("under FedCM stops on skip without calling getSkippedReason", () => {
		const getSkippedReason = vi.fn(() => "auto_cancel");
		const notification: OneTapPromptNotification = {
			isSkippedMoment: () => true,
			getSkippedReason,
		};

		expect(
			decidePromptNotification({
				useFedCM: true,
				attempt: 0,
				maxAttempts: 5,
				notification,
			}),
		).toBe("stop");
		expect(getSkippedReason).not.toHaveBeenCalled();
	});

	it("without FedCM can retry skip reasons that are not terminal", () => {
		const notification: OneTapPromptNotification = {
			isSkippedMoment: () => true,
			getSkippedReason: () => "auto_cancel",
		};

		expect(
			decidePromptNotification({
				useFedCM: false,
				attempt: 0,
				maxAttempts: 5,
				notification,
			}),
		).toBe("retry");
	});

	it("without FedCM stops on terminal skip reasons", () => {
		const notification: OneTapPromptNotification = {
			isSkippedMoment: () => true,
			getSkippedReason: () => "user_cancel",
		};

		expect(
			decidePromptNotification({
				useFedCM: false,
				attempt: 0,
				maxAttempts: 5,
				notification,
			}),
		).toBe("stop");
	});

	it("stops retryable dismissals when maxAttempts is exhausted", () => {
		const notification: OneTapPromptNotification = {
			isDismissedMoment: () => true,
			getDismissedReason: () => "flow_restarted",
		};

		expect(
			decidePromptNotification({
				useFedCM: true,
				attempt: 5,
				maxAttempts: 5,
				notification,
			}),
		).toBe("stop");
	});

	it("without FedCM stops retryable skips when maxAttempts is exhausted", () => {
		const notification: OneTapPromptNotification = {
			isSkippedMoment: () => true,
			getSkippedReason: () => "auto_cancel",
		};

		expect(
			decidePromptNotification({
				useFedCM: false,
				attempt: 5,
				maxAttempts: 5,
				notification,
			}),
		).toBe("stop");
	});

	it("under FedCM never calls isNotDisplayed", () => {
		const isNotDisplayed = vi.fn(() => true);
		const notification: OneTapPromptNotification = {
			isNotDisplayed,
		};

		expect(
			decidePromptNotification({
				useFedCM: true,
				attempt: 0,
				maxAttempts: 5,
				notification,
			}),
		).toBeNull();
		expect(isNotDisplayed).not.toHaveBeenCalled();
	});

	it("without FedCM stops when the prompt is not displayed", () => {
		const notification: OneTapPromptNotification = {
			isNotDisplayed: () => true,
		};

		expect(
			decidePromptNotification({
				useFedCM: false,
				attempt: 0,
				maxAttempts: 5,
				notification,
			}),
		).toBe("stop");
	});
});
