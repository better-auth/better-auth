- Auth endpoint paths should always consist small letters without hyphens or underscores. eg. `/signin/oauth` instead of `/sign-in/oauth` or `/sign_in_oauth` etc.

- Auth endpoints should only have 2 methods: `GET` and `POST`. If a request requires a body, it should be sent as a `POST` request. If it does not require a body, it should be sent as a `GET` request.

- Auth endpoints should use query parameters if it's `GET` request and body if it's `POST` request. You should never use both. The client only infers the properties from those two. If it's `GET` request all props will be passed as query params and if it's `POST` request all props will be passed as body.

- `currentURL` is always sent as a query param on all auth endpoints. You can get the client endpoint for any use case using that query param.