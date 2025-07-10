# Better Auth CLI

Better Auth comes with a built-in CLI to help you manage the database schema needed for both core functionality and plugins.


### **Init**

The CLI includes an `init` command to add Better Auth to your project.

```bash title="terminal"
npx @better-auth/cli@latest init
```

### **Generate**

The `generate` command creates the schema required by Better Auth. If you're using a database adapter like Prisma or Drizzle, this command will generate the right schema for your ORM. If you're using the built-in Kysely adapter, it will generate an SQL file you can run directly on your database.

```bash title="terminal"
npx @better-auth/cli@latest generate
```

### **Migrate**

The `migrate` command applies the Better Auth schema directly to your database. This is available if you’re using the built-in Kysely adapter. For other adapters, you'll need to apply the schema using your ORM's migration tool.

```bash title="terminal"
npx @better-auth/cli@latest migrate
```

### **Secret**

The CLI also provides a way to generate a secret key for your Better Auth instance.

```bash title="terminal"
npx @better-auth/cli@latest secret
```


## License

MIT
