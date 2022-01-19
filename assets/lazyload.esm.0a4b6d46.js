const u=typeof window!="undefined",F=u&&!("onscroll"in window)||typeof navigator!="undefined"&&/(gle|ing|ro)bot|crawl|spider/i.test(navigator.userAgent),B=u&&"IntersectionObserver"in window,G=u&&"classList"in document.createElement("p"),P=u&&window.devicePixelRatio>1,gt={elements_selector:".lazy",container:F||u?document:null,threshold:300,thresholds:null,data_src:"src",data_srcset:"srcset",data_sizes:"sizes",data_bg:"bg",data_bg_hidpi:"bg-hidpi",data_bg_multi:"bg-multi",data_bg_multi_hidpi:"bg-multi-hidpi",data_poster:"poster",class_applied:"applied",class_loading:"loading",class_loaded:"loaded",class_error:"error",class_entered:"entered",class_exited:"exited",unobserve_completed:!0,unobserve_entered:!1,cancel_on_exit:!0,callback_enter:null,callback_exit:null,callback_applied:null,callback_loading:null,callback_loaded:null,callback_error:null,callback_finish:null,callback_cancel:null,use_native:!1},U=t=>Object.assign({},gt,t),$=function(t,o){let s;const r="LazyLoad::Initialized",a=new t(o);try{s=new CustomEvent(r,{detail:{instance:a}})}catch{s=document.createEvent("CustomEvent"),s.initCustomEvent(r,!1,!1,{instance:a})}window.dispatchEvent(s)},bt=(t,o)=>{if(!!o)if(!o.length)$(t,o);else for(let s=0,r;r=o[s];s+=1)$(t,r)},e="src",T="srcset",C="sizes",q="poster",g="llOriginalAttrs",N="loading",W="loaded",j="applied",ht="entered",x="error",Z="native",J="data-",K="ll-status",c=(t,o)=>t.getAttribute(J+o),pt=(t,o,s)=>{var r=J+o;if(s===null){t.removeAttribute(r);return}t.setAttribute(r,s)},b=t=>c(t,K),l=(t,o)=>pt(t,K,o),v=t=>l(t,null),w=t=>b(t)===null,vt=t=>b(t)===N,Et=t=>b(t)===x,y=t=>b(t)===Z,Lt=[N,W,j,x],It=t=>Lt.indexOf(b(t))>=0,d=(t,o,s,r)=>{if(!!t){if(r!==void 0){t(o,s,r);return}if(s!==void 0){t(o,s);return}t(o)}},_=(t,o)=>{if(G){t.classList.add(o);return}t.className+=(t.className?" ":"")+o},n=(t,o)=>{if(G){t.classList.remove(o);return}t.className=t.className.replace(new RegExp("(^|\\s+)"+o+"(\\s+|$)")," ").replace(/^\s+/,"").replace(/\s+$/,"")},St=t=>{t.llTempImage=document.createElement("IMG")},At=t=>{delete t.llTempImage},Q=t=>t.llTempImage,E=(t,o)=>{if(!o)return;const s=o._observer;!s||s.unobserve(t)},Ot=t=>{t.disconnect()},kt=(t,o,s)=>{o.unobserve_entered&&E(t,s)},R=(t,o)=>{!t||(t.loadingCount+=o)},Tt=t=>{!t||(t.toLoadCount-=1)},X=(t,o)=>{!t||(t.toLoadCount=o)},Ct=t=>t.loadingCount>0,Nt=t=>t.toLoadCount>0,Y=t=>{let o=[];for(let s=0,r;r=t.children[s];s+=1)r.tagName==="SOURCE"&&o.push(r);return o},V=(t,o)=>{const s=t.parentNode;if(!s||s.tagName!=="PICTURE")return;Y(s).forEach(o)},m=(t,o)=>{Y(t).forEach(o)},L=[e],tt=[e,q],I=[e,T,C],S=t=>!!t[g],ot=t=>t[g],st=t=>delete t[g],h=(t,o)=>{if(S(t))return;const s={};o.forEach(r=>{s[r]=t.getAttribute(r)}),t[g]=s},xt=t=>{S(t)||(t[g]={backgroundImage:t.style.backgroundImage})},wt=(t,o,s)=>{if(!s){t.removeAttribute(o);return}t.setAttribute(o,s)},p=(t,o)=>{if(!S(t))return;const s=ot(t);o.forEach(r=>{wt(t,r,s[r])})},yt=t=>{if(!S(t))return;const o=ot(t);t.style.backgroundImage=o.backgroundImage},Rt=(t,o,s)=>{_(t,o.class_applied),l(t,j),!!s&&(o.unobserve_completed&&E(t,o),d(o.callback_applied,t,s))},rt=(t,o,s)=>{_(t,o.class_loading),l(t,N),!!s&&(R(s,1),d(o.callback_loading,t,s))},f=(t,o,s)=>{!s||t.setAttribute(o,s)},at=(t,o)=>{f(t,C,c(t,o.data_sizes)),f(t,T,c(t,o.data_srcset)),f(t,e,c(t,o.data_src))},Vt=(t,o)=>{V(t,s=>{h(s,I),at(s,o)}),h(t,I),at(t,o)},zt=(t,o)=>{h(t,L),f(t,e,c(t,o.data_src))},Mt=(t,o)=>{m(t,s=>{h(s,L),f(s,e,c(s,o.data_src))}),h(t,tt),f(t,q,c(t,o.data_poster)),f(t,e,c(t,o.data_src)),t.load()},Dt=(t,o,s)=>{const r=c(t,o.data_bg),a=c(t,o.data_bg_hidpi),i=P&&a?a:r;!i||(t.style.backgroundImage=`url("${i}")`,Q(t).setAttribute(e,i),rt(t,o,s))},Ht=(t,o,s)=>{const r=c(t,o.data_bg_multi),a=c(t,o.data_bg_multi_hidpi),i=P&&a?a:r;!i||(t.style.backgroundImage=i,Rt(t,o,s))},ct={IMG:Vt,IFRAME:zt,VIDEO:Mt},Ft=(t,o)=>{const s=ct[t.tagName];!s||s(t,o)},Bt=(t,o,s)=>{const r=ct[t.tagName];!r||(r(t,o),rt(t,o,s))},Gt=["IMG","IFRAME","VIDEO"],Pt=t=>Gt.indexOf(t.tagName)>-1,nt=(t,o)=>{o&&!Ct(o)&&!Nt(o)&&d(t.callback_finish,o)},et=(t,o,s)=>{t.addEventListener(o,s),t.llEvLisnrs[o]=s},Ut=(t,o,s)=>{t.removeEventListener(o,s)},z=t=>!!t.llEvLisnrs,$t=(t,o,s)=>{z(t)||(t.llEvLisnrs={});const r=t.tagName==="VIDEO"?"loadeddata":"load";et(t,r,o),et(t,"error",s)},M=t=>{if(!z(t))return;const o=t.llEvLisnrs;for(let s in o){const r=o[s];Ut(t,s,r)}delete t.llEvLisnrs},it=(t,o,s)=>{At(t),R(s,-1),Tt(s),n(t,o.class_loading),o.unobserve_completed&&E(t,s)},qt=(t,o,s,r)=>{const a=y(o);it(o,s,r),_(o,s.class_loaded),l(o,W),d(s.callback_loaded,o,r),a||nt(s,r)},Wt=(t,o,s,r)=>{const a=y(o);it(o,s,r),_(o,s.class_error),l(o,x),d(s.callback_error,o,r),a||nt(s,r)},D=(t,o,s)=>{const r=Q(t)||t;if(z(r))return;$t(r,k=>{qt(k,t,o,s),M(r)},k=>{Wt(k,t,o,s),M(r)})},jt=(t,o,s)=>{St(t),D(t,o,s),xt(t),Dt(t,o,s),Ht(t,o,s)},Zt=(t,o,s)=>{D(t,o,s),Bt(t,o,s)},H=(t,o,s)=>{Pt(t)?Zt(t,o,s):jt(t,o,s)},Jt=(t,o,s)=>{t.setAttribute("loading","lazy"),D(t,o,s),Ft(t,o),l(t,Z)},dt=t=>{t.removeAttribute(e),t.removeAttribute(T),t.removeAttribute(C)},Kt=t=>{V(t,o=>{dt(o)}),dt(t)},ut=t=>{V(t,o=>{p(o,I)}),p(t,I)},Qt=t=>{m(t,o=>{p(o,L)}),p(t,tt),t.load()},Xt=t=>{p(t,L)},Yt={IMG:ut,IFRAME:Xt,VIDEO:Qt},mt=t=>{const o=Yt[t.tagName];if(!o){yt(t);return}o(t)},to=(t,o)=>{w(t)||y(t)||(n(t,o.class_entered),n(t,o.class_exited),n(t,o.class_applied),n(t,o.class_loading),n(t,o.class_loaded),n(t,o.class_error))},oo=(t,o)=>{mt(t),to(t,o),v(t),st(t)},so=(t,o,s,r)=>{!s.cancel_on_exit||!vt(t)||t.tagName==="IMG"&&(M(t),Kt(t),ut(t),n(t,s.class_loading),R(r,-1),v(t),d(s.callback_cancel,t,o,r))},ro=(t,o,s,r)=>{const a=It(t);l(t,ht),_(t,s.class_entered),n(t,s.class_exited),kt(t,s,r),d(s.callback_enter,t,o,r),!a&&H(t,s,r)},ao=(t,o,s,r)=>{w(t)||(_(t,s.class_exited),so(t,o,s,r),d(s.callback_exit,t,o,r))},co=["IMG","IFRAME","VIDEO"],lt=t=>t.use_native&&"loading"in HTMLImageElement.prototype,no=(t,o,s)=>{t.forEach(r=>{co.indexOf(r.tagName)!==-1&&Jt(r,o,s)}),X(s,0)},eo=t=>t.isIntersecting||t.intersectionRatio>0,io=t=>({root:t.container===document?null:t.container,rootMargin:t.thresholds||t.threshold+"px"}),uo=(t,o,s)=>{t.forEach(r=>eo(r)?ro(r.target,r,o,s):ao(r.target,r,o,s))},lo=(t,o)=>{o.forEach(s=>{t.observe(s)})},fo=(t,o)=>{Ot(t),lo(t,o)},_o=(t,o)=>{!B||lt(t)||(o._observer=new IntersectionObserver(s=>{uo(s,t,o)},io(t)))},ft=t=>Array.prototype.slice.call(t),A=t=>t.container.querySelectorAll(t.elements_selector),go=t=>ft(t).filter(w),bo=t=>Et(t),ho=t=>ft(t).filter(bo),_t=(t,o)=>go(t||A(o)),po=(t,o)=>{ho(A(t)).forEach(r=>{n(r,t.class_error),v(r)}),o.update()},vo=(t,o)=>{!u||window.addEventListener("online",()=>{po(t,o)})},O=function(t,o){const s=U(t);this._settings=s,this.loadingCount=0,_o(s,this),vo(s,this),this.update(o)};O.prototype={update:function(t){const o=this._settings,s=_t(t,o);if(X(this,s.length),F||!B){this.loadAll(s);return}if(lt(o)){no(s,o,this);return}fo(this._observer,s)},destroy:function(){this._observer&&this._observer.disconnect(),A(this._settings).forEach(t=>{st(t)}),delete this._observer,delete this._settings,delete this.loadingCount,delete this.toLoadCount},loadAll:function(t){const o=this._settings;_t(t,o).forEach(r=>{E(r,this),H(r,o,this)})},restoreAll:function(){const t=this._settings;A(t).forEach(o=>{oo(o,t)})}};O.load=(t,o)=>{const s=U(o);H(t,s)};O.resetStatus=t=>{v(t)};u&&bt(O,window.lazyLoadOptions);export{O as L};