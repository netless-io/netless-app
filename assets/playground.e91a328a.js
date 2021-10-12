var c=Object.defineProperty;var s=Object.getOwnPropertySymbols;var m=Object.prototype.hasOwnProperty,b=Object.prototype.propertyIsEnumerable;var d=(e,t,o)=>t in e?c(e,t,{enumerable:!0,configurable:!0,writable:!0,value:o}):e[t]=o,r=(e,t)=>{for(var o in t||(t={}))m.call(t,o)&&d(e,o,t[o]);if(s)for(var o of s(t))b.call(t,o)&&d(e,o,t[o]);return e};const u={kind:"HelloWorld",setup(e){var o,a;e.getBox().mountStyles(`
      .netless-app-hello-world {
        display: block;
        width: 100%; height: 100%;
        overflow: hidden;
        border: 0; resize: none;
        background: #fafbfc;
        padding: .5em;
      }
   `);const t=document.createElement("textarea");t.classList.add("netless-app-hello-world"),t.value=(a=(o=e.getAttributes())==null?void 0:o.text)!=null?a:"Hello world!",e.getBox().mountContent(t),t.oninput=()=>{e.updateAttributes(["text"],t.value)},e.emitter.on("attributesUpdate",i=>{(i==null?void 0:i.text)&&(t.value=i.text)}),e.emitter.on("destroy",()=>{console.log("[HelloWorld]: destroy"),t.remove()})}},p={kind:"TwoRange",config:{minwidth:200,minheight:100},setup(e){e.getBox().mountStyles(`
      .netless-app-two-range {
        padding: 8px;
        display: flex;
        flex-flow: column nowrap;
        justify-content: center;
        gap: 8px;
        width: 100%; height: 100%;
        overflow: hidden;
        background: #fafbfc;
      }
   `);const t=r({a:50,b:50},e.getAttributes()),o=document.createElement("div");o.classList.add("netless-app-two-range");const a={},i=l=>{const n=document.createElement("input");n.type="range",n.valueAsNumber=t[l],n.oninput=()=>{const g=n.valueAsNumber;e.updateAttributes([l],t[l]=g)},a[l]=n,o.append(n)};i("a"),i("b"),e.getBox().mountContent(o),e.emitter.on("attributesUpdate",l=>{if(!!l)for(const n in l)a[n].valueAsNumber=l[n]}),e.emitter.on("destroy",()=>{o.remove()})}},w=[{kind:u.kind,src:u,options:{title:"Hello, world!"}},{kind:p.kind,src:p,options:{title:"2 range"}}];export{w as default};
