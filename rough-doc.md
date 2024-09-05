
Basic Concepts


## Auth Server

the auth instance you create with `betterAuth` has 2 important properties:

- `auth.handler`
- `auth.api`

the `auth.handler` is a web standard handler that you mount on your server that handler api requests.

`auth.api` is a list of methods that you can call directly on the server, to interact with the auth server. Like `getSession` to get the current session. Plugins may add additional methods to the api. 

**Example: Getting the current session on the server**

```ts
/**
 * Consider this as a random route endpoint that we want to protect
 */
export const POST  = (request: Request)=> {
    const session = await auth.api.getSession({
        headers: request.headers // get session requires the headers to be passed
    })
}
```

## Client

The client side of the library lets you interact with the auth server and includes built-in state management for specific methods, such as useSession. 

You can import the client and use it to call these methods directly or export each method individually from the client. 

If you add new plugins, they may also introduce their own methods. For instance, using the twoFactor plugin will add methods like twoFactor.enable. Check out the example below to see how to use the client:

```tsx
const client = createAuthClient()

export const { signIn, signUp, signOut, useSession } = client

export function SignUp(){
    async function handleSubmit(data){
        await signUp.email({
            name: data.name,
            email: data.email,
            password: data.password,
        })
    }
    //...your component 
}
```
