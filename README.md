# Netless App

Official Apps for the Agora Interactive Whiteboard.

## Develop

### Env:

Add `packages/playground/.env`. See `packages/playground/.env.example` for reference.

### Setup:

> If you don't have pnpm installed:
> 
> ```bash
> npm i -g pnpm
> ```

Clone or fork this project, at project root run:

```bash
pnpm i
pnpm build --filter \*app-shared
pnpm dev
```

### Useful commands:

```bash
# install dev dependencies in top-level package.json
pnpm add -DW vite

# install dependencies to some package
pnpm add lodash --filter playground

# install packages/app-hello-world to packages/playground
pnpm add @netless/app-hello-world --workspace --filter playground
# it updates packages/app/package.json
# dependencies -> @netless/app-hello-world -> "workspace:^0.1.0"

'learn more about workspace in https://pnpm.io/workspaces'

# update dependencies (-L = latest, -i = interactive)
pnpm up -Li

# start playground
pnpm dev --filter playground

# build all packages
pnpm build -r --filter ./packages

# build one package
pnpm build --filter @netless/app-hello-world

# publish one package (note: it updates "workspace:..." in package.json)
pnpm publish --filter @netless/app-hello-world
```

## License

The MIT license.
