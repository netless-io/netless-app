# Netless App

Official Apps for the Agora Interactive Whiteboard.

## Installation:

> If you don't have pnpm installed:
>
> ```bash
> npm i -g pnpm
> ```

Clone or fork this project, at project root run:

```bash
pnpm i
pnpm build-all
```

## Development

```bash
pnpm dev
```

## Env:

By default the `playground` demo uses a shared [Agora Whiteboard](https://www.agora.io/en/products/interactive-whiteboard/) account.

If you wish to use your own please create a new env file `packages/playground/.env.local`. See `packages/playground/.env.example` for reference.

## License

The MIT license.
