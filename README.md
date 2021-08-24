# Netless App

## Develop

Setup:

```bash
gh repo clone netless-io/netless-app
cd netless-app
pnpm i
pnpm build -r
pnpm dev
```

Common:

```bash
# install dev dependencies in top-level package.json
pnpm add -DW vite

# install dependencies to some package
pnpm add lodash --filter playground

# install packages/app-hello-world to packages/playground
pnpm add @netless/app-hello-world --workspace --filter playground
# it updates packages/app/package.json
# : dependencies->@netless/app-hello-world-> "workspace:^0.1.0"

# learn more about workspace in https://pnpm.io/workspaces

# update dependencies (-L = latest, -i = interactive)
pnpm up -Li

# start playground
pnpm dev --filter playground

# build all packages
pnpm build -r

# build one package
pnpm build --filter @netless/app-hello-world
```

## License

The MIT license.
