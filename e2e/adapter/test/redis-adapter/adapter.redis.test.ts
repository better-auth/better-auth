import {redisAdapter} from "@better-auth/redis-adapter"
import { testAdapter } from "@better-auth/test-utils/adapter";
import { createClient } from "redis";
import {
	authFlowTestSuite,
	caseInsensitiveTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../adapter-factory";

/**
 * Redis Client Initialization
 */
const client = createClient({
    url: "redis://127.0.0.1:6379",
});

await client.connect();

/**
 * Better Auth Adapter Test Runner
 */
const { execute } = await testAdapter({
    adapter: (options) => {
        return redisAdapter({
            client: client as any,
        });
    },
    
    // Redis in-memory database, flush before each test run
    runMigrations: async () => {
        await client.flushDb();
    },

    tests: [
        normalTestSuite(),
        transactionsTestSuite({ disableTests: { ALL: true } }),
        authFlowTestSuite(),
        numberIdTestSuite(),
        joinsTestSuite(),
        uuidTestSuite(),
        caseInsensitiveTestSuite(),
    ],

    // Custom ID generator for string-based IDs
    customIdGenerator: () => Math.random().toString(36).substring(2, 12),
});


execute();