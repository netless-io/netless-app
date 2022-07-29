var l={exports:{}};/*!
  Copyright (c) 2018 Jed Watson.
  Licensed under the MIT License (MIT), see
  http://jedwatson.github.io/classnames
*/(function(r){(function(){var a={}.hasOwnProperty;function t(){for(var e=[],n=0;n<arguments.length;n++){var s=arguments[n];if(!!s){var o=typeof s;if(o==="string"||o==="number")e.push(s);else if(Array.isArray(s)){if(s.length){var f=t.apply(null,s);f&&e.push(f)}}else if(o==="object")if(s.toString===Object.prototype.toString)for(var i in s)a.call(s,i)&&s[i]&&e.push(i);else e.push(s.toString())}}return e.join(" ")}r.exports?(t.default=t,r.exports=t):window.classNames=t})()})(l);const c=l.exports;export{c};
