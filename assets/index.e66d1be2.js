import{S as B,i as U,s as A,e as c,n as x,b as _,d as l,o as g,F as R,g as E,h as i,Q as L,x as y,p as S,J as v,m as q,z,R as C}from"./vendor.5e966893.js";function j(e){let s,t,r,n,d,a,m,b,w,o,p,h,k;return{c(){s=c("div"),t=c("div"),r=c("span"),n=x(e[2]),d=_(),a=c("input"),m=_(),b=c("button"),b.textContent="GO",w=_(),o=c("iframe"),l(r,"class","netless-app-browser-status"),g(r,"loading",e[2]==="Loading"),g(r,"ready",e[2]==="Ready"),l(a,"class","netless-app-browser-url"),l(a,"autocomplete","off"),l(a,"spellcheck","false"),l(b,"class","netless-app-browser-go"),l(t,"class","netless-app-browser-omnibox"),l(o,"title","Netless App Browser"),l(o,"class","netless-app-browser-content"),l(o,"frameborder","0"),R(o.src,p=e[0])||l(o,"src",p),l(s,"class","netless-app-browser"),l(s,"data-kind","browser")},m(u,f){E(u,s,f),i(s,t),i(t,r),i(r,n),i(t,d),i(t,a),L(a,e[1]),i(t,m),i(t,b),i(s,w),i(s,o),h||(k=[y(a,"input",e[5]),y(a,"keypress",e[6]),y(b,"click",e[4]),y(o,"load",e[3])],h=!0)},p(u,[f]){f&4&&S(n,u[2]),f&4&&g(r,"loading",u[2]==="Loading"),f&4&&g(r,"ready",u[2]==="Ready"),f&2&&a.value!==u[1]&&L(a,u[1]),f&1&&!R(o.src,p=u[0])&&l(o,"src",p)},i:v,o:v,d(u){u&&q(s),h=!1,z(k)}}}function D(e,s,t){const r=C();let{url:n="about:blank"}=s,{dummyURL:d=n}=s,a="Ready";function m(){t(2,a="Ready")}function b(){t(0,n=d),t(2,a="Loading")}function w(){d=this.value,t(1,d)}const o=p=>p.key==="Enter"&&b();return e.$$set=p=>{"url"in p&&t(0,n=p.url),"dummyURL"in p&&t(1,d=p.dummyURL)},e.$$.update=()=>{e.$$.dirty&1&&r("update",n)},[n,d,a,m,b,w,o]}class F extends B{constructor(s){super();U(this,s,D,j,A,{url:0,dummyURL:1})}}var G=`.netless-app-browser{width:100%;height:100%;display:flex;flex-flow:column nowrap}.telebox-color-scheme-dark .netless-app-browser{color-scheme:dark}.netless-app-browser-omnibox{padding:2px 4px;display:flex;align-items:center;gap:4px}.netless-app-browser-status{width:5em;font-size:x-small;text-align:center}.netless-app-browser-status.loading{color:gray}.netless-app-browser-status.ready{color:green}.netless-app-browser-url{flex-grow:1}.netless-app-browser-go{padding:1px 12px}.netless-app-browser-content{display:block;flex-grow:1}
`;const M={kind:"Browser",setup(e){let s=e.getAttributes();if((s==null?void 0:s.url)||(e.setAttributes({url:"about:blank"}),s=e.getAttributes()),!s)throw new Error("[Browser]: Missing attributes");const t=e.getBox();t.mountStyles(G);const r=new F({target:t.$content,props:{url:s.url}});r.$on("update",({detail:n})=>{e.updateAttributes(["url"],n)}),e.mobxUtils.autorun(()=>{r.$set({url:s.url,dummyURL:s.url})}),e.emitter.on("destroy",()=>{console.log("[Browser]: destroy"),r.$destroy()})}};export{M as default};