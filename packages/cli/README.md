# Better Auth CLI

Better Auth comes with a built-in CLI to help you manage the database schema
needed for both core functionality and plugins, and to create an initial admin user
for projects using the Admin plugin.

### **Init**

The CLI includes an `init` command to add Better Auth to your project.

```bash title="terminal"
npx auth@latest init
```

### **Generate**

The `generate` command creates the schema required by Better Auth.
If you’re using a database adapter like Prisma or Drizzle, this command will
generate the right schema for your ORM.
If you’re using the built-in Kysely adapter, it will generate an SQL file you
can run directly on your database.

```bash title="terminal"
npx auth@latest generate
```

### **Migrate**

The `migrate` command applies the Better Auth schema directly to your database.
This is available if you’re using the built-in Kysely adapter.
For other adapters, you’ll need to apply the schema using your ORM’s migration
tool.

```bash title="terminal"
npx auth@latest migrate
```

### **Create Admin**

Create the first admin user for an app using the Admin plugin. The command
uses your Better Auth config and prompts before creating an admin when users
already exist. The created admin email is marked as verified by default.

```bash title="terminal"
npx auth@latest create-admin --email admin@example.com --name "Admin" --role admin
```

### **Secret**

The CLI also provides a way to generate a secret key for your Better Auth
instance.

```bash title="terminal"
npx auth@latest secret
```

## License

MIT
