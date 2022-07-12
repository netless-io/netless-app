import{x as _}from"./index.7b411db7.js";var y={exports:{}};(function(o,A){(function(i,s){{var c=s();o&&o.exports&&(A=o.exports=c),A.randomColor=c}})(_,function(){var i=null,s={};B();var c=[],x=function(r){if(r=r||{},r.seed!==void 0&&r.seed!==null&&r.seed===parseInt(r.seed,10))i=r.seed;else if(typeof r.seed=="string")i=G(r.seed);else{if(r.seed!==void 0&&r.seed!==null)throw new TypeError("The seed value must be an integer or string");i=null}var a,e,n;if(r.count!==null&&r.count!==void 0){for(var t=r.count,u=[],f=0;f<r.count;f++)c.push(!1);for(r.count=null;t>u.length;){var g=x(r);i!==null&&(r.seed=i),u.push(g)}return r.count=t,u}return a=w(r),e=F(a,r),n=T(a,e,r),C([a,e,n],r)};function w(r){if(c.length>0){var a=N(r.hue),e=h(a),n=(a[1]-a[0])/c.length,t=parseInt((e-a[0])/n);c[t]===!0?t=(t+2)%c.length:c[t]=!0;var u=(a[0]+t*n)%359,f=(a[0]+(t+1)*n)%359;return a=[u,f],e=h(a),e<0&&(e=360+e),e}else{var a=I(r.hue);return e=h(a),e<0&&(e=360+e),e}}function F(r,a){if(a.hue==="monochrome")return 0;if(a.luminosity==="random")return h([0,100]);var e=$(r),n=e[0],t=e[1];switch(a.luminosity){case"bright":n=55;break;case"dark":n=t-10;break;case"light":t=55;break}return h([n,t])}function T(r,a,e){var n=H(r,a),t=100;switch(e.luminosity){case"dark":t=n+20;break;case"light":n=(t+n)/2;break;case"random":n=0,t=100;break}return h([n,t])}function C(r,a){switch(a.format){case"hsvArray":return r;case"hslArray":return R(r);case"hsl":var e=R(r);return"hsl("+e[0]+", "+e[1]+"%, "+e[2]+"%)";case"hsla":var n=R(r),f=a.alpha||Math.random();return"hsla("+n[0]+", "+n[1]+"%, "+n[2]+"%, "+f+")";case"rgbArray":return k(r);case"rgb":var t=k(r);return"rgb("+t.join(", ")+")";case"rgba":var u=k(r),f=a.alpha||Math.random();return"rgba("+u.join(", ")+", "+f+")";default:return E(r)}}function H(r,a){for(var e=M(r).lowerBounds,n=0;n<e.length-1;n++){var t=e[n][0],u=e[n][1],f=e[n+1][0],g=e[n+1][1];if(a>=t&&a<=f){var m=(g-u)/(f-t),l=u-m*t;return m*a+l}}return 0}function I(r){if(typeof parseInt(r)=="number"){var a=parseInt(r);if(a<360&&a>0)return[a,a]}if(typeof r=="string"){if(s[r]){var e=s[r];if(e.hueRange)return e.hueRange}else if(r.match(/^#?([0-9A-F]{3}|[0-9A-F]{6})$/i)){var n=S(r)[0];return[n,n]}}return[0,360]}function $(r){return M(r).saturationRange}function M(r){r>=334&&r<=360&&(r-=360);for(var a in s){var e=s[a];if(e.hueRange&&r>=e.hueRange[0]&&r<=e.hueRange[1])return s[a]}return"Color not found"}function h(r){if(i===null){var a=.618033988749895,e=Math.random();return e+=a,e%=1,Math.floor(r[0]+e*(r[1]+1-r[0]))}else{var n=r[1]||1,t=r[0]||0;i=(i*9301+49297)%233280;var u=i/233280;return Math.floor(t+u*(n-t))}}function E(r){var a=k(r);function e(t){var u=t.toString(16);return u.length==1?"0"+u:u}var n="#"+e(a[0])+e(a[1])+e(a[2]);return n}function v(r,a,e){var n=e[0][0],t=e[e.length-1][0],u=e[e.length-1][1],f=e[0][1];s[r]={hueRange:a,lowerBounds:e,saturationRange:[n,t],brightnessRange:[u,f]}}function B(){v("monochrome",null,[[0,0],[100,0]]),v("red",[-26,18],[[20,100],[30,92],[40,89],[50,85],[60,78],[70,70],[80,60],[90,55],[100,50]]),v("orange",[18,46],[[20,100],[30,93],[40,88],[50,86],[60,85],[70,70],[100,70]]),v("yellow",[46,62],[[25,100],[40,94],[50,89],[60,86],[70,84],[80,82],[90,80],[100,75]]),v("green",[62,178],[[30,100],[40,90],[50,85],[60,81],[70,74],[80,64],[90,50],[100,40]]),v("blue",[178,257],[[20,100],[30,86],[40,80],[50,74],[60,60],[70,52],[80,44],[90,39],[100,35]]),v("purple",[257,282],[[20,100],[30,87],[40,79],[50,70],[60,65],[70,59],[80,52],[90,45],[100,42]]),v("pink",[282,334],[[20,100],[30,90],[40,86],[60,84],[80,80],[90,75],[100,73]])}function k(r){var a=r[0];a===0&&(a=1),a===360&&(a=359),a=a/360;var e=r[1]/100,n=r[2]/100,t=Math.floor(a*6),u=a*6-t,f=n*(1-e),g=n*(1-u*e),m=n*(1-(1-u)*e),l=256,d=256,b=256;switch(t){case 0:l=n,d=m,b=f;break;case 1:l=g,d=n,b=f;break;case 2:l=f,d=n,b=m;break;case 3:l=f,d=g,b=n;break;case 4:l=m,d=f,b=n;break;case 5:l=n,d=f,b=g;break}var V=[Math.floor(l*255),Math.floor(d*255),Math.floor(b*255)];return V}function S(r){r=r.replace(/^#/,""),r=r.length===3?r.replace(/(.)/g,"$1$1"):r;var a=parseInt(r.substr(0,2),16)/255,e=parseInt(r.substr(2,2),16)/255,n=parseInt(r.substr(4,2),16)/255,t=Math.max(a,e,n),u=t-Math.min(a,e,n),f=t?u/t:0;switch(t){case a:return[60*((e-n)/u%6)||0,f,t];case e:return[60*((n-a)/u+2)||0,f,t];case n:return[60*((a-e)/u+4)||0,f,t]}}function R(r){var a=r[0],e=r[1]/100,n=r[2]/100,t=(2-e)*n;return[a,Math.round(e*n/(t<1?t:2-t)*1e4)/100,t/2*100]}function G(r){for(var a=0,e=0;e!==r.length&&!(a>=Number.MAX_SAFE_INTEGER);e++)a+=r.charCodeAt(e);return a}function N(r){if(isNaN(r)){if(typeof r=="string"){if(s[r]){var e=s[r];if(e.hueRange)return e.hueRange}else if(r.match(/^#?([0-9A-F]{3}|[0-9A-F]{6})$/i)){var n=S(r)[0];return M(n).hueRange}}}else{var a=parseInt(r);if(a<360&&a>0)return M(r).hueRange}return[0,360]}return x})})(y,y.exports);var D=y.exports;export{D as r};