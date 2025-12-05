import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import type { InternalLogger, LogLevel } from "@better-auth/core/env";
import { createEndpoint } from "better-call";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkEndpointConflicts } from "./index";

let mockLoggerLevel: LogLevel = "debug";
const mockLogger = {
	error: vi.fn(),
	warn: vi.fn(),
	info: vi.fn(),
	debug: vi.fn(),
	success: vi.fn(),
	get level(): LogLevel {
		return mockLoggerLevel;
	},
} satisfies InternalLogger;

describe("checkEndpointConflicts", () => {
	const endpoint = createEndpoint.create({});

	beforeEach(() => {
		mockLoggerLevel = "debug";
		mockLogger.error.mockReset();
		mockLogger.warn.mockReset();
		mockLogger.info.mockReset();
		mockLogger.debug.mockReset();
		mockLogger.success.mockReset();
	});

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

	it("should NOT log an error when two plugins use the same endpoint path with different methods", () => {
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

		// Should NOT report an error since methods are different
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("should log an error when two plugins use the same endpoint path with the same method", () => {
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
						method: "GET",
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
				'"/api/shared" [GET] used by plugins: plugin1, plugin2',
			),
		);
	});

	it("should NOT detect conflicts when plugins use different methods on same paths", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/resource1",
					{
						method: "GET",
					},
					vi.fn(),
				),
				endpoint2: endpoint(
					"/api/resource2",
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
					"/api/resource1",
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
					"/api/resource2",
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

		// Should not report errors since all methods are different
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("should detect conflicts when plugins use the same method on the same path", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/conflict",
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
					"/api/conflict",
					{
						method: "GET",
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
		const errorCall = mockLogger.error.mock.calls[0]![0];
		expect(errorCall).toContain(
			'"/api/conflict" [GET] used by plugins: plugin1, plugin2',
		);
	});

	it("should allow multiple endpoints from the same plugin using the same path with different methods", () => {
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

		// Should not report error since methods are different
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("should detect conflicts when same plugin has duplicate methods on same path", () => {
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
						method: "GET",
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
			expect.stringContaining('"/api/same" [GET] used by plugins: plugin1'),
		);
	});

	it("should allow three plugins on the same path with different methods", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/resource",
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
					"/api/resource",
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
					"/api/resource",
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

		// Should not report error since all methods are different
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("should detect conflicts when endpoints don't specify a method (wildcard)", () => {
		const plugin1: BetterAuthPlugin = {
			id: "plugin1",
			endpoints: {
				endpoint1: endpoint(
					"/api/wildcard",
					{
						method: "*",
					},
					vi.fn(),
				),
			},
		};

		const plugin2: BetterAuthPlugin = {
			id: "plugin2",
			endpoints: {
				endpoint2: endpoint(
					"/api/wildcard",
					{
						method: "GET",
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
			expect.stringContaining('"/api/wildcard"'),
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
