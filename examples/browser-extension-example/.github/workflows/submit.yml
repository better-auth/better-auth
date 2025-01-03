name: "Submit to Web Store"
on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Cache pnpm modules
        uses: actions/cache@v3
        with:
          path: ~/.pnpm-store
          key: ${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-
      - uses: pnpm/action-setup@v2.2.4
        with:
          version: latest
          run_install: true
      - name: Use Node.js 16.x
        uses: actions/setup-node@v3.4.1
        with:
          node-version: 16.x
          cache: "pnpm"
      - name: Build the extension
        run: pnpm build
      - name: Package the extension into a zip artifact
        run: pnpm package
      - name: Browser Platform Publish
        uses: PlasmoHQ/bpp@v3
        with:
          keys: ${{ secrets.SUBMIT_KEYS }}
          artifact: build/chrome-mv3-prod.zip
