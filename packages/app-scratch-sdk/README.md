## @netless/app-scratch-sdk

Netless App for collaborative [scratch](https://scratch.mit.edu/) project.

### Usage

In your [scratch-gui](https://github.com/LLK/scratch-gui) project:

```js
// /src/lib/app-state-hoc.jsx

//...

class AppStateWrapper extends React.Component {
  constructor(props) {
    //...

    // replace Redux's `createStore` with `new NetlessAppScratchSDK(this).createStore`
    this.store = new NetlessAppScratchSDK(this).createStore(reducer, initialState, enhancer);
  }
  //...
}
```

That's it! Now simply bring the [scratch-gui](https://github.com/LLK/scratch-gui) up online as usual, add the url to [@netless/app-embedded-page](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page) and enjoy the magic.

```js
manager.addApp({
  kind: "EmbeddedPage",
  attributes: {
    src: "<your-scratch-website-url>",
  },
});
```

### Licence

MIT @ [netless](https://github.com/netless-io)
