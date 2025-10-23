# Implements the HAST spec

Better Auth uses a modified version of the HAST spec to generate the JSX for the components.
The only difference is the `live` property, which is used to determine if the component should be stateful or not.
Components that are "live" will be controlled by a `useReducer` hook (or equivalent)