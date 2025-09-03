import { describe, it, expect, vi } from "vitest";
import { checkEndpointConflicts } from "./index";
import type { BetterAuthOptions, BetterAuthPlugin } from "../types";
import { createEndpoint } from "better-call";
import { mockLogger } from "../test/utils";

describe("checkEndpointConflicts", () => {
	const endpoint = createEndpoint.create({});

	it("should not log errors when there are no endpoint conflicts", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/endpoint1",
					{
						method: "GET",
					},
					vi.fn(),
				),
				endpoint2: endpoint(
					"/api/endpoint2",
					{
						method: "POST",
					},
					vi.fn(),
				),
			},
		};

		const plugin2: BetterAuthPlugin = {
			id: "plugin2",
			endpoints: {
				endpoint3: endpoint(
					"/api/endpoint3",
					{
						method: "GET",
					},
					vi.fn(),
				),
				endpoint4: endpoint(
					"/api/endpoint4",
					{
						method: "POST",
					},
					vi.fn(),
				),
			},
		};

		const options: BetterAuthOptions = {
			plugins: [plugin1, plugin2],
		};

		checkEndpointConflicts(options, mockLogger);

		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("should log an error when two plugins use the same endpoint path", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/shared",
					{
						method: "GET",
					},
					vi.fn(),
				),
			},
		};

		const plugin2: BetterAuthPlugin = {
			id: "plugin2",
			endpoints: {
				endpoint2: endpoint(
					"/api/shared",
					{
						method: "POST",
					},
					vi.fn(),
				),
			},
		};

		const options: BetterAuthOptions = {
			plugins: [plugin1, plugin2],
		};

		checkEndpointConflicts(options, mockLogger);

		expect(mockLogger.error).toHaveBeenCalledTimes(1);
		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.stringContaining("Endpoint path conflicts detected"),
		);
		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.stringContaining(
				'"/api/shared" used by plugins: plugin1, plugin2',
			),
		);
	});

	it("should detect multiple conflicts across different plugins", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/conflict1",
					{
						method: "GET",
					},
					vi.fn(),
				),
				endpoint2: endpoint(
					"/api/conflict2",
					{
						method: "POST",
					},
					vi.fn(),
				),
			},
		};

		const plugin2: BetterAuthPlugin = {
			id: "plugin2",
			endpoints: {
				endpoint3: endpoint(
					"/api/conflict1",
					{
						method: "POST",
					},
					vi.fn(),
				),
			},
		};

		const plugin3: BetterAuthPlugin = {
			id: "plugin3",
			endpoints: {
				endpoint4: endpoint(
					"/api/conflict2",
					{
						method: "GET",
					},
					vi.fn(),
				),
			},
		};

		const options: BetterAuthOptions = {
			plugins: [plugin1, plugin2, plugin3],
		};

		checkEndpointConflicts(options, mockLogger);

		expect(mockLogger.error).toHaveBeenCalledTimes(1);
		const errorCall = mockLogger.error.mock.calls[0][0];
		expect(errorCall).toContain(
			'"/api/conflict1" used by plugins: plugin1, plugin2',
		);
		expect(errorCall).toContain(
			'"/api/conflict2" used by plugins: plugin1, plugin3',
		);
	});

	it("should handle multiple endpoints from the same plugin using the same path", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/same",
					{
						method: "GET",
					},
					vi.fn(),
				),
				endpoint2: endpoint(
					"/api/same",
					{
						method: "POST",
					},
					vi.fn(),
				),
			},
		};

		const options: BetterAuthOptions = {
			plugins: [plugin1],
		};

		checkEndpointConflicts(options, mockLogger);

		expect(mockLogger.error).toHaveBeenCalledTimes(1);
		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.stringContaining('"/api/same" used by plugins: plugin1'),
		);
	});

	it("should handle three plugins conflicting on the same path", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/triple-conflict",
					{
						method: "GET",
					},
					vi.fn(),
				),
			},
		};

		const plugin2: BetterAuthPlugin = {
			id: "plugin2",
			endpoints: {
				endpoint2: endpoint(
					"/api/triple-conflict",
					{
						method: "POST",
					},
					vi.fn(),
				),
			},
		};

		const plugin3: BetterAuthPlugin = {
			id: "plugin3",
			endpoints: {
				endpoint3: endpoint(
					"/api/triple-conflict",
					{
						method: "DELETE",
					},
					vi.fn(),
				),
			},
		};

		const options: BetterAuthOptions = {
			plugins: [plugin1, plugin2, plugin3],
		};

		checkEndpointConflicts(options, mockLogger);

		expect(mockLogger.error).toHaveBeenCalledTimes(1);
		expect(mockLogger.error).toHaveBeenCalledWith(
			expect.stringContaining(
				'"/api/triple-conflict" used by plugins: plugin1, plugin2, plugin3',
			),
		);
	});

	it("should handle plugins with no endpoints", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
		};

		const plugin2: BetterAuthPlugin = {
			id: "plugin2",
			endpoints: {},
		};

		const options: BetterAuthOptions = {
			plugins: [plugin1, plugin2],
		};

		checkEndpointConflicts(options, mockLogger);

		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("should handle options with no plugins", () => {
		const options: BetterAuthOptions = {};

		checkEndpointConflicts(options, mockLogger);

		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("should handle options with empty plugins array", () => {
		const options: BetterAuthOptions = {
			plugins: [],
		};

		checkEndpointConflicts(options, mockLogger);

		expect(mockLogger.error).not.toHaveBeenCalled();
	});
});
