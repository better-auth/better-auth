import { createFetch } from "@better-fetch/fetch"


console.log("kmlm")


const app = document.getElementById("app")

if (!app) {
    throw new Error("No app element found")
}

const $fetch = createFetch({
    baseURL: "http://localhost:3000"
})

const html = `
<div>
    <label>Username</label>
    <input type="text" name="username">
    <label>Password</label>
    <input type="password" name="password">
    <button id="btn">Submit</button>
</div>
`
app.innerHTML = html

const btn = document.getElementById("btn")
btn?.addEventListener("click", async () => {
    const username = document.querySelector<HTMLInputElement>("[name=username]")?.value
    const password = document.querySelector<HTMLInputElement>("[name=password]")?.value
    if (!username || !password) {
        return
    }

    const res = await $fetch("/auth/sign-in", {
        body: {
            username,
            password
        },
        method: "POST"
    })
    console.log(res)
})