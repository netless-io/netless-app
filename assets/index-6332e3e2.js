var i={},c={get exports(){return i},set exports(n){i=n}};/*!
  Copyright (c) 2018 Jed Watson.
  Licensed under the MIT License (MIT), see
  http://jedwatson.github.io/classnames
*/(function(n){(function(){var f={}.hasOwnProperty;function t(){for(var e=[],o=0;o<arguments.length;o++){var s=arguments[o];if(s){var r=typeof s;if(r==="string"||r==="number")e.push(s);else if(Array.isArray(s)){if(s.length){var l=t.apply(null,s);l&&e.push(l)}}else if(r==="object")if(s.toString===Object.prototype.toString)for(var a in s)f.call(s,a)&&s[a]&&e.push(a);else e.push(s.toString())}}return e.join(" ")}n.exports?(t.default=t,n.exports=t):window.classNames=t})()})(c);const p=i;export{p as c};
