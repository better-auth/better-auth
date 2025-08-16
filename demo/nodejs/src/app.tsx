import {
  createRoot
} from 'react-dom/client'
import { createAuthClient } from "better-auth/react"
import type { auth } from './server'

export const authClient =  createAuthClient({
  baseURL: 'http://localhost:3000/api/auth',
})

const App = () => {
  const {  } = authClient.useSession()
  return (
    <div>
      <h1>Welcome to the Node.js Demo App</h1>
      <p>This is a simple application to demonstrate Node.js capabilities.</p>
    </div>
  )
}

createRoot(
  document.getElementById('app') as HTMLElement
).render(
  <App/>
)

