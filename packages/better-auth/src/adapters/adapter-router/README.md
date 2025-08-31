# Adapter Router

Route different Better Auth models to different database adapters while maintaining a unified interface. Perfect for things like multi-tenancy, gradual migrations, performance tiers, and microservices data ownership.

## Installation

```ts
import { adapterRouter } from "better-auth/adapters/adapter-router";
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

Routes are an array of callbacks evaluated in order. Each callback receives `{ modelName, data, operation, fallbackAdapter }` and can return an adapter or `null` to continue:

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

**Why This Works Universally:**

Better Auth's adapter interface is intentionally designed as a simple CRUD layer with no support for joins, relations, or cross-model queries. The `Adapter` interface only provides:

- `create`, `findOne`, `findMany`, `update`, `delete` - all single-model operations
- `where` clauses limited to simple field comparisons (no cross-model paths)
- No `join`, `include`, or referential integrity features

This architectural choice forces all relationship handling into application code through sequential queries, making cross-adapter routing fundamentally compatible with any Better Auth plugin - existing or future.

For example, the organization plugin's `findFullOrganization` makes 3+ separate queries even with a single database (organization, members, users) - the Adapter Router simply routes these same queries to different adapters (see [Plugin Model Support](#plugin-model-support) below).

## Fallback Adapter Access

Route callbacks now receive access to the fallback adapter, enabling dynamic routing based on data lookups. This is perfect for scenarios like multi-tenancy where you need to look up a user's tenant before routing their data.

```ts
routes: [
  async ({ data, fallbackAdapter }) => {
    if (data?.userId && !data?.tenantId) {
      // Look up user's tenant from the fallback adapter
      const user = await fallbackAdapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: data.userId }]
      });
      
      // Route to tenant-specific adapter based on lookup
      if (user?.tenantId === 'enterprise') return enterpriseAdapter;
      if (user?.tenantId === 'startup') return startupAdapter;
    }
    return null; // Continue to next route or fallback
  }
]
```


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

### Dynamic Tenant Lookup
```ts
routes: [
  async ({ data, fallbackAdapter }) => {
    if (data?.userId && !data?.tenantId) {
      // Look up user's tenant from the fallback adapter
      const user = await fallbackAdapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: data.userId }],
      });
      
      if (user?.tenantId === 'enterprise') return enterpriseAdapter;
      if (user?.tenantId === 'startup') return startupAdapter;
    }
    return null; // Fall back to shared adapter
  },
]
```

### User Preference-Based Routing
```ts
routes: [
  async ({ data, fallbackAdapter }) => {
    if (data?.userId && !data?.storageType) {
      // Look up user's storage preference from fallback
      const config = await fallbackAdapter.findOne({
        model: 'userConfig',
        where: [{ field: 'userId', value: data.userId }],
      });
      
      return config?.storageType === 'premium' ? premiumAdapter : null;
    }
    return null;
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

## Plugin Model Support

Works seamlessly with existing and future Better Auth plugins. The organization plugin's `findFullOrganization` function automatically works across adapters by making sequential queries:

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
  fallbackAdapter: Adapter;
}) => Adapter | Promise<Adapter> | null | undefined;
```

## Trade-offs

**Benefits:**
- **Flexibility**: Can route to different databases for different models
- **Completely Transparent**: Acts exactly like a normal adapter
- **Plugin Compatible**: Works with any Better Auth plugin out of the box

**Costs:**
- **Operational Complexity**: More moving parts to monitor and maintain
- **Debugging**: More difficult to trace issues with multiple database connections

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

---

**Use the Adapter Router for specific architectural requirements like multi-tenancy, compliance, or microservices. For general applications, a single adapter is simpler and more performant.**
