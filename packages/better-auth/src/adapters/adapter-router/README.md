# Adapter Router

Route different Better Auth models to different database adapters while maintaining a unified interface. Perfect for things like multi-tenancy, gradual migrations, performance tiers, and microservices data ownership.

## Installation

```ts
import { adapterRouter } from "better-auth/adapters";
```

## Basic Usage

```ts
export const auth = betterAuth({
  database: adapterRouter({
    fallbackAdapter: prismaAdapter(prisma),
    routes: [
      // Premium users get premium storage
      ({ data }) => data?.tier === 'premium' ? premiumAdapter : null,
    ],
  }),
});
```

**Mental Model**: Define a fallback adapter for most models, then add route callbacks for specific routing logic. Routes are evaluated in order - first match wins.

## Array-Based Routing with Priority

Routes are an array of callbacks evaluated in order. Each callback receives `{ modelName, data, operation }` and can return an adapter or `null` to continue:

```ts
database: adapterRouter({
  fallbackAdapter: prismaAdapter(prisma),
  routes: [
    // Priority 1: Premium users get premium storage
    ({ data }) => data?.tier === 'premium' ? premiumAdapter : null,
    
    // Priority 2: Sessions go to cache
    ({ modelName }) => modelName === 'session' ? redisAdapter : null,
    
    // Priority 3: Reads go to replica, writes fall through to primary
    ({ operation }) => ['findOne', 'findMany'].includes(operation) ? replicaAdapter : null,
  ]
})
```

## Transparent Routing

The router acts as a completely transparent proxy - it behaves exactly like a normal adapter. Better Auth's application code handles relationships through sequential queries, so the router simply routes each query to the appropriate adapter.

## Dynamic Routing Examples

### Multi-Tenant Isolation
```ts
routes: [
  ({ data }) => {
    const tenantId = data?.tenantId;
    if (tenantId === 'enterprise') return enterpriseAdapter;
    if (tenantId === 'startup') return startupAdapter;
    return null; // Fall back to shared adapter
  },
]
```

### Geographic Compliance
```ts
routes: [
  async ({ data }) => {
    // Async geo lookup
    const region = await detectRegion(data?.userId);
    return region === 'eu' ? euAdapter : null;
  },
]
```

### Performance Tiers
```ts
routes: [
  ({ data, operation }) => {
    // Premium users get fast storage for all operations
    if (data?.tier === 'premium') return ssdAdapter;
    
    // Standard users: reads from cache, writes to disk
    if (['findOne', 'findMany'].includes(operation)) return cacheAdapter;
    return null; // Writes go to fallback
  },
]
```

### Load Balancing
```ts
routes: [
  ({ operation }) => {
    // Read operations go to replica
    return ['findOne', 'findMany', 'count'].includes(operation) ? replicaAdapter : null;
    // Write operations fall through to primary (fallback)
  },
]
```

## Real-World Scenarios

### Small App with Fast Sessions
```ts
database: adapterRouter({
  fallbackAdapter: prismaAdapter(prisma), // Users, accounts in PostgreSQL
  routes: [
    ({ modelName }) => modelName === 'session' ? memoryAdapter : null, // Sessions in memory
  ]
})
```

### Microservices Data Ownership
```ts
database: adapterRouter({
  fallbackAdapter: userServiceAdapter,
  routes: [
    ({ modelName }) => modelName === 'organization' ? orgServiceAdapter : null,
    ({ modelName }) => modelName === 'billing' ? billingServiceAdapter : null,
  ]
})
```

### Gradual Migration
```ts
database: adapterRouter({
  fallbackAdapter: legacyAdapter, // Old system
  routes: [
    // Migrate models one by one
    ({ modelName }) => ['user', 'session'].includes(modelName) ? newAdapter : null,
  ]
})
```

## Cross-Adapter Relationships

Better Auth handles relationships through application-level sequential queries rather than database foreign keys, making cross-adapter routing possible:

```ts
// When deleting a user across adapters:
// 1. Better Auth queries for user sessions -> routed to Redis
// 2. Better Auth queries for user accounts -> routed to MongoDB  
// 3. Better Auth deletes user -> routed to PostgreSQL
// All handled automatically by Better Auth's application logic
```

### Plugin Model Support

Works seamlessly with existing Better Auth plugins. The organization plugin's `findFullOrganization` function automatically works across adapters by making sequential queries:

```ts
// With users in PostgreSQL and organizations in MongoDB:
database: adapterRouter({
  fallbackAdapter: postgresAdapter, // Users here
  routes: [
    ({ modelName }) => ['organization', 'member', 'invitation'].includes(modelName) 
      ? mongoAdapter : null, // Org models here
  ]
})

// When you call:
const fullOrg = await auth.api.getFullOrganization({ organizationId: "org123" });

// Better Auth automatically makes these sequential queries:
// 1. adapter.findOne({ model: "organization", where: [{ field: "id", value: "org123" }] })
//    -> Routed to mongoAdapter
// 2. adapter.findMany({ model: "member", where: [{ field: "organizationId", value: "org123" }] })
//    -> Routed to mongoAdapter  
// 3. adapter.findMany({ model: "user", where: [{ field: "id", value: userIds, operator: "in" }] })
//    -> Routed to postgresAdapter (fallback)
```

## Configuration Options

```ts
interface AdapterRouterConfig {
  // The main adapter that handles models by default
  fallbackAdapter: AdapterInstance;
  
  // Array of routing callbacks evaluated in priority order
  routes?: AdapterRouterCallback[];
  
  // Optional debug logging
  debugLogs?: boolean;
}

type AdapterRouterCallback = (params: {
  modelName: string;
  data?: any;
  operation: 'create' | 'findOne' | 'findMany' | 'update' | 'updateMany' | 'delete' | 'deleteMany' | 'count';
}) => Adapter | Promise<Adapter> | null | undefined;
```

## Trade-offs

**Benefits:**
- **Completely Transparent**: Acts exactly like a normal adapter
- **Plugin Compatible**: Works with any Better Auth plugin out of the box
- **Microservices Ready**: Perfect for distributed data ownership
- **Performance Tiers**: Route based on user tier, operation type, etc.
- **Compliance**: Geographic or regulatory data placement
- **Migration Support**: Gradual migration between systems

**Costs:**
- **Multiple Round-Trips**: Cross-adapter relationships require sequential queries (same as Better Auth normally does)
- **No Transactions**: No transactional guarantees across different adapters
- **Operational Complexity**: More moving parts to monitor and maintain

## Best Practices

**✅ Recommended Patterns:**
```ts
// Keep related models together
routes: [
  // All organization models in same adapter
  ({ modelName }) => ['organization', 'member', 'invitation'].includes(modelName) ? orgAdapter : null,
  
  // Independent models can be separate
  ({ modelName }) => modelName === 'session' ? cacheAdapter : null,
]
```

**❌ Avoid:**
```ts
// Splitting tightly coupled models
routes: [
  ({ modelName }) => modelName === 'organization' ? adapter1 : null,
  ({ modelName }) => modelName === 'member' ? adapter2 : null, // Bad: members reference organizations
]
```

## Debug Logging

Enable debug logging to see routing decisions:

```ts
database: adapterRouter({
  fallbackAdapter: mainAdapter,
  routes: [...],
  debugLogs: true, // Shows routing decisions
})
```

Output:
```
[AdapterRouter] Route 0 matched for model "session": redis
[AdapterRouter] Using fallback adapter for model "user": postgres
```

## TypeScript Support

Fully typed with model validation:

```ts
import type { AdapterRouterConfig } from "better-auth/adapters";

const config: AdapterRouterConfig = {
  fallbackAdapter: prismaAdapter(prisma),
  routes: [
    ({ modelName }) => modelName === 'session' ? redisAdapter : null, // ✅ Typed
  ],
};
```

---

**Use the Adapter Router for specific architectural requirements like multi-tenancy, compliance, or microservices. For general applications, a single adapter is simpler and more performant.**