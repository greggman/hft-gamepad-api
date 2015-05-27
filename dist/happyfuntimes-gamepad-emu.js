(function (root, factory) {
    if (false && typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        root.HFTConnect = factory();
        root.HFTConnect.init();
    }
}(this, function () {

/**
 * @license almond 0.3.1 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                //Lop off the last part of baseParts, so that . matches the
                //"directory" and not name of the baseName's module. For instance,
                //baseName of "one/two/three", maps to "one/two/three.js", but we
                //want the directory, "one/two" for this normalization.
                name = baseParts.slice(0, baseParts.length - 1).concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("node_modules/almond/almond.js", function(){});

/*
 * Copyright 2014, Gregg Tavares.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Gregg Tavares. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


/**
 * Misc IO functions
 * @module IO
 */
define('hftctrl/io',[],function() {
  var log = function() { };
  //var log = console.log.bind(console);

  /**
   * @typedef {Object} Request~Options
   * @memberOf module:IO
   * @property {number?} timeout. Timeout in ms to abort.
   *        Default = no-timeout
   * @property {string?} method default = POST.
   * @property {string?} inMimeType default = text/plain
   * @property {Object{key,value}} headers
   */

  /**
   * Make an http request request
   * @memberOf module:IO
   * @param {string} url url to request.
   * @param {string?} content to send.
   * @param {!function(error, string, xml)} callback Function to
   *        call on success or failure. If successful error will
   *        be null, object will be result from request.
   * @param {module:IO~Request~Options?} options
   */
  var request = function(url, content, callback, options) {
    content = content || "";
    options = options || { };
    var request = new XMLHttpRequest();
    if (request.overrideMimeType) {
      request.overrideMimeType(options.mimeTime || 'text/plain');
    }
    var timeout = options.timeout || 0;
    if (timeout) {  // IE11 doesn't like setting timeout to 0???!?
      request.timeout = timeout;
    }
    log("set timeout to: " + request.timeout);
    request.open(options.method || 'POST', url, true);
    var callCallback = function(error, json) {
      if (callback) {
        log("calling-callback:" + (error ? " has error" : "success"));
        callback(error, json);
        callback = undefined;  // only call it once.
      }
    };
    var handleError = function() {
      log("--error--");
      callCallback("error sending json to " + url);
    };
    var handleTimeout = function() {
      log("--timeout--");
      callCallback("timeout sending json to " + url);
    };
    var handleForcedTimeout = function() {
      if (callback) {
        log("--forced timeout--");
        request.abort();
        callCallback("forced timeout sending json to " + url);
      }
    };
    var handleFinish = function() {
      log("--finish--");
      // HTTP reports success with a 200 status. The file protocol reports
      // success with zero. HTTP does not use zero as a status code (they
      // start at 100).
      // https://developer.mozilla.org/En/Using_XMLHttpRequest
      var success = request.status === 200 || request.status === 0;
      callCallback(success ? null : 'could not load: ' + url, request.responseText);
    };
    try {
      // Safari 7 seems to ignore the timeout.
      if (timeout) {
        setTimeout(handleForcedTimeout, timeout + 50);
      }
      request.addEventListener('load', handleFinish, false);
      request.addEventListener('timeout', handleTimeout, false);
      request.addEventListener('error', handleError, false);
      if (options.headers) {
        Object.keys(options.headers).forEach(function(header) {
          request.setRequestHeader(header, options.headers[header]);
        });
      }
      request.send(content);
      log("--sent: " + url);
    } catch (e) {
      log("--exception--");
      setTimeout(function() {
        callCallback('could not load: ' + url, null);
      }, 0);
    }
  };

  /**
   * sends a JSON 'POST' request, returns JSON repsonse
   * @memberOf module:IO
   * @param {string} url url to POST to.
   * @param {Object=} jsonObject JavaScript object on which to
   *        call JSON.stringify.
   * @param {!function(error, object)} callback Function to call
   *        on success or failure. If successful error will be
   *        null, object will be json result from request.
   * @param {module:IO~Request~Options?} options
   */
  var sendJSON = function(url, jsonObject, callback, options) {
    var options = JSON.parse(JSON.stringify(options || {}));  // eslint-disable-line
    options.headers = options.headers || {};
    options.headers["Content-type"] = "application/json";
    return request(
      url,
      JSON.stringify(jsonObject),
      function(err, content) {
        if (err) {
          return callback(err);
        }
        try {
          var json = JSON.parse(content);
        } catch (e) {
          return callback(e);
        }
        callback(null, json);
      },
      options);
  };

  var makeMethodFunc = function(method) {
    return function(url, content, callback, options) {
      var options = JSON.parse(JSON.stringify(options || {}));  // eslint-disable-line
      options.method = method;
      return request(url, content, callback, options);
    };
  };

  return {
    get: makeMethodFunc("GET"),
    post: makeMethodFunc("POST"),
    "delete": makeMethodFunc("DELETE"),
    put: makeMethodFunc("PUT"),
    request: request,
    sendJSON: sendJSON,
  };
});



/*
chroma.js - JavaScript library for color conversions

Copyright (c) 2011-2013, Gregor Aisch
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. The name Gregor Aisch may not be used to endorse or promote products
   derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL GREGOR AISCH OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/
(function(){var a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B,C,D,E,F,G,H,I,J,K,L,M,N;j=function(b,c,d,e){return new a(b,c,d,e)},"undefined"!=typeof module&&null!==module&&null!=module.exports&&(module.exports=j),"function"==typeof define&&define.amd?define('hftctrl/3rdparty/chroma.min',[],function(){return j}):(J="undefined"!=typeof exports&&null!==exports?exports:this,J.chroma=j),j.color=function(b,c,d,e){return new a(b,c,d,e)},j.hsl=function(b,c,d,e){return new a(b,c,d,e,"hsl")},j.hsv=function(b,c,d,e){return new a(b,c,d,e,"hsv")},j.rgb=function(b,c,d,e){return new a(b,c,d,e,"rgb")},j.hex=function(b){return new a(b)},j.css=function(b){return new a(b)},j.lab=function(b,c,d){return new a(b,c,d,"lab")},j.lch=function(b,c,d){return new a(b,c,d,"lch")},j.hsi=function(b,c,d){return new a(b,c,d,"hsi")},j.gl=function(b,c,d,e){return new a(b,c,d,e,"gl")},j.num=function(b){return new a(b,"num")},j.random=function(){var b,c,d,e;for(c="0123456789abcdef",b="#",d=e=0;6>e;d=++e)b+=c.charAt(Math.floor(16*Math.random()));return new a(b)},j.interpolate=function(b,c,d,e){var f,g;return null==b||null==c?"#000":(("string"===(f=K(b))||"number"===f)&&(b=new a(b)),("string"===(g=K(c))||"number"===g)&&(c=new a(c)),b.interpolate(d,c,e))},j.mix=j.interpolate,j.contrast=function(b,c){var d,e,f,g;return("string"===(f=K(b))||"number"===f)&&(b=new a(b)),("string"===(g=K(c))||"number"===g)&&(c=new a(c)),d=b.luminance(),e=c.luminance(),d>e?(d+.05)/(e+.05):(e+.05)/(d+.05)},j.luminance=function(a){return j(a).luminance()},j._Color=a,a=function(){function a(){var a,b,c,d,e,f,g,h,i,j,l,m,n,s,u,v;for(f=this,c=[],h=0,d=arguments.length;d>h;h++)b=arguments[h],null!=b&&c.push(b);if(0===c.length)i=[255,0,255,1,"rgb"],s=i[0],u=i[1],v=i[2],a=i[3],e=i[4];else if("array"===K(c[0])){if(3===c[0].length)j=c[0],s=j[0],u=j[1],v=j[2],a=1;else{if(4!==c[0].length)throw"unknown input argument";l=c[0],s=l[0],u=l[1],v=l[2],a=l[3]}e=null!=(m=c[1])?m:"rgb"}else"string"===K(c[0])?(s=c[0],e="hex"):"object"===K(c[0])?(n=c[0]._rgb,s=n[0],u=n[1],v=n[2],a=n[3],e="rgb"):c.length<=2&&"number"===K(c[0])?(s=c[0],e="num"):c.length>=3&&(s=c[0],u=c[1],v=c[2]);3===c.length?(e="rgb",a=1):4===c.length?"string"===K(c[3])?(e=c[3],a=1):"number"===K(c[3])&&(e="rgb",a=c[3]):5===c.length&&(a=c[3],e=c[4]),null==a&&(a=1),"rgb"===e?f._rgb=[s,u,v,a]:"gl"===e?f._rgb=[255*s,255*u,255*v,a]:"hsl"===e?(f._rgb=q(s,u,v),f._rgb[3]=a):"hsv"===e?(f._rgb=r(s,u,v),f._rgb[3]=a):"hex"===e?f._rgb=o(s):"lab"===e?(f._rgb=t(s,u,v),f._rgb[3]=a):"lch"===e?(f._rgb=w(s,u,v),f._rgb[3]=a):"hsi"===e?(f._rgb=p(s,u,v),f._rgb[3]=a):"num"===e&&(f._rgb=A(s)),g=k(f._rgb)}return a.prototype.rgb=function(){return this._rgb.slice(0,3)},a.prototype.rgba=function(){return this._rgb},a.prototype.hex=function(){return B(this._rgb)},a.prototype.toString=function(){return this.name()},a.prototype.hsl=function(){return D(this._rgb)},a.prototype.hsv=function(){return E(this._rgb)},a.prototype.lab=function(){return F(this._rgb)},a.prototype.lch=function(){return G(this._rgb)},a.prototype.hsi=function(){return C(this._rgb)},a.prototype.gl=function(){return[this._rgb[0]/255,this._rgb[1]/255,this._rgb[2]/255,this._rgb[3]]},a.prototype.num=function(){return H(this._rgb)},a.prototype.luminance=function(b,c){var d,e,f,g;return null==c&&(c="rgb"),arguments.length?(0===b&&(this._rgb=[0,0,0,this._rgb[3]]),1===b&&(this._rgb=[255,255,255,this._rgb[3]]),d=y(this._rgb),e=1e-7,f=20,g=function(a,d){var h,i;return i=a.interpolate(.5,d,c),h=i.luminance(),Math.abs(b-h)<e||!f--?i:h>b?g(a,i):g(i,d)},this._rgb=(d>b?g(new a("black"),this):g(this,new a("white"))).rgba(),this):y(this._rgb)},a.prototype.name=function(){var a,b;a=this.hex();for(b in j.colors)if(a===j.colors[b])return b;return a},a.prototype.alpha=function(a){return arguments.length?(this._rgb[3]=a,this):this._rgb[3]},a.prototype.css=function(a){var b,c,d,e;return null==a&&(a="rgb"),c=this,d=c._rgb,3===a.length&&d[3]<1&&(a+="a"),"rgb"===a?a+"("+d.slice(0,3).map(Math.round).join(",")+")":"rgba"===a?a+"("+d.slice(0,3).map(Math.round).join(",")+","+d[3]+")":"hsl"===a||"hsla"===a?(b=c.hsl(),e=function(a){return Math.round(100*a)/100},b[0]=e(b[0]),b[1]=e(100*b[1])+"%",b[2]=e(100*b[2])+"%",4===a.length&&(b[3]=d[3]),a+"("+b.join(",")+")"):void 0},a.prototype.interpolate=function(b,c,d){var e,f,g,h,i,j,k,l,m,n,o,p,q,r;if(l=this,null==d&&(d="rgb"),"string"===K(c)&&(c=new a(c)),"hsl"===d||"hsv"===d||"lch"===d||"hsi"===d)"hsl"===d?(q=l.hsl(),r=c.hsl()):"hsv"===d?(q=l.hsv(),r=c.hsv()):"hsi"===d?(q=l.hsi(),r=c.hsi()):"lch"===d&&(q=l.lch(),r=c.lch()),"h"===d.substr(0,1)?(g=q[0],o=q[1],j=q[2],h=r[0],p=r[1],k=r[2]):(j=q[0],o=q[1],g=q[2],k=r[0],p=r[1],h=r[2]),isNaN(g)||isNaN(h)?isNaN(g)?isNaN(h)?f=Number.NaN:(f=h,1!==j&&0!==j||"hsv"===d||(n=p)):(f=g,1!==k&&0!==k||"hsv"===d||(n=o)):(e=h>g&&h-g>180?h-(g+360):g>h&&g-h>180?h+360-g:h-g,f=g+b*e),null==n&&(n=o+b*(p-o)),i=j+b*(k-j),m="h"===d.substr(0,1)?new a(f,n,i,d):new a(i,n,f,d);else if("rgb"===d)q=l._rgb,r=c._rgb,m=new a(q[0]+b*(r[0]-q[0]),q[1]+b*(r[1]-q[1]),q[2]+b*(r[2]-q[2]),d);else if("num"===d)c instanceof a||(c=new a(c,d)),q=l._rgb,r=c._rgb,m=new a((q[0]+b*(r[0]-q[0])<<16)+(q[1]+b*(r[1]-q[1])<<8)+(q[2]+b*(r[2]-q[2])&255),d);else{if("lab"!==d)throw"color mode "+d+" is not supported";q=l.lab(),r=c.lab(),m=new a(q[0]+b*(r[0]-q[0]),q[1]+b*(r[1]-q[1]),q[2]+b*(r[2]-q[2]),d)}return m.alpha(l.alpha()+b*(c.alpha()-l.alpha())),m},a.prototype.premultiply=function(){var a,b;return b=this.rgb(),a=this.alpha(),j(b[0]*a,b[1]*a,b[2]*a,a)},a.prototype.darken=function(a){var b,c;return null==a&&(a=20),c=this,b=c.lch(),b[0]-=a,j.lch(b).alpha(c.alpha())},a.prototype.darker=function(a){return this.darken(a)},a.prototype.brighten=function(a){return null==a&&(a=20),this.darken(-a)},a.prototype.brighter=function(a){return this.brighten(a)},a.prototype.saturate=function(a){var b,c;return null==a&&(a=20),c=this,b=c.lch(),b[1]+=a,j.lch(b).alpha(c.alpha())},a.prototype.desaturate=function(a){return null==a&&(a=20),this.saturate(-a)},a}(),k=function(a){var b;for(b in a)3>b?(a[b]<0&&(a[b]=0),a[b]>255&&(a[b]=255)):3===b&&(a[b]<0&&(a[b]=0),a[b]>1&&(a[b]=1));return a},n=function(a){var b,c,d,e,f,g,h,i;if(a=a.toLowerCase(),null!=j.colors&&j.colors[a])return o(j.colors[a]);if(f=a.match(/rgb\(\s*(\-?\d+),\s*(\-?\d+)\s*,\s*(\-?\d+)\s*\)/)){for(h=f.slice(1,4),e=g=0;2>=g;e=++g)h[e]=+h[e];h[3]=1}else if(f=a.match(/rgba\(\s*(\-?\d+),\s*(\-?\d+)\s*,\s*(\-?\d+)\s*,\s*([01]|[01]?\.\d+)\)/))for(h=f.slice(1,5),e=i=0;3>=i;e=++i)h[e]=+h[e];else if(f=a.match(/rgb\(\s*(\-?\d+(?:\.\d+)?)%,\s*(\-?\d+(?:\.\d+)?)%\s*,\s*(\-?\d+(?:\.\d+)?)%\s*\)/)){for(h=f.slice(1,4),e=b=0;2>=b;e=++b)h[e]=Math.round(2.55*h[e]);h[3]=1}else if(f=a.match(/rgba\(\s*(\-?\d+(?:\.\d+)?)%,\s*(\-?\d+(?:\.\d+)?)%\s*,\s*(\-?\d+(?:\.\d+)?)%\s*,\s*([01]|[01]?\.\d+)\)/)){for(h=f.slice(1,5),e=c=0;2>=c;e=++c)h[e]=Math.round(2.55*h[e]);h[3]=+h[3]}else(f=a.match(/hsl\(\s*(\-?\d+(?:\.\d+)?),\s*(\-?\d+(?:\.\d+)?)%\s*,\s*(\-?\d+(?:\.\d+)?)%\s*\)/))?(d=f.slice(1,4),d[1]*=.01,d[2]*=.01,h=q(d),h[3]=1):(f=a.match(/hsla\(\s*(\-?\d+(?:\.\d+)?),\s*(\-?\d+(?:\.\d+)?)%\s*,\s*(\-?\d+(?:\.\d+)?)%\s*,\s*([01]|[01]?\.\d+)\)/))&&(d=f.slice(1,4),d[1]*=.01,d[2]*=.01,h=q(d),h[3]=+f[4]);return h},o=function(a){var b,c,d,e,f,g;if(a.match(/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/))return(4===a.length||7===a.length)&&(a=a.substr(1)),3===a.length&&(a=a.split(""),a=a[0]+a[0]+a[1]+a[1]+a[2]+a[2]),g=parseInt(a,16),e=g>>16,d=g>>8&255,c=255&g,[e,d,c,1];if(a.match(/^#?([A-Fa-f0-9]{8})$/))return 9===a.length&&(a=a.substr(1)),g=parseInt(a,16),e=g>>24&255,d=g>>16&255,c=g>>8&255,b=255&g,[e,d,c,b];if(f=n(a))return f;throw"unknown color: "+a},p=function(a,b,e){var f,g,h,i;return i=L(arguments),a=i[0],b=i[1],e=i[2],a/=360,1/3>a?(f=(1-b)/3,h=(1+b*m(d*a)/m(c-d*a))/3,g=1-(f+h)):2/3>a?(a-=1/3,h=(1-b)/3,g=(1+b*m(d*a)/m(c-d*a))/3,f=1-(h+g)):(a-=2/3,g=(1-b)/3,f=(1+b*m(d*a)/m(c-d*a))/3,h=1-(g+f)),h=x(e*h*3),g=x(e*g*3),f=x(e*f*3),[255*h,255*g,255*f]},q=function(){var a,b,c,d,e,f,g,h,i,j,k,l,m,n;if(i=L(arguments),d=i[0],k=i[1],f=i[2],0===k)h=c=a=255*f;else{for(n=[0,0,0],b=[0,0,0],m=.5>f?f*(1+k):f+k-f*k,l=2*f-m,d/=360,n[0]=d+1/3,n[1]=d,n[2]=d-1/3,e=g=0;2>=g;e=++g)n[e]<0&&(n[e]+=1),n[e]>1&&(n[e]-=1),6*n[e]<1?b[e]=l+6*(m-l)*n[e]:2*n[e]<1?b[e]=m:3*n[e]<2?b[e]=l+(m-l)*(2/3-n[e])*6:b[e]=l;j=[Math.round(255*b[0]),Math.round(255*b[1]),Math.round(255*b[2])],h=j[0],c=j[1],a=j[2]}return[h,c,a]},r=function(){var a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r;if(i=L(arguments),d=i[0],p=i[1],r=i[2],r*=255,0===p)h=c=a=r;else switch(360===d&&(d=0),d>360&&(d-=360),0>d&&(d+=360),d/=60,e=Math.floor(d),b=d-e,f=r*(1-p),g=r*(1-p*b),q=r*(1-p*(1-b)),e){case 0:j=[r,q,f],h=j[0],c=j[1],a=j[2];break;case 1:k=[g,r,f],h=k[0],c=k[1],a=k[2];break;case 2:l=[f,r,q],h=l[0],c=l[1],a=l[2];break;case 3:m=[f,g,r],h=m[0],c=m[1],a=m[2];break;case 4:n=[q,f,r],h=n[0],c=n[1],a=n[2];break;case 5:o=[r,f,g],h=o[0],c=o[1],a=o[2]}return h=Math.round(h),c=Math.round(c),a=Math.round(a),[h,c,a]},b=18,e=.95047,f=1,g=1.08883,s=function(){var a,b,c,d,e,f;return f=L(arguments),e=f[0],a=f[1],b=f[2],c=Math.sqrt(a*a+b*b),d=(Math.atan2(b,a)/Math.PI*180+360)%360,[e,c,d]},t=function(a,b,c){var d,h,i,j,k,l,m;return void 0!==a&&3===a.length&&(i=a,a=i[0],b=i[1],c=i[2]),void 0!==a&&3===a.length&&(j=a,a=j[0],b=j[1],c=j[2]),l=(a+16)/116,k=l+b/500,m=l-c/200,k=u(k)*e,l=u(l)*f,m=u(m)*g,h=N(3.2404542*k-1.5371385*l-.4985314*m),d=N(-.969266*k+1.8760108*l+.041556*m),c=N(.0556434*k-.2040259*l+1.0572252*m),[x(h,0,255),x(d,0,255),x(c,0,255),1]},u=function(a){return a>.206893034?a*a*a:(a-4/29)/7.787037},N=function(a){return Math.round(255*(.00304>=a?12.92*a:1.055*Math.pow(a,1/2.4)-.055))},v=function(){var a,b,c,d;return d=L(arguments),c=d[0],a=d[1],b=d[2],b=b*Math.PI/180,[c,Math.cos(b)*a,Math.sin(b)*a]},w=function(a,b,c){var d,e,f,g,h,i,j;return i=v(a,b,c),d=i[0],e=i[1],f=i[2],j=t(d,e,f),h=j[0],g=j[1],f=j[2],[x(h,0,255),x(g,0,255),x(f,0,255)]},y=function(a,b,c){var d;return d=L(arguments),a=d[0],b=d[1],c=d[2],a=z(a),b=z(b),c=z(c),.2126*a+.7152*b+.0722*c},z=function(a){return a/=255,.03928>=a?a/12.92:Math.pow((a+.055)/1.055,2.4)},A=function(a){var b,c,d;if("number"===K(a)&&a>=0&&16777215>=a)return d=a>>16,c=a>>8&255,b=255&a,[d,c,b,1];throw"unknown num color: "+a},B=function(){var a,b,c,d,e,f;return d=L(arguments),c=d[0],b=d[1],a=d[2],f=c<<16|b<<8|a,e="000000"+f.toString(16),"#"+e.substr(e.length-6)},C=function(){var a,b,c,d,e,f,g,h,i;return h=L(arguments),g=h[0],c=h[1],b=h[2],a=2*Math.PI,g/=255,c/=255,b/=255,f=Math.min(g,c,b),e=(g+c+b)/3,i=1-f/e,0===i?d=0:(d=(g-c+(g-b))/2,d/=Math.sqrt((g-c)*(g-c)+(g-b)*(c-b)),d=Math.acos(d),b>c&&(d=a-d),d/=a),[360*d,i,e]},D=function(a,b,c){var d,e,f,g,h,i;return void 0!==a&&a.length>=3&&(h=a,a=h[0],b=h[1],c=h[2]),a/=255,b/=255,c/=255,g=Math.min(a,b,c),f=Math.max(a,b,c),e=(f+g)/2,f===g?(i=0,d=Number.NaN):i=.5>e?(f-g)/(f+g):(f-g)/(2-f-g),a===f?d=(b-c)/(f-g):b===f?d=2+(c-a)/(f-g):c===f&&(d=4+(a-b)/(f-g)),d*=60,0>d&&(d+=360),[d,i,e]},E=function(){var a,b,c,d,e,f,g,h,i,j;return h=L(arguments),g=h[0],c=h[1],a=h[2],f=Math.min(g,c,a),e=Math.max(g,c,a),b=e-f,j=e/255,0===e?(d=Number.NaN,i=0):(i=b/e,g===e&&(d=(c-a)/b),c===e&&(d=2+(a-g)/b),a===e&&(d=4+(g-c)/b),d*=60,0>d&&(d+=360)),[d,i,j]},F=function(){var a,b,c,d,h,i,j;return d=L(arguments),c=d[0],b=d[1],a=d[2],c=I(c),b=I(b),a=I(a),h=M((.4124564*c+.3575761*b+.1804375*a)/e),i=M((.2126729*c+.7151522*b+.072175*a)/f),j=M((.0193339*c+.119192*b+.9503041*a)/g),[116*i-16,500*(h-i),200*(i-j)]},I=function(a){return(a/=255)<=.04045?a/12.92:Math.pow((a+.055)/1.055,2.4)},M=function(a){return a>.008856?Math.pow(a,1/3):7.787037*a+4/29},G=function(){var a,b,c,d,e,f,g;return f=L(arguments),e=f[0],c=f[1],b=f[2],g=F(e,c,b),d=g[0],a=g[1],b=g[2],s(d,a,b)},H=function(){var a,b,c,d;return d=L(arguments),c=d[0],b=d[1],a=d[2],(c<<16)+(b<<8)+a},j.scale=function(a,b){var c,d,e,f,g,h,i,k,l,m,n,o,p,q,r,s,t,u,v,w,x;return k="rgb",l=j("#ccc"),p=0,g=!1,f=[0,1],d=[],n=!1,o=[],i=0,h=1,e=!1,m=0,c={},v=function(a,b){var c,e,f,g,h,i,k;if(null==a&&(a=["#ddd","#222"]),null!=a&&"string"===K(a)&&null!=(null!=(g=j.brewer)?g[a]:void 0)&&(a=j.brewer[a]),"array"===K(a)){for(a=a.slice(0),c=f=0,h=a.length-1;h>=0?h>=f:f>=h;c=h>=0?++f:--f)e=a[c],"string"===K(e)&&(a[c]=j(e));if(null!=b)o=b;else for(o=[],c=k=0,i=a.length-1;i>=0?i>=k:k>=i;c=i>=0?++k:--k)o.push(c/(a.length-1))}return u(),d=a},w=function(a){return null==a&&(a=[]),f=a,i=a[0],h=a[a.length-1],u(),m=2===a.length?0:a.length-1},s=function(a){var b,c;if(null!=f){for(c=f.length-1,b=0;c>b&&a>=f[b];)b++;return b-1}return 0},x=function(a){return a},q=function(a){var b,c,d,e,g;return g=a,f.length>2&&(e=f.length-1,b=s(a),d=f[0]+(f[1]-f[0])*(0+.5*p),c=f[e-1]+(f[e]-f[e-1])*(1-.5*p),g=i+(f[b]+.5*(f[b+1]-f[b])-d)/(c-d)*(h-i)),g},t=function(a,b){var e,g,n,p,q,r,t,u,v;if(null==b&&(b=!1),isNaN(a))return l;if(b?v=a:f.length>2?(e=s(a),v=e/(m-1)):(v=n=i!==h?(a-i)/(h-i):0,v=n=(a-i)/(h-i),v=Math.min(1,Math.max(0,v))),b||(v=x(v)),q=Math.floor(1e4*v),c[q])g=c[q];else{if("array"===K(d))for(p=r=0,u=o.length-1;u>=0?u>=r:r>=u;p=u>=0?++r:--r){if(t=o[p],t>=v){g=d[p];break}if(v>=t&&p===o.length-1){g=d[p];break}if(v>t&&v<o[p+1]){v=(v-t)/(o[p+1]-t),g=j.interpolate(d[p],d[p+1],v,k);break}}else"function"===K(d)&&(g=d(v));c[q]=g}return g},u=function(){return c={}},v(a,b),r=function(a){var b;return b=t(a),n&&b[n]?b[n]():b},r.domain=function(a,b,c,d){var e;return null==c&&(c="e"),arguments.length?(null!=b&&(e=j.analyze(a,d),a=0===b?[e.min,e.max]:j.limits(e,c,b)),w(a),r):f},r.mode=function(a){return arguments.length?(k=a,u(),r):k},r.range=function(a,b){return v(a,b),r},r.out=function(a){return n=a,r},r.spread=function(a){return arguments.length?(p=a,r):p},r.correctLightness=function(a){return arguments.length?(e=a,u(),x=e?function(a){var b,c,d,e,f,g,h,i,j;for(b=t(0,!0).lab()[0],c=t(1,!0).lab()[0],h=b>c,d=t(a,!0).lab()[0],f=b+(c-b)*a,e=d-f,i=0,j=1,g=20;Math.abs(e)>.01&&g-->0;)!function(){return h&&(e*=-1),0>e?(i=a,a+=.5*(j-a)):(j=a,a+=.5*(i-a)),d=t(a,!0).lab()[0],e=d-f}();return a}:function(a){return a},r):e},r.colors=function(b){var c,d,e,g,h,i;if(null==b&&(b="hex"),a=[],h=[],f.length>2)for(c=e=1,g=f.length;g>=1?g>e:e>g;c=g>=1?++e:--e)h.push(.5*(f[c-1]+f[c]));else h=f;for(i=0,d=h.length;d>i;i++)c=h[i],a.push(r(c)[b]());return a},r},null==j.scales&&(j.scales={}),j.scales.cool=function(){return j.scale([j.hsl(180,1,.9),j.hsl(250,.7,.4)])},j.scales.hot=function(){return j.scale(["#000","#f00","#ff0","#fff"],[0,.25,.75,1]).mode("rgb")},j.analyze=function(a,b,c){var d,e,f,g,h,i,k;if(h={min:Number.MAX_VALUE,max:-1*Number.MAX_VALUE,sum:0,values:[],count:0},null==c&&(c=function(){return!0}),d=function(a){null==a||isNaN(a)||(h.values.push(a),h.sum+=a,a<h.min&&(h.min=a),a>h.max&&(h.max=a),h.count+=1)},k=function(a,e){return c(a,e)?d(null!=b&&"function"===K(b)?b(a):null!=b&&"string"===K(b)||"number"===K(b)?a[b]:a):void 0},"array"===K(a))for(g=0,f=a.length;f>g;g++)i=a[g],k(i);else for(e in a)i=a[e],k(i,e);return h.domain=[h.min,h.max],h.limits=function(a,b){return j.limits(h,a,b)},h},j.limits=function(a,b,c){var d,e,f,g,h,i,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B,C,D,E,F,G,H,I,J,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,$,_,aa,ba,ca,da,ea,fa,ga;if(null==b&&(b="equal"),null==c&&(c=7),"array"===K(a)&&(a=j.analyze(a)),D=a.min,B=a.max,ca=a.sum,fa=a.values.sort(function(a,b){return a-b}),A=[],"c"===b.substr(0,1)&&(A.push(D),A.push(B)),"e"===b.substr(0,1)){for(A.push(D),x=J=1,O=c-1;O>=1?O>=J:J>=O;x=O>=1?++J:--J)A.push(D+x/c*(B-D));A.push(B)}else if("l"===b.substr(0,1)){if(0>=D)throw"Logarithmic scales are only possible for values > 0";for(E=Math.LOG10E*Math.log(D),C=Math.LOG10E*Math.log(B),A.push(D),x=ga=1,P=c-1;P>=1?P>=ga:ga>=P;x=P>=1?++ga:--ga)A.push(Math.pow(10,E+x/c*(C-E)));A.push(B)}else if("q"===b.substr(0,1)){for(A.push(D),x=d=1,V=c-1;V>=1?V>=d:d>=V;x=V>=1?++d:--d)L=fa.length*x/c,M=Math.floor(L),M===L?A.push(fa[M]):(N=L-M,A.push(fa[M]*N+fa[M+1]*(1-N)));A.push(B)}else if("k"===b.substr(0,1)){for(G=fa.length,r=new Array(G),v=new Array(c),ba=!0,H=0,t=null,t=[],t.push(D),x=e=1,W=c-1;W>=1?W>=e:e>=W;x=W>=1?++e:--e)t.push(D+x/c*(B-D));for(t.push(B);ba;){for(y=f=0,X=c-1;X>=0?X>=f:f>=X;y=X>=0?++f:--f)v[y]=0;for(x=g=0,Y=G-1;Y>=0?Y>=g:g>=Y;x=Y>=0?++g:--g){for(ea=fa[x],F=Number.MAX_VALUE,y=h=0,Z=c-1;Z>=0?Z>=h:h>=Z;y=Z>=0?++h:--h)w=Math.abs(t[y]-ea),F>w&&(F=w,s=y);v[s]++,r[x]=s}for(I=new Array(c),y=i=0,$=c-1;$>=0?$>=i:i>=$;y=$>=0?++i:--i)I[y]=null;for(x=k=0,_=G-1;_>=0?_>=k:k>=_;x=_>=0?++k:--k)u=r[x],null===I[u]?I[u]=fa[x]:I[u]+=fa[x];for(y=l=0,aa=c-1;aa>=0?aa>=l:l>=aa;y=aa>=0?++l:--l)I[y]*=1/v[y];for(ba=!1,y=m=0,Q=c-1;Q>=0?Q>=m:m>=Q;y=Q>=0?++m:--m)if(I[y]!==t[x]){ba=!0;break}t=I,H++,H>200&&(ba=!1)}for(z={},y=n=0,R=c-1;R>=0?R>=n:n>=R;y=R>=0?++n:--n)z[y]=[];for(x=o=0,S=G-1;S>=0?S>=o:o>=S;x=S>=0?++o:--o)u=r[x],z[u].push(fa[x]);for(da=[],y=p=0,T=c-1;T>=0?T>=p:p>=T;y=T>=0?++p:--p)da.push(z[y][0]),da.push(z[y][z[y].length-1]);for(da=da.sort(function(a,b){return a-b}),A.push(da[0]),x=q=1,U=da.length-1;U>=q;x=q+=2)isNaN(da[x])||A.push(da[x])}return A},j.brewer=i={OrRd:["#fff7ec","#fee8c8","#fdd49e","#fdbb84","#fc8d59","#ef6548","#d7301f","#b30000","#7f0000"],PuBu:["#fff7fb","#ece7f2","#d0d1e6","#a6bddb","#74a9cf","#3690c0","#0570b0","#045a8d","#023858"],BuPu:["#f7fcfd","#e0ecf4","#bfd3e6","#9ebcda","#8c96c6","#8c6bb1","#88419d","#810f7c","#4d004b"],Oranges:["#fff5eb","#fee6ce","#fdd0a2","#fdae6b","#fd8d3c","#f16913","#d94801","#a63603","#7f2704"],BuGn:["#f7fcfd","#e5f5f9","#ccece6","#99d8c9","#66c2a4","#41ae76","#238b45","#006d2c","#00441b"],YlOrBr:["#ffffe5","#fff7bc","#fee391","#fec44f","#fe9929","#ec7014","#cc4c02","#993404","#662506"],YlGn:["#ffffe5","#f7fcb9","#d9f0a3","#addd8e","#78c679","#41ab5d","#238443","#006837","#004529"],Reds:["#fff5f0","#fee0d2","#fcbba1","#fc9272","#fb6a4a","#ef3b2c","#cb181d","#a50f15","#67000d"],RdPu:["#fff7f3","#fde0dd","#fcc5c0","#fa9fb5","#f768a1","#dd3497","#ae017e","#7a0177","#49006a"],Greens:["#f7fcf5","#e5f5e0","#c7e9c0","#a1d99b","#74c476","#41ab5d","#238b45","#006d2c","#00441b"],YlGnBu:["#ffffd9","#edf8b1","#c7e9b4","#7fcdbb","#41b6c4","#1d91c0","#225ea8","#253494","#081d58"],Purples:["#fcfbfd","#efedf5","#dadaeb","#bcbddc","#9e9ac8","#807dba","#6a51a3","#54278f","#3f007d"],GnBu:["#f7fcf0","#e0f3db","#ccebc5","#a8ddb5","#7bccc4","#4eb3d3","#2b8cbe","#0868ac","#084081"],Greys:["#ffffff","#f0f0f0","#d9d9d9","#bdbdbd","#969696","#737373","#525252","#252525","#000000"],YlOrRd:["#ffffcc","#ffeda0","#fed976","#feb24c","#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"],PuRd:["#f7f4f9","#e7e1ef","#d4b9da","#c994c7","#df65b0","#e7298a","#ce1256","#980043","#67001f"],Blues:["#f7fbff","#deebf7","#c6dbef","#9ecae1","#6baed6","#4292c6","#2171b5","#08519c","#08306b"],PuBuGn:["#fff7fb","#ece2f0","#d0d1e6","#a6bddb","#67a9cf","#3690c0","#02818a","#016c59","#014636"],Spectral:["#9e0142","#d53e4f","#f46d43","#fdae61","#fee08b","#ffffbf","#e6f598","#abdda4","#66c2a5","#3288bd","#5e4fa2"],RdYlGn:["#a50026","#d73027","#f46d43","#fdae61","#fee08b","#ffffbf","#d9ef8b","#a6d96a","#66bd63","#1a9850","#006837"],RdBu:["#67001f","#b2182b","#d6604d","#f4a582","#fddbc7","#f7f7f7","#d1e5f0","#92c5de","#4393c3","#2166ac","#053061"],PiYG:["#8e0152","#c51b7d","#de77ae","#f1b6da","#fde0ef","#f7f7f7","#e6f5d0","#b8e186","#7fbc41","#4d9221","#276419"],PRGn:["#40004b","#762a83","#9970ab","#c2a5cf","#e7d4e8","#f7f7f7","#d9f0d3","#a6dba0","#5aae61","#1b7837","#00441b"],RdYlBu:["#a50026","#d73027","#f46d43","#fdae61","#fee090","#ffffbf","#e0f3f8","#abd9e9","#74add1","#4575b4","#313695"],BrBG:["#543005","#8c510a","#bf812d","#dfc27d","#f6e8c3","#f5f5f5","#c7eae5","#80cdc1","#35978f","#01665e","#003c30"],RdGy:["#67001f","#b2182b","#d6604d","#f4a582","#fddbc7","#ffffff","#e0e0e0","#bababa","#878787","#4d4d4d","#1a1a1a"],PuOr:["#7f3b08","#b35806","#e08214","#fdb863","#fee0b6","#f7f7f7","#d8daeb","#b2abd2","#8073ac","#542788","#2d004b"],Set2:["#66c2a5","#fc8d62","#8da0cb","#e78ac3","#a6d854","#ffd92f","#e5c494","#b3b3b3"],Accent:["#7fc97f","#beaed4","#fdc086","#ffff99","#386cb0","#f0027f","#bf5b17","#666666"],Set1:["#e41a1c","#377eb8","#4daf4a","#984ea3","#ff7f00","#ffff33","#a65628","#f781bf","#999999"],Set3:["#8dd3c7","#ffffb3","#bebada","#fb8072","#80b1d3","#fdb462","#b3de69","#fccde5","#d9d9d9","#bc80bd","#ccebc5","#ffed6f"],Dark2:["#1b9e77","#d95f02","#7570b3","#e7298a","#66a61e","#e6ab02","#a6761d","#666666"],Paired:["#a6cee3","#1f78b4","#b2df8a","#33a02c","#fb9a99","#e31a1c","#fdbf6f","#ff7f00","#cab2d6","#6a3d9a","#ffff99","#b15928"],Pastel2:["#b3e2cd","#fdcdac","#cbd5e8","#f4cae4","#e6f5c9","#fff2ae","#f1e2cc","#cccccc"],Pastel1:["#fbb4ae","#b3cde3","#ccebc5","#decbe4","#fed9a6","#ffffcc","#e5d8bd","#fddaec","#f2f2f2"]},j.colors=l={indigo:"#4b0082",gold:"#ffd700",hotpink:"#ff69b4",firebrick:"#b22222",indianred:"#cd5c5c",yellow:"#ffff00",mistyrose:"#ffe4e1",darkolivegreen:"#556b2f",olive:"#808000",darkseagreen:"#8fbc8f",pink:"#ffc0cb",tomato:"#ff6347",lightcoral:"#f08080",orangered:"#ff4500",navajowhite:"#ffdead",lime:"#00ff00",palegreen:"#98fb98",darkslategrey:"#2f4f4f",greenyellow:"#adff2f",burlywood:"#deb887",seashell:"#fff5ee",mediumspringgreen:"#00fa9a",fuchsia:"#ff00ff",papayawhip:"#ffefd5",blanchedalmond:"#ffebcd",chartreuse:"#7fff00",dimgray:"#696969",black:"#000000",peachpuff:"#ffdab9",springgreen:"#00ff7f",aquamarine:"#7fffd4",white:"#ffffff",orange:"#ffa500",lightsalmon:"#ffa07a",darkslategray:"#2f4f4f",brown:"#a52a2a",ivory:"#fffff0",dodgerblue:"#1e90ff",peru:"#cd853f",lawngreen:"#7cfc00",chocolate:"#d2691e",crimson:"#dc143c",forestgreen:"#228b22",darkgrey:"#a9a9a9",lightseagreen:"#20b2aa",cyan:"#00ffff",mintcream:"#f5fffa",silver:"#c0c0c0",antiquewhite:"#faebd7",mediumorchid:"#ba55d3",skyblue:"#87ceeb",gray:"#808080",darkturquoise:"#00ced1",goldenrod:"#daa520",darkgreen:"#006400",floralwhite:"#fffaf0",darkviolet:"#9400d3",darkgray:"#a9a9a9",moccasin:"#ffe4b5",saddlebrown:"#8b4513",grey:"#808080",darkslateblue:"#483d8b",lightskyblue:"#87cefa",lightpink:"#ffb6c1",mediumvioletred:"#c71585",slategrey:"#708090",red:"#ff0000",deeppink:"#ff1493",limegreen:"#32cd32",darkmagenta:"#8b008b",palegoldenrod:"#eee8aa",plum:"#dda0dd",turquoise:"#40e0d0",lightgrey:"#d3d3d3",lightgoldenrodyellow:"#fafad2",darkgoldenrod:"#b8860b",lavender:"#e6e6fa",maroon:"#800000",yellowgreen:"#9acd32",sandybrown:"#f4a460",thistle:"#d8bfd8",violet:"#ee82ee",navy:"#000080",magenta:"#ff00ff",dimgrey:"#696969",tan:"#d2b48c",rosybrown:"#bc8f8f",olivedrab:"#6b8e23",blue:"#0000ff",lightblue:"#add8e6",ghostwhite:"#f8f8ff",honeydew:"#f0fff0",cornflowerblue:"#6495ed",slateblue:"#6a5acd",linen:"#faf0e6",darkblue:"#00008b",powderblue:"#b0e0e6",seagreen:"#2e8b57",darkkhaki:"#bdb76b",snow:"#fffafa",sienna:"#a0522d",mediumblue:"#0000cd",royalblue:"#4169e1",lightcyan:"#e0ffff",green:"#008000",mediumpurple:"#9370db",midnightblue:"#191970",cornsilk:"#fff8dc",paleturquoise:"#afeeee",bisque:"#ffe4c4",slategray:"#708090",darkcyan:"#008b8b",khaki:"#f0e68c",wheat:"#f5deb3",teal:"#008080",darkorchid:"#9932cc",deepskyblue:"#00bfff",salmon:"#fa8072",darkred:"#8b0000",steelblue:"#4682b4",palevioletred:"#db7093",lightslategray:"#778899",aliceblue:"#f0f8ff",lightslategrey:"#778899",lightgreen:"#90ee90",orchid:"#da70d6",gainsboro:"#dcdcdc",mediumseagreen:"#3cb371",lightgray:"#d3d3d3",mediumturquoise:"#48d1cc",lemonchiffon:"#fffacd",cadetblue:"#5f9ea0",lightyellow:"#ffffe0",lavenderblush:"#fff0f5",coral:"#ff7f50",purple:"#800080",aqua:"#00ffff",whitesmoke:"#f5f5f5",mediumslateblue:"#7b68ee",darkorange:"#ff8c00",mediumaquamarine:"#66cdaa",darksalmon:"#e9967a",beige:"#f5f5dc",blueviolet:"#8a2be2",azure:"#f0ffff",lightsteelblue:"#b0c4de",oldlace:"#fdf5e6"},K=function(){var a,b,c,d,e;for(a={},e="Boolean Number String Function Array Date RegExp Undefined Null".split(" "),d=0,b=e.length;b>d;d++)c=e[d],a["[object "+c+"]"]=c.toLowerCase();return function(b){var c;return c=Object.prototype.toString.call(b),a[c]||"object"}}(),x=function(a,b,c){return null==b&&(b=0),null==c&&(c=1),b>a&&(a=b),a>c&&(a=c),a},L=function(a){return a.length>=3?a:a[0]},d=2*Math.PI,c=Math.PI/3,m=Math.cos,h=function(a){var b,c,d,e,f,g,i,k,l,m,n;return a=function(){var b,c,d;for(d=[],c=0,b=a.length;b>c;c++)e=a[c],d.push(j(e));return d}(),2===a.length?(l=function(){var b,c,d;for(d=[],c=0,b=a.length;b>c;c++)e=a[c],d.push(e.lab());return d}(),f=l[0],g=l[1],b=function(a){var b,c;return c=function(){var c,d;for(d=[],b=c=0;2>=c;b=++c)d.push(f[b]+a*(g[b]-f[b]));return d}(),j.lab.apply(j,c)}):3===a.length?(m=function(){var b,c,d;for(d=[],c=0,b=a.length;b>c;c++)e=a[c],d.push(e.lab());return d}(),f=m[0],g=m[1],i=m[2],b=function(a){var b,c;return c=function(){var c,d;for(d=[],b=c=0;2>=c;b=++c)d.push((1-a)*(1-a)*f[b]+2*(1-a)*a*g[b]+a*a*i[b]);return d}(),j.lab.apply(j,c)}):4===a.length?(n=function(){var b,c,d;for(d=[],c=0,b=a.length;b>c;c++)e=a[c],d.push(e.lab());return d}(),f=n[0],g=n[1],i=n[2],k=n[3],b=function(a){var b,c;return c=function(){var c,d;for(d=[],b=c=0;2>=c;b=++c)d.push((1-a)*(1-a)*(1-a)*f[b]+3*(1-a)*(1-a)*a*g[b]+3*(1-a)*a*a*i[b]+a*a*a*k[b]);return d}(),j.lab.apply(j,c)}):5===a.length&&(c=h(a.slice(0,3)),d=h(a.slice(2,5)),b=function(a){return.5>a?c(2*a):d(2*(a-.5))}),b},j.interpolate.bezier=h}).call(this);
/*eslint-disable */



define('hftctrl/files',[], function() {
 return {
  "controller.html": "    <!-- this is inserted into index.html by happyfuntimes -->\n    <div id=\"gamearea\" class=\"fixheight\">\n      <div id=\"buttons\" class=\"layout-default hft-fullcenter fixheight\">\n          <div id=\"dpads\">\n              <div class=\"button\" id=\"dpad1\"></div>\n              <div class=\"button\" id=\"dpad2\"></div>\n          </div>\n          <div class=\"button\" id=\"buttonA\"></div>\n          <div class=\"button\" id=\"buttonB\"></div>\n      </div>\n    </div>\n\n<!-- we will look this up at runtime and insert it into the buttons. -->\n    <script id=\"button-img\" type=\"not-js\">\n<svg class=\"button-img\" width=\"100%\" height=\"100%\" viewBox=\"0 0 20 20\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" xml:space=\"preserve\" style=\"fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:1.41421;\">\n    <g id=\"Layer1\">\n        <path d=\"M15,19L15,20L5,20L5,19L3,19L3,18L2,18L2,17L1,17L1,15L0,15L0,5L1,5L1,3L2,3L2,2L3,2L3,1L5,1L5,0L15,0L15,1L17,1L17,2L18,2L18,3L19,3L19,5L20,5L20,15L19,15L19,17L18,17L18,18L17,18L17,19L15,19Z\" style=\"fill:%(surfaceColor)s;\"/>\n        <path d=\"M15,19L15,20L5,20L5,19L3,19L3,18L2,18L2,17L1,17L1,15L0,15L0,12L1,12L1,14L2,14L2,15L3,15L3,16L5,16L5,17L15,17L15,16L17,16L17,15L18,15L18,14L19,14L19,12L20,12L20,15L19,15L19,17L18,17L18,18L17,18L17,19L15,19Z\" style=\"fill:%(edgeColor)s;\"/>\n    </g>\n</svg>\n    </script>\n\n    <script id=\"button-pressed\" type=\"not-js\">\n<svg class=\"button-pressed\" width=\"100%\" height=\"100%\" viewBox=\"0 0 20 20\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" xml:space=\"preserve\" style=\"fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:1.41421;\">\n    <g id=\"Layer1\">\n        <path d=\"M15,19L15,20L5,20L5,19L3,19L3,18L2,18L2,17L1,17L1,15L0,15L0,7L1,7L1,5L2,5L2,4L3,4L3,3L5,3L5,2L15,2L15,3L17,3L17,4L18,4L18,5L19,5L19,7L20,7L20,15L19,15L19,17L18,17L18,18L17,18L17,19L15,19Z\" style=\"fill:%(surfaceColor)s;\"/>\n        <path d=\"M15,19L15,20L5,20L5,19L3,19L3,18L2,18L2,17L1,17L1,15L0,15L0,14L1,14L1,16L2,16L2,17L3,17L3,18L5,18L5,19L15,19L15,18L17,18L17,17L18,17L18,16L19,16L19,14L20,14L20,15L19,15L19,17L18,17L18,18L17,18L17,19L15,19Z\" style=\"fill:%(edgeColor)s;\"/>\n    </g>\n</svg>\n    </script>\n\n    <script id=\"dpad-image\" type=\"not-js\">\n<svg width=\"100%\" height=\"100%\" viewBox=\"0 0 39 39\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" xml:space=\"preserve\" style=\"fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:1.41421;\">\n    <g id=\"Layer1\">\n        <path d=\"M26,24L26,36L13,36L13,24L0,24L0,12L13,12L13,0L26,0L26,12L39,12L39,24L26,24Z\" style=\"fill:rgb(172,172,172);\"/>\n        <path d=\"M26,36L13,36L13,39L26,39L26,36ZM13,24L3.55271e-15,24L3.55271e-15,27L13,27L13,24ZM39,24L26,24L26,27L39,27L39,24Z\" style=\"fill:rgb(79,79,79);\"/>\n    </g>\n</svg>\n    </script>\n\n    <script id=\"background-style\" type=\"not-js\">\nlinear-gradient(\n  to bottom,\n  %(dark)s,\n  %(dark)s  10%,\n  %(light)s 10%,\n  %(light)s 12%,\n  %(dark)s  12%,\n  %(dark)s  14%,\n  %(light)s 14%,\n  %(light)s 86%,\n  %(dark)s  86%,\n  %(dark)s  88%,\n  %(light)s 88%,\n  %(light)s 90%,\n  %(dark)s  90%,\n  %(dark)s\n)\n    </script>\n",
  "3rdparty/chroma.min.js": "/*\nchroma.js - JavaScript library for color conversions\n\nCopyright (c) 2011-2013, Gregor Aisch\nAll rights reserved.\n\nRedistribution and use in source and binary forms, with or without\nmodification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this\n   list of conditions and the following disclaimer.\n\n2. Redistributions in binary form must reproduce the above copyright notice,\n   this list of conditions and the following disclaimer in the documentation\n   and/or other materials provided with the distribution.\n\n3. The name Gregor Aisch may not be used to endorse or promote products\n   derived from this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\"\nAND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\nIMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE\nDISCLAIMED. IN NO EVENT SHALL GREGOR AISCH OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,\nINDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,\nBUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,\nDATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY\nOF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING\nNEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,\nEVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n\n*/\n(function(){var a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B,C,D,E,F,G,H,I,J,K,L,M,N;j=function(b,c,d,e){return new a(b,c,d,e)},\"undefined\"!=typeof module&&null!==module&&null!=module.exports&&(module.exports=j),\"function\"==typeof define&&define.amd?define([],function(){return j}):(J=\"undefined\"!=typeof exports&&null!==exports?exports:this,J.chroma=j),j.color=function(b,c,d,e){return new a(b,c,d,e)},j.hsl=function(b,c,d,e){return new a(b,c,d,e,\"hsl\")},j.hsv=function(b,c,d,e){return new a(b,c,d,e,\"hsv\")},j.rgb=function(b,c,d,e){return new a(b,c,d,e,\"rgb\")},j.hex=function(b){return new a(b)},j.css=function(b){return new a(b)},j.lab=function(b,c,d){return new a(b,c,d,\"lab\")},j.lch=function(b,c,d){return new a(b,c,d,\"lch\")},j.hsi=function(b,c,d){return new a(b,c,d,\"hsi\")},j.gl=function(b,c,d,e){return new a(b,c,d,e,\"gl\")},j.num=function(b){return new a(b,\"num\")},j.random=function(){var b,c,d,e;for(c=\"0123456789abcdef\",b=\"#\",d=e=0;6>e;d=++e)b+=c.charAt(Math.floor(16*Math.random()));return new a(b)},j.interpolate=function(b,c,d,e){var f,g;return null==b||null==c?\"#000\":((\"string\"===(f=K(b))||\"number\"===f)&&(b=new a(b)),(\"string\"===(g=K(c))||\"number\"===g)&&(c=new a(c)),b.interpolate(d,c,e))},j.mix=j.interpolate,j.contrast=function(b,c){var d,e,f,g;return(\"string\"===(f=K(b))||\"number\"===f)&&(b=new a(b)),(\"string\"===(g=K(c))||\"number\"===g)&&(c=new a(c)),d=b.luminance(),e=c.luminance(),d>e?(d+.05)/(e+.05):(e+.05)/(d+.05)},j.luminance=function(a){return j(a).luminance()},j._Color=a,a=function(){function a(){var a,b,c,d,e,f,g,h,i,j,l,m,n,s,u,v;for(f=this,c=[],h=0,d=arguments.length;d>h;h++)b=arguments[h],null!=b&&c.push(b);if(0===c.length)i=[255,0,255,1,\"rgb\"],s=i[0],u=i[1],v=i[2],a=i[3],e=i[4];else if(\"array\"===K(c[0])){if(3===c[0].length)j=c[0],s=j[0],u=j[1],v=j[2],a=1;else{if(4!==c[0].length)throw\"unknown input argument\";l=c[0],s=l[0],u=l[1],v=l[2],a=l[3]}e=null!=(m=c[1])?m:\"rgb\"}else\"string\"===K(c[0])?(s=c[0],e=\"hex\"):\"object\"===K(c[0])?(n=c[0]._rgb,s=n[0],u=n[1],v=n[2],a=n[3],e=\"rgb\"):c.length<=2&&\"number\"===K(c[0])?(s=c[0],e=\"num\"):c.length>=3&&(s=c[0],u=c[1],v=c[2]);3===c.length?(e=\"rgb\",a=1):4===c.length?\"string\"===K(c[3])?(e=c[3],a=1):\"number\"===K(c[3])&&(e=\"rgb\",a=c[3]):5===c.length&&(a=c[3],e=c[4]),null==a&&(a=1),\"rgb\"===e?f._rgb=[s,u,v,a]:\"gl\"===e?f._rgb=[255*s,255*u,255*v,a]:\"hsl\"===e?(f._rgb=q(s,u,v),f._rgb[3]=a):\"hsv\"===e?(f._rgb=r(s,u,v),f._rgb[3]=a):\"hex\"===e?f._rgb=o(s):\"lab\"===e?(f._rgb=t(s,u,v),f._rgb[3]=a):\"lch\"===e?(f._rgb=w(s,u,v),f._rgb[3]=a):\"hsi\"===e?(f._rgb=p(s,u,v),f._rgb[3]=a):\"num\"===e&&(f._rgb=A(s)),g=k(f._rgb)}return a.prototype.rgb=function(){return this._rgb.slice(0,3)},a.prototype.rgba=function(){return this._rgb},a.prototype.hex=function(){return B(this._rgb)},a.prototype.toString=function(){return this.name()},a.prototype.hsl=function(){return D(this._rgb)},a.prototype.hsv=function(){return E(this._rgb)},a.prototype.lab=function(){return F(this._rgb)},a.prototype.lch=function(){return G(this._rgb)},a.prototype.hsi=function(){return C(this._rgb)},a.prototype.gl=function(){return[this._rgb[0]/255,this._rgb[1]/255,this._rgb[2]/255,this._rgb[3]]},a.prototype.num=function(){return H(this._rgb)},a.prototype.luminance=function(b,c){var d,e,f,g;return null==c&&(c=\"rgb\"),arguments.length?(0===b&&(this._rgb=[0,0,0,this._rgb[3]]),1===b&&(this._rgb=[255,255,255,this._rgb[3]]),d=y(this._rgb),e=1e-7,f=20,g=function(a,d){var h,i;return i=a.interpolate(.5,d,c),h=i.luminance(),Math.abs(b-h)<e||!f--?i:h>b?g(a,i):g(i,d)},this._rgb=(d>b?g(new a(\"black\"),this):g(this,new a(\"white\"))).rgba(),this):y(this._rgb)},a.prototype.name=function(){var a,b;a=this.hex();for(b in j.colors)if(a===j.colors[b])return b;return a},a.prototype.alpha=function(a){return arguments.length?(this._rgb[3]=a,this):this._rgb[3]},a.prototype.css=function(a){var b,c,d,e;return null==a&&(a=\"rgb\"),c=this,d=c._rgb,3===a.length&&d[3]<1&&(a+=\"a\"),\"rgb\"===a?a+\"(\"+d.slice(0,3).map(Math.round).join(\",\")+\")\":\"rgba\"===a?a+\"(\"+d.slice(0,3).map(Math.round).join(\",\")+\",\"+d[3]+\")\":\"hsl\"===a||\"hsla\"===a?(b=c.hsl(),e=function(a){return Math.round(100*a)/100},b[0]=e(b[0]),b[1]=e(100*b[1])+\"%\",b[2]=e(100*b[2])+\"%\",4===a.length&&(b[3]=d[3]),a+\"(\"+b.join(\",\")+\")\"):void 0},a.prototype.interpolate=function(b,c,d){var e,f,g,h,i,j,k,l,m,n,o,p,q,r;if(l=this,null==d&&(d=\"rgb\"),\"string\"===K(c)&&(c=new a(c)),\"hsl\"===d||\"hsv\"===d||\"lch\"===d||\"hsi\"===d)\"hsl\"===d?(q=l.hsl(),r=c.hsl()):\"hsv\"===d?(q=l.hsv(),r=c.hsv()):\"hsi\"===d?(q=l.hsi(),r=c.hsi()):\"lch\"===d&&(q=l.lch(),r=c.lch()),\"h\"===d.substr(0,1)?(g=q[0],o=q[1],j=q[2],h=r[0],p=r[1],k=r[2]):(j=q[0],o=q[1],g=q[2],k=r[0],p=r[1],h=r[2]),isNaN(g)||isNaN(h)?isNaN(g)?isNaN(h)?f=Number.NaN:(f=h,1!==j&&0!==j||\"hsv\"===d||(n=p)):(f=g,1!==k&&0!==k||\"hsv\"===d||(n=o)):(e=h>g&&h-g>180?h-(g+360):g>h&&g-h>180?h+360-g:h-g,f=g+b*e),null==n&&(n=o+b*(p-o)),i=j+b*(k-j),m=\"h\"===d.substr(0,1)?new a(f,n,i,d):new a(i,n,f,d);else if(\"rgb\"===d)q=l._rgb,r=c._rgb,m=new a(q[0]+b*(r[0]-q[0]),q[1]+b*(r[1]-q[1]),q[2]+b*(r[2]-q[2]),d);else if(\"num\"===d)c instanceof a||(c=new a(c,d)),q=l._rgb,r=c._rgb,m=new a((q[0]+b*(r[0]-q[0])<<16)+(q[1]+b*(r[1]-q[1])<<8)+(q[2]+b*(r[2]-q[2])&255),d);else{if(\"lab\"!==d)throw\"color mode \"+d+\" is not supported\";q=l.lab(),r=c.lab(),m=new a(q[0]+b*(r[0]-q[0]),q[1]+b*(r[1]-q[1]),q[2]+b*(r[2]-q[2]),d)}return m.alpha(l.alpha()+b*(c.alpha()-l.alpha())),m},a.prototype.premultiply=function(){var a,b;return b=this.rgb(),a=this.alpha(),j(b[0]*a,b[1]*a,b[2]*a,a)},a.prototype.darken=function(a){var b,c;return null==a&&(a=20),c=this,b=c.lch(),b[0]-=a,j.lch(b).alpha(c.alpha())},a.prototype.darker=function(a){return this.darken(a)},a.prototype.brighten=function(a){return null==a&&(a=20),this.darken(-a)},a.prototype.brighter=function(a){return this.brighten(a)},a.prototype.saturate=function(a){var b,c;return null==a&&(a=20),c=this,b=c.lch(),b[1]+=a,j.lch(b).alpha(c.alpha())},a.prototype.desaturate=function(a){return null==a&&(a=20),this.saturate(-a)},a}(),k=function(a){var b;for(b in a)3>b?(a[b]<0&&(a[b]=0),a[b]>255&&(a[b]=255)):3===b&&(a[b]<0&&(a[b]=0),a[b]>1&&(a[b]=1));return a},n=function(a){var b,c,d,e,f,g,h,i;if(a=a.toLowerCase(),null!=j.colors&&j.colors[a])return o(j.colors[a]);if(f=a.match(/rgb\\(\\s*(\\-?\\d+),\\s*(\\-?\\d+)\\s*,\\s*(\\-?\\d+)\\s*\\)/)){for(h=f.slice(1,4),e=g=0;2>=g;e=++g)h[e]=+h[e];h[3]=1}else if(f=a.match(/rgba\\(\\s*(\\-?\\d+),\\s*(\\-?\\d+)\\s*,\\s*(\\-?\\d+)\\s*,\\s*([01]|[01]?\\.\\d+)\\)/))for(h=f.slice(1,5),e=i=0;3>=i;e=++i)h[e]=+h[e];else if(f=a.match(/rgb\\(\\s*(\\-?\\d+(?:\\.\\d+)?)%,\\s*(\\-?\\d+(?:\\.\\d+)?)%\\s*,\\s*(\\-?\\d+(?:\\.\\d+)?)%\\s*\\)/)){for(h=f.slice(1,4),e=b=0;2>=b;e=++b)h[e]=Math.round(2.55*h[e]);h[3]=1}else if(f=a.match(/rgba\\(\\s*(\\-?\\d+(?:\\.\\d+)?)%,\\s*(\\-?\\d+(?:\\.\\d+)?)%\\s*,\\s*(\\-?\\d+(?:\\.\\d+)?)%\\s*,\\s*([01]|[01]?\\.\\d+)\\)/)){for(h=f.slice(1,5),e=c=0;2>=c;e=++c)h[e]=Math.round(2.55*h[e]);h[3]=+h[3]}else(f=a.match(/hsl\\(\\s*(\\-?\\d+(?:\\.\\d+)?),\\s*(\\-?\\d+(?:\\.\\d+)?)%\\s*,\\s*(\\-?\\d+(?:\\.\\d+)?)%\\s*\\)/))?(d=f.slice(1,4),d[1]*=.01,d[2]*=.01,h=q(d),h[3]=1):(f=a.match(/hsla\\(\\s*(\\-?\\d+(?:\\.\\d+)?),\\s*(\\-?\\d+(?:\\.\\d+)?)%\\s*,\\s*(\\-?\\d+(?:\\.\\d+)?)%\\s*,\\s*([01]|[01]?\\.\\d+)\\)/))&&(d=f.slice(1,4),d[1]*=.01,d[2]*=.01,h=q(d),h[3]=+f[4]);return h},o=function(a){var b,c,d,e,f,g;if(a.match(/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/))return(4===a.length||7===a.length)&&(a=a.substr(1)),3===a.length&&(a=a.split(\"\"),a=a[0]+a[0]+a[1]+a[1]+a[2]+a[2]),g=parseInt(a,16),e=g>>16,d=g>>8&255,c=255&g,[e,d,c,1];if(a.match(/^#?([A-Fa-f0-9]{8})$/))return 9===a.length&&(a=a.substr(1)),g=parseInt(a,16),e=g>>24&255,d=g>>16&255,c=g>>8&255,b=255&g,[e,d,c,b];if(f=n(a))return f;throw\"unknown color: \"+a},p=function(a,b,e){var f,g,h,i;return i=L(arguments),a=i[0],b=i[1],e=i[2],a/=360,1/3>a?(f=(1-b)/3,h=(1+b*m(d*a)/m(c-d*a))/3,g=1-(f+h)):2/3>a?(a-=1/3,h=(1-b)/3,g=(1+b*m(d*a)/m(c-d*a))/3,f=1-(h+g)):(a-=2/3,g=(1-b)/3,f=(1+b*m(d*a)/m(c-d*a))/3,h=1-(g+f)),h=x(e*h*3),g=x(e*g*3),f=x(e*f*3),[255*h,255*g,255*f]},q=function(){var a,b,c,d,e,f,g,h,i,j,k,l,m,n;if(i=L(arguments),d=i[0],k=i[1],f=i[2],0===k)h=c=a=255*f;else{for(n=[0,0,0],b=[0,0,0],m=.5>f?f*(1+k):f+k-f*k,l=2*f-m,d/=360,n[0]=d+1/3,n[1]=d,n[2]=d-1/3,e=g=0;2>=g;e=++g)n[e]<0&&(n[e]+=1),n[e]>1&&(n[e]-=1),6*n[e]<1?b[e]=l+6*(m-l)*n[e]:2*n[e]<1?b[e]=m:3*n[e]<2?b[e]=l+(m-l)*(2/3-n[e])*6:b[e]=l;j=[Math.round(255*b[0]),Math.round(255*b[1]),Math.round(255*b[2])],h=j[0],c=j[1],a=j[2]}return[h,c,a]},r=function(){var a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r;if(i=L(arguments),d=i[0],p=i[1],r=i[2],r*=255,0===p)h=c=a=r;else switch(360===d&&(d=0),d>360&&(d-=360),0>d&&(d+=360),d/=60,e=Math.floor(d),b=d-e,f=r*(1-p),g=r*(1-p*b),q=r*(1-p*(1-b)),e){case 0:j=[r,q,f],h=j[0],c=j[1],a=j[2];break;case 1:k=[g,r,f],h=k[0],c=k[1],a=k[2];break;case 2:l=[f,r,q],h=l[0],c=l[1],a=l[2];break;case 3:m=[f,g,r],h=m[0],c=m[1],a=m[2];break;case 4:n=[q,f,r],h=n[0],c=n[1],a=n[2];break;case 5:o=[r,f,g],h=o[0],c=o[1],a=o[2]}return h=Math.round(h),c=Math.round(c),a=Math.round(a),[h,c,a]},b=18,e=.95047,f=1,g=1.08883,s=function(){var a,b,c,d,e,f;return f=L(arguments),e=f[0],a=f[1],b=f[2],c=Math.sqrt(a*a+b*b),d=(Math.atan2(b,a)/Math.PI*180+360)%360,[e,c,d]},t=function(a,b,c){var d,h,i,j,k,l,m;return void 0!==a&&3===a.length&&(i=a,a=i[0],b=i[1],c=i[2]),void 0!==a&&3===a.length&&(j=a,a=j[0],b=j[1],c=j[2]),l=(a+16)/116,k=l+b/500,m=l-c/200,k=u(k)*e,l=u(l)*f,m=u(m)*g,h=N(3.2404542*k-1.5371385*l-.4985314*m),d=N(-.969266*k+1.8760108*l+.041556*m),c=N(.0556434*k-.2040259*l+1.0572252*m),[x(h,0,255),x(d,0,255),x(c,0,255),1]},u=function(a){return a>.206893034?a*a*a:(a-4/29)/7.787037},N=function(a){return Math.round(255*(.00304>=a?12.92*a:1.055*Math.pow(a,1/2.4)-.055))},v=function(){var a,b,c,d;return d=L(arguments),c=d[0],a=d[1],b=d[2],b=b*Math.PI/180,[c,Math.cos(b)*a,Math.sin(b)*a]},w=function(a,b,c){var d,e,f,g,h,i,j;return i=v(a,b,c),d=i[0],e=i[1],f=i[2],j=t(d,e,f),h=j[0],g=j[1],f=j[2],[x(h,0,255),x(g,0,255),x(f,0,255)]},y=function(a,b,c){var d;return d=L(arguments),a=d[0],b=d[1],c=d[2],a=z(a),b=z(b),c=z(c),.2126*a+.7152*b+.0722*c},z=function(a){return a/=255,.03928>=a?a/12.92:Math.pow((a+.055)/1.055,2.4)},A=function(a){var b,c,d;if(\"number\"===K(a)&&a>=0&&16777215>=a)return d=a>>16,c=a>>8&255,b=255&a,[d,c,b,1];throw\"unknown num color: \"+a},B=function(){var a,b,c,d,e,f;return d=L(arguments),c=d[0],b=d[1],a=d[2],f=c<<16|b<<8|a,e=\"000000\"+f.toString(16),\"#\"+e.substr(e.length-6)},C=function(){var a,b,c,d,e,f,g,h,i;return h=L(arguments),g=h[0],c=h[1],b=h[2],a=2*Math.PI,g/=255,c/=255,b/=255,f=Math.min(g,c,b),e=(g+c+b)/3,i=1-f/e,0===i?d=0:(d=(g-c+(g-b))/2,d/=Math.sqrt((g-c)*(g-c)+(g-b)*(c-b)),d=Math.acos(d),b>c&&(d=a-d),d/=a),[360*d,i,e]},D=function(a,b,c){var d,e,f,g,h,i;return void 0!==a&&a.length>=3&&(h=a,a=h[0],b=h[1],c=h[2]),a/=255,b/=255,c/=255,g=Math.min(a,b,c),f=Math.max(a,b,c),e=(f+g)/2,f===g?(i=0,d=Number.NaN):i=.5>e?(f-g)/(f+g):(f-g)/(2-f-g),a===f?d=(b-c)/(f-g):b===f?d=2+(c-a)/(f-g):c===f&&(d=4+(a-b)/(f-g)),d*=60,0>d&&(d+=360),[d,i,e]},E=function(){var a,b,c,d,e,f,g,h,i,j;return h=L(arguments),g=h[0],c=h[1],a=h[2],f=Math.min(g,c,a),e=Math.max(g,c,a),b=e-f,j=e/255,0===e?(d=Number.NaN,i=0):(i=b/e,g===e&&(d=(c-a)/b),c===e&&(d=2+(a-g)/b),a===e&&(d=4+(g-c)/b),d*=60,0>d&&(d+=360)),[d,i,j]},F=function(){var a,b,c,d,h,i,j;return d=L(arguments),c=d[0],b=d[1],a=d[2],c=I(c),b=I(b),a=I(a),h=M((.4124564*c+.3575761*b+.1804375*a)/e),i=M((.2126729*c+.7151522*b+.072175*a)/f),j=M((.0193339*c+.119192*b+.9503041*a)/g),[116*i-16,500*(h-i),200*(i-j)]},I=function(a){return(a/=255)<=.04045?a/12.92:Math.pow((a+.055)/1.055,2.4)},M=function(a){return a>.008856?Math.pow(a,1/3):7.787037*a+4/29},G=function(){var a,b,c,d,e,f,g;return f=L(arguments),e=f[0],c=f[1],b=f[2],g=F(e,c,b),d=g[0],a=g[1],b=g[2],s(d,a,b)},H=function(){var a,b,c,d;return d=L(arguments),c=d[0],b=d[1],a=d[2],(c<<16)+(b<<8)+a},j.scale=function(a,b){var c,d,e,f,g,h,i,k,l,m,n,o,p,q,r,s,t,u,v,w,x;return k=\"rgb\",l=j(\"#ccc\"),p=0,g=!1,f=[0,1],d=[],n=!1,o=[],i=0,h=1,e=!1,m=0,c={},v=function(a,b){var c,e,f,g,h,i,k;if(null==a&&(a=[\"#ddd\",\"#222\"]),null!=a&&\"string\"===K(a)&&null!=(null!=(g=j.brewer)?g[a]:void 0)&&(a=j.brewer[a]),\"array\"===K(a)){for(a=a.slice(0),c=f=0,h=a.length-1;h>=0?h>=f:f>=h;c=h>=0?++f:--f)e=a[c],\"string\"===K(e)&&(a[c]=j(e));if(null!=b)o=b;else for(o=[],c=k=0,i=a.length-1;i>=0?i>=k:k>=i;c=i>=0?++k:--k)o.push(c/(a.length-1))}return u(),d=a},w=function(a){return null==a&&(a=[]),f=a,i=a[0],h=a[a.length-1],u(),m=2===a.length?0:a.length-1},s=function(a){var b,c;if(null!=f){for(c=f.length-1,b=0;c>b&&a>=f[b];)b++;return b-1}return 0},x=function(a){return a},q=function(a){var b,c,d,e,g;return g=a,f.length>2&&(e=f.length-1,b=s(a),d=f[0]+(f[1]-f[0])*(0+.5*p),c=f[e-1]+(f[e]-f[e-1])*(1-.5*p),g=i+(f[b]+.5*(f[b+1]-f[b])-d)/(c-d)*(h-i)),g},t=function(a,b){var e,g,n,p,q,r,t,u,v;if(null==b&&(b=!1),isNaN(a))return l;if(b?v=a:f.length>2?(e=s(a),v=e/(m-1)):(v=n=i!==h?(a-i)/(h-i):0,v=n=(a-i)/(h-i),v=Math.min(1,Math.max(0,v))),b||(v=x(v)),q=Math.floor(1e4*v),c[q])g=c[q];else{if(\"array\"===K(d))for(p=r=0,u=o.length-1;u>=0?u>=r:r>=u;p=u>=0?++r:--r){if(t=o[p],t>=v){g=d[p];break}if(v>=t&&p===o.length-1){g=d[p];break}if(v>t&&v<o[p+1]){v=(v-t)/(o[p+1]-t),g=j.interpolate(d[p],d[p+1],v,k);break}}else\"function\"===K(d)&&(g=d(v));c[q]=g}return g},u=function(){return c={}},v(a,b),r=function(a){var b;return b=t(a),n&&b[n]?b[n]():b},r.domain=function(a,b,c,d){var e;return null==c&&(c=\"e\"),arguments.length?(null!=b&&(e=j.analyze(a,d),a=0===b?[e.min,e.max]:j.limits(e,c,b)),w(a),r):f},r.mode=function(a){return arguments.length?(k=a,u(),r):k},r.range=function(a,b){return v(a,b),r},r.out=function(a){return n=a,r},r.spread=function(a){return arguments.length?(p=a,r):p},r.correctLightness=function(a){return arguments.length?(e=a,u(),x=e?function(a){var b,c,d,e,f,g,h,i,j;for(b=t(0,!0).lab()[0],c=t(1,!0).lab()[0],h=b>c,d=t(a,!0).lab()[0],f=b+(c-b)*a,e=d-f,i=0,j=1,g=20;Math.abs(e)>.01&&g-->0;)!function(){return h&&(e*=-1),0>e?(i=a,a+=.5*(j-a)):(j=a,a+=.5*(i-a)),d=t(a,!0).lab()[0],e=d-f}();return a}:function(a){return a},r):e},r.colors=function(b){var c,d,e,g,h,i;if(null==b&&(b=\"hex\"),a=[],h=[],f.length>2)for(c=e=1,g=f.length;g>=1?g>e:e>g;c=g>=1?++e:--e)h.push(.5*(f[c-1]+f[c]));else h=f;for(i=0,d=h.length;d>i;i++)c=h[i],a.push(r(c)[b]());return a},r},null==j.scales&&(j.scales={}),j.scales.cool=function(){return j.scale([j.hsl(180,1,.9),j.hsl(250,.7,.4)])},j.scales.hot=function(){return j.scale([\"#000\",\"#f00\",\"#ff0\",\"#fff\"],[0,.25,.75,1]).mode(\"rgb\")},j.analyze=function(a,b,c){var d,e,f,g,h,i,k;if(h={min:Number.MAX_VALUE,max:-1*Number.MAX_VALUE,sum:0,values:[],count:0},null==c&&(c=function(){return!0}),d=function(a){null==a||isNaN(a)||(h.values.push(a),h.sum+=a,a<h.min&&(h.min=a),a>h.max&&(h.max=a),h.count+=1)},k=function(a,e){return c(a,e)?d(null!=b&&\"function\"===K(b)?b(a):null!=b&&\"string\"===K(b)||\"number\"===K(b)?a[b]:a):void 0},\"array\"===K(a))for(g=0,f=a.length;f>g;g++)i=a[g],k(i);else for(e in a)i=a[e],k(i,e);return h.domain=[h.min,h.max],h.limits=function(a,b){return j.limits(h,a,b)},h},j.limits=function(a,b,c){var d,e,f,g,h,i,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B,C,D,E,F,G,H,I,J,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,$,_,aa,ba,ca,da,ea,fa,ga;if(null==b&&(b=\"equal\"),null==c&&(c=7),\"array\"===K(a)&&(a=j.analyze(a)),D=a.min,B=a.max,ca=a.sum,fa=a.values.sort(function(a,b){return a-b}),A=[],\"c\"===b.substr(0,1)&&(A.push(D),A.push(B)),\"e\"===b.substr(0,1)){for(A.push(D),x=J=1,O=c-1;O>=1?O>=J:J>=O;x=O>=1?++J:--J)A.push(D+x/c*(B-D));A.push(B)}else if(\"l\"===b.substr(0,1)){if(0>=D)throw\"Logarithmic scales are only possible for values > 0\";for(E=Math.LOG10E*Math.log(D),C=Math.LOG10E*Math.log(B),A.push(D),x=ga=1,P=c-1;P>=1?P>=ga:ga>=P;x=P>=1?++ga:--ga)A.push(Math.pow(10,E+x/c*(C-E)));A.push(B)}else if(\"q\"===b.substr(0,1)){for(A.push(D),x=d=1,V=c-1;V>=1?V>=d:d>=V;x=V>=1?++d:--d)L=fa.length*x/c,M=Math.floor(L),M===L?A.push(fa[M]):(N=L-M,A.push(fa[M]*N+fa[M+1]*(1-N)));A.push(B)}else if(\"k\"===b.substr(0,1)){for(G=fa.length,r=new Array(G),v=new Array(c),ba=!0,H=0,t=null,t=[],t.push(D),x=e=1,W=c-1;W>=1?W>=e:e>=W;x=W>=1?++e:--e)t.push(D+x/c*(B-D));for(t.push(B);ba;){for(y=f=0,X=c-1;X>=0?X>=f:f>=X;y=X>=0?++f:--f)v[y]=0;for(x=g=0,Y=G-1;Y>=0?Y>=g:g>=Y;x=Y>=0?++g:--g){for(ea=fa[x],F=Number.MAX_VALUE,y=h=0,Z=c-1;Z>=0?Z>=h:h>=Z;y=Z>=0?++h:--h)w=Math.abs(t[y]-ea),F>w&&(F=w,s=y);v[s]++,r[x]=s}for(I=new Array(c),y=i=0,$=c-1;$>=0?$>=i:i>=$;y=$>=0?++i:--i)I[y]=null;for(x=k=0,_=G-1;_>=0?_>=k:k>=_;x=_>=0?++k:--k)u=r[x],null===I[u]?I[u]=fa[x]:I[u]+=fa[x];for(y=l=0,aa=c-1;aa>=0?aa>=l:l>=aa;y=aa>=0?++l:--l)I[y]*=1/v[y];for(ba=!1,y=m=0,Q=c-1;Q>=0?Q>=m:m>=Q;y=Q>=0?++m:--m)if(I[y]!==t[x]){ba=!0;break}t=I,H++,H>200&&(ba=!1)}for(z={},y=n=0,R=c-1;R>=0?R>=n:n>=R;y=R>=0?++n:--n)z[y]=[];for(x=o=0,S=G-1;S>=0?S>=o:o>=S;x=S>=0?++o:--o)u=r[x],z[u].push(fa[x]);for(da=[],y=p=0,T=c-1;T>=0?T>=p:p>=T;y=T>=0?++p:--p)da.push(z[y][0]),da.push(z[y][z[y].length-1]);for(da=da.sort(function(a,b){return a-b}),A.push(da[0]),x=q=1,U=da.length-1;U>=q;x=q+=2)isNaN(da[x])||A.push(da[x])}return A},j.brewer=i={OrRd:[\"#fff7ec\",\"#fee8c8\",\"#fdd49e\",\"#fdbb84\",\"#fc8d59\",\"#ef6548\",\"#d7301f\",\"#b30000\",\"#7f0000\"],PuBu:[\"#fff7fb\",\"#ece7f2\",\"#d0d1e6\",\"#a6bddb\",\"#74a9cf\",\"#3690c0\",\"#0570b0\",\"#045a8d\",\"#023858\"],BuPu:[\"#f7fcfd\",\"#e0ecf4\",\"#bfd3e6\",\"#9ebcda\",\"#8c96c6\",\"#8c6bb1\",\"#88419d\",\"#810f7c\",\"#4d004b\"],Oranges:[\"#fff5eb\",\"#fee6ce\",\"#fdd0a2\",\"#fdae6b\",\"#fd8d3c\",\"#f16913\",\"#d94801\",\"#a63603\",\"#7f2704\"],BuGn:[\"#f7fcfd\",\"#e5f5f9\",\"#ccece6\",\"#99d8c9\",\"#66c2a4\",\"#41ae76\",\"#238b45\",\"#006d2c\",\"#00441b\"],YlOrBr:[\"#ffffe5\",\"#fff7bc\",\"#fee391\",\"#fec44f\",\"#fe9929\",\"#ec7014\",\"#cc4c02\",\"#993404\",\"#662506\"],YlGn:[\"#ffffe5\",\"#f7fcb9\",\"#d9f0a3\",\"#addd8e\",\"#78c679\",\"#41ab5d\",\"#238443\",\"#006837\",\"#004529\"],Reds:[\"#fff5f0\",\"#fee0d2\",\"#fcbba1\",\"#fc9272\",\"#fb6a4a\",\"#ef3b2c\",\"#cb181d\",\"#a50f15\",\"#67000d\"],RdPu:[\"#fff7f3\",\"#fde0dd\",\"#fcc5c0\",\"#fa9fb5\",\"#f768a1\",\"#dd3497\",\"#ae017e\",\"#7a0177\",\"#49006a\"],Greens:[\"#f7fcf5\",\"#e5f5e0\",\"#c7e9c0\",\"#a1d99b\",\"#74c476\",\"#41ab5d\",\"#238b45\",\"#006d2c\",\"#00441b\"],YlGnBu:[\"#ffffd9\",\"#edf8b1\",\"#c7e9b4\",\"#7fcdbb\",\"#41b6c4\",\"#1d91c0\",\"#225ea8\",\"#253494\",\"#081d58\"],Purples:[\"#fcfbfd\",\"#efedf5\",\"#dadaeb\",\"#bcbddc\",\"#9e9ac8\",\"#807dba\",\"#6a51a3\",\"#54278f\",\"#3f007d\"],GnBu:[\"#f7fcf0\",\"#e0f3db\",\"#ccebc5\",\"#a8ddb5\",\"#7bccc4\",\"#4eb3d3\",\"#2b8cbe\",\"#0868ac\",\"#084081\"],Greys:[\"#ffffff\",\"#f0f0f0\",\"#d9d9d9\",\"#bdbdbd\",\"#969696\",\"#737373\",\"#525252\",\"#252525\",\"#000000\"],YlOrRd:[\"#ffffcc\",\"#ffeda0\",\"#fed976\",\"#feb24c\",\"#fd8d3c\",\"#fc4e2a\",\"#e31a1c\",\"#bd0026\",\"#800026\"],PuRd:[\"#f7f4f9\",\"#e7e1ef\",\"#d4b9da\",\"#c994c7\",\"#df65b0\",\"#e7298a\",\"#ce1256\",\"#980043\",\"#67001f\"],Blues:[\"#f7fbff\",\"#deebf7\",\"#c6dbef\",\"#9ecae1\",\"#6baed6\",\"#4292c6\",\"#2171b5\",\"#08519c\",\"#08306b\"],PuBuGn:[\"#fff7fb\",\"#ece2f0\",\"#d0d1e6\",\"#a6bddb\",\"#67a9cf\",\"#3690c0\",\"#02818a\",\"#016c59\",\"#014636\"],Spectral:[\"#9e0142\",\"#d53e4f\",\"#f46d43\",\"#fdae61\",\"#fee08b\",\"#ffffbf\",\"#e6f598\",\"#abdda4\",\"#66c2a5\",\"#3288bd\",\"#5e4fa2\"],RdYlGn:[\"#a50026\",\"#d73027\",\"#f46d43\",\"#fdae61\",\"#fee08b\",\"#ffffbf\",\"#d9ef8b\",\"#a6d96a\",\"#66bd63\",\"#1a9850\",\"#006837\"],RdBu:[\"#67001f\",\"#b2182b\",\"#d6604d\",\"#f4a582\",\"#fddbc7\",\"#f7f7f7\",\"#d1e5f0\",\"#92c5de\",\"#4393c3\",\"#2166ac\",\"#053061\"],PiYG:[\"#8e0152\",\"#c51b7d\",\"#de77ae\",\"#f1b6da\",\"#fde0ef\",\"#f7f7f7\",\"#e6f5d0\",\"#b8e186\",\"#7fbc41\",\"#4d9221\",\"#276419\"],PRGn:[\"#40004b\",\"#762a83\",\"#9970ab\",\"#c2a5cf\",\"#e7d4e8\",\"#f7f7f7\",\"#d9f0d3\",\"#a6dba0\",\"#5aae61\",\"#1b7837\",\"#00441b\"],RdYlBu:[\"#a50026\",\"#d73027\",\"#f46d43\",\"#fdae61\",\"#fee090\",\"#ffffbf\",\"#e0f3f8\",\"#abd9e9\",\"#74add1\",\"#4575b4\",\"#313695\"],BrBG:[\"#543005\",\"#8c510a\",\"#bf812d\",\"#dfc27d\",\"#f6e8c3\",\"#f5f5f5\",\"#c7eae5\",\"#80cdc1\",\"#35978f\",\"#01665e\",\"#003c30\"],RdGy:[\"#67001f\",\"#b2182b\",\"#d6604d\",\"#f4a582\",\"#fddbc7\",\"#ffffff\",\"#e0e0e0\",\"#bababa\",\"#878787\",\"#4d4d4d\",\"#1a1a1a\"],PuOr:[\"#7f3b08\",\"#b35806\",\"#e08214\",\"#fdb863\",\"#fee0b6\",\"#f7f7f7\",\"#d8daeb\",\"#b2abd2\",\"#8073ac\",\"#542788\",\"#2d004b\"],Set2:[\"#66c2a5\",\"#fc8d62\",\"#8da0cb\",\"#e78ac3\",\"#a6d854\",\"#ffd92f\",\"#e5c494\",\"#b3b3b3\"],Accent:[\"#7fc97f\",\"#beaed4\",\"#fdc086\",\"#ffff99\",\"#386cb0\",\"#f0027f\",\"#bf5b17\",\"#666666\"],Set1:[\"#e41a1c\",\"#377eb8\",\"#4daf4a\",\"#984ea3\",\"#ff7f00\",\"#ffff33\",\"#a65628\",\"#f781bf\",\"#999999\"],Set3:[\"#8dd3c7\",\"#ffffb3\",\"#bebada\",\"#fb8072\",\"#80b1d3\",\"#fdb462\",\"#b3de69\",\"#fccde5\",\"#d9d9d9\",\"#bc80bd\",\"#ccebc5\",\"#ffed6f\"],Dark2:[\"#1b9e77\",\"#d95f02\",\"#7570b3\",\"#e7298a\",\"#66a61e\",\"#e6ab02\",\"#a6761d\",\"#666666\"],Paired:[\"#a6cee3\",\"#1f78b4\",\"#b2df8a\",\"#33a02c\",\"#fb9a99\",\"#e31a1c\",\"#fdbf6f\",\"#ff7f00\",\"#cab2d6\",\"#6a3d9a\",\"#ffff99\",\"#b15928\"],Pastel2:[\"#b3e2cd\",\"#fdcdac\",\"#cbd5e8\",\"#f4cae4\",\"#e6f5c9\",\"#fff2ae\",\"#f1e2cc\",\"#cccccc\"],Pastel1:[\"#fbb4ae\",\"#b3cde3\",\"#ccebc5\",\"#decbe4\",\"#fed9a6\",\"#ffffcc\",\"#e5d8bd\",\"#fddaec\",\"#f2f2f2\"]},j.colors=l={indigo:\"#4b0082\",gold:\"#ffd700\",hotpink:\"#ff69b4\",firebrick:\"#b22222\",indianred:\"#cd5c5c\",yellow:\"#ffff00\",mistyrose:\"#ffe4e1\",darkolivegreen:\"#556b2f\",olive:\"#808000\",darkseagreen:\"#8fbc8f\",pink:\"#ffc0cb\",tomato:\"#ff6347\",lightcoral:\"#f08080\",orangered:\"#ff4500\",navajowhite:\"#ffdead\",lime:\"#00ff00\",palegreen:\"#98fb98\",darkslategrey:\"#2f4f4f\",greenyellow:\"#adff2f\",burlywood:\"#deb887\",seashell:\"#fff5ee\",mediumspringgreen:\"#00fa9a\",fuchsia:\"#ff00ff\",papayawhip:\"#ffefd5\",blanchedalmond:\"#ffebcd\",chartreuse:\"#7fff00\",dimgray:\"#696969\",black:\"#000000\",peachpuff:\"#ffdab9\",springgreen:\"#00ff7f\",aquamarine:\"#7fffd4\",white:\"#ffffff\",orange:\"#ffa500\",lightsalmon:\"#ffa07a\",darkslategray:\"#2f4f4f\",brown:\"#a52a2a\",ivory:\"#fffff0\",dodgerblue:\"#1e90ff\",peru:\"#cd853f\",lawngreen:\"#7cfc00\",chocolate:\"#d2691e\",crimson:\"#dc143c\",forestgreen:\"#228b22\",darkgrey:\"#a9a9a9\",lightseagreen:\"#20b2aa\",cyan:\"#00ffff\",mintcream:\"#f5fffa\",silver:\"#c0c0c0\",antiquewhite:\"#faebd7\",mediumorchid:\"#ba55d3\",skyblue:\"#87ceeb\",gray:\"#808080\",darkturquoise:\"#00ced1\",goldenrod:\"#daa520\",darkgreen:\"#006400\",floralwhite:\"#fffaf0\",darkviolet:\"#9400d3\",darkgray:\"#a9a9a9\",moccasin:\"#ffe4b5\",saddlebrown:\"#8b4513\",grey:\"#808080\",darkslateblue:\"#483d8b\",lightskyblue:\"#87cefa\",lightpink:\"#ffb6c1\",mediumvioletred:\"#c71585\",slategrey:\"#708090\",red:\"#ff0000\",deeppink:\"#ff1493\",limegreen:\"#32cd32\",darkmagenta:\"#8b008b\",palegoldenrod:\"#eee8aa\",plum:\"#dda0dd\",turquoise:\"#40e0d0\",lightgrey:\"#d3d3d3\",lightgoldenrodyellow:\"#fafad2\",darkgoldenrod:\"#b8860b\",lavender:\"#e6e6fa\",maroon:\"#800000\",yellowgreen:\"#9acd32\",sandybrown:\"#f4a460\",thistle:\"#d8bfd8\",violet:\"#ee82ee\",navy:\"#000080\",magenta:\"#ff00ff\",dimgrey:\"#696969\",tan:\"#d2b48c\",rosybrown:\"#bc8f8f\",olivedrab:\"#6b8e23\",blue:\"#0000ff\",lightblue:\"#add8e6\",ghostwhite:\"#f8f8ff\",honeydew:\"#f0fff0\",cornflowerblue:\"#6495ed\",slateblue:\"#6a5acd\",linen:\"#faf0e6\",darkblue:\"#00008b\",powderblue:\"#b0e0e6\",seagreen:\"#2e8b57\",darkkhaki:\"#bdb76b\",snow:\"#fffafa\",sienna:\"#a0522d\",mediumblue:\"#0000cd\",royalblue:\"#4169e1\",lightcyan:\"#e0ffff\",green:\"#008000\",mediumpurple:\"#9370db\",midnightblue:\"#191970\",cornsilk:\"#fff8dc\",paleturquoise:\"#afeeee\",bisque:\"#ffe4c4\",slategray:\"#708090\",darkcyan:\"#008b8b\",khaki:\"#f0e68c\",wheat:\"#f5deb3\",teal:\"#008080\",darkorchid:\"#9932cc\",deepskyblue:\"#00bfff\",salmon:\"#fa8072\",darkred:\"#8b0000\",steelblue:\"#4682b4\",palevioletred:\"#db7093\",lightslategray:\"#778899\",aliceblue:\"#f0f8ff\",lightslategrey:\"#778899\",lightgreen:\"#90ee90\",orchid:\"#da70d6\",gainsboro:\"#dcdcdc\",mediumseagreen:\"#3cb371\",lightgray:\"#d3d3d3\",mediumturquoise:\"#48d1cc\",lemonchiffon:\"#fffacd\",cadetblue:\"#5f9ea0\",lightyellow:\"#ffffe0\",lavenderblush:\"#fff0f5\",coral:\"#ff7f50\",purple:\"#800080\",aqua:\"#00ffff\",whitesmoke:\"#f5f5f5\",mediumslateblue:\"#7b68ee\",darkorange:\"#ff8c00\",mediumaquamarine:\"#66cdaa\",darksalmon:\"#e9967a\",beige:\"#f5f5dc\",blueviolet:\"#8a2be2\",azure:\"#f0ffff\",lightsteelblue:\"#b0c4de\",oldlace:\"#fdf5e6\"},K=function(){var a,b,c,d,e;for(a={},e=\"Boolean Number String Function Array Date RegExp Undefined Null\".split(\" \"),d=0,b=e.length;b>d;d++)c=e[d],a[\"[object \"+c+\"]\"]=c.toLowerCase();return function(b){var c;return c=Object.prototype.toString.call(b),a[c]||\"object\"}}(),x=function(a,b,c){return null==b&&(b=0),null==c&&(c=1),b>a&&(a=b),a>c&&(a=c),a},L=function(a){return a.length>=3?a:a[0]},d=2*Math.PI,c=Math.PI/3,m=Math.cos,h=function(a){var b,c,d,e,f,g,i,k,l,m,n;return a=function(){var b,c,d;for(d=[],c=0,b=a.length;b>c;c++)e=a[c],d.push(j(e));return d}(),2===a.length?(l=function(){var b,c,d;for(d=[],c=0,b=a.length;b>c;c++)e=a[c],d.push(e.lab());return d}(),f=l[0],g=l[1],b=function(a){var b,c;return c=function(){var c,d;for(d=[],b=c=0;2>=c;b=++c)d.push(f[b]+a*(g[b]-f[b]));return d}(),j.lab.apply(j,c)}):3===a.length?(m=function(){var b,c,d;for(d=[],c=0,b=a.length;b>c;c++)e=a[c],d.push(e.lab());return d}(),f=m[0],g=m[1],i=m[2],b=function(a){var b,c;return c=function(){var c,d;for(d=[],b=c=0;2>=c;b=++c)d.push((1-a)*(1-a)*f[b]+2*(1-a)*a*g[b]+a*a*i[b]);return d}(),j.lab.apply(j,c)}):4===a.length?(n=function(){var b,c,d;for(d=[],c=0,b=a.length;b>c;c++)e=a[c],d.push(e.lab());return d}(),f=n[0],g=n[1],i=n[2],k=n[3],b=function(a){var b,c;return c=function(){var c,d;for(d=[],b=c=0;2>=c;b=++c)d.push((1-a)*(1-a)*(1-a)*f[b]+3*(1-a)*(1-a)*a*g[b]+3*(1-a)*a*a*i[b]+a*a*a*k[b]);return d}(),j.lab.apply(j,c)}):5===a.length&&(c=h(a.slice(0,3)),d=h(a.slice(2,5)),b=function(a){return.5>a?c(2*a):d(2*(a-.5))}),b},j.interpolate.bezier=h}).call(this);",
  "css/controller.css": "/*\n * Copyright 2014, Gregg Tavares.\n * All rights reserved.\n *\n * Redistribution and use in source and binary forms, with or without\n * modification, are permitted provided that the following conditions are\n * met:\n *\n *     * Redistributions of source code must retain the above copyright\n * notice, this list of conditions and the following disclaimer.\n *     * Redistributions in binary form must reproduce the above\n * copyright notice, this list of conditions and the following disclaimer\n * in the documentation and/or other materials provided with the\n * distribution.\n *     * Neither the name of Gregg Tavares. nor the names of its\n * contributors may be used to endorse or promote products derived from\n * this software without specific prior written permission.\n *\n * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS\n * \"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT\n * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR\n * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT\n * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,\n * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT\n * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,\n * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY\n * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT\n * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\n * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n */\nhtml, body {\n    background: linear-gradient(\n      to bottom,\n      #54453F,\n      #54453F 10%,\n      #FFF2D0 10%,\n      #FFF2D0 12%,\n      #54453F 12%,\n      #54453F 14%,\n      #FFF2D0 14%,\n      #FFF2D0 86%,\n      #54453F 86%,\n      #54453F 88%,\n      #FFF2D0 88%,\n      #FFF2D0 90%,\n      #54453F 90%,\n      #54453F\n    );\n}\n#buttons {\n    position: absolute;\n\n    -moz-user-select: none;\n    -webkit-user-select: none;\n    -o-user-select: none;\n    user-select: none;\n}\nimg {\n    width: 100%;\n    height: 100%;\n    -moz-user-select: none;\n    -webkit-user-select: none;\n    -o-user-select: none;\n    user-select: none;\n    pointer-events: none;\n}\n.button {\n    width: 110px;\n    height: 110px;\n    text-align: center;\n    font-size: 70px;\n    font-family: Helvetica, Arial, sans-serif;\n    font-weight: bold;\n    bottom: 60px;\n    position: absolute;\n}\n#gamearea {\n    width: 100%;\n    height: 100%;\n}\n#display {\n}\n#buttons {\n    position: absolute;\n\n    -moz-user-select: none;\n    -webkit-user-select: none;\n    -o-user-select: none;\n    user-select: none;\n}\nsvg, img {\n    width: 100%;\n    height: 100%;\n    -moz-user-select: none;\n    -webkit-user-select: none;\n    -o-user-select: none;\n    user-select: none;\n    pointer-events: none;\n}\n.button {\n    width: 110px;\n    height: 110px;\n    text-align: center;\n    font-size: 70px;\n    font-family: Helvetica, Arial, sans-serif;\n    font-weight: bold;\n    bottom: 20%;\n    position: absolute;\n}\n\n\n\n.layout-default #dpad1          { display: none; }\n.layout-default #dpad2          { display: none; }\n.layout-default #buttonA        { display: none; }\n.layout-default #buttonB        { display: none; }\n\n.layout-1button #dpad1          { display: none; }\n.layout-1button #dpad2          { display: none; }\n.layout-1button #buttonA        { right: 70px; }\n.layout-1button #buttonB        { display: none; }\n\n.layout-2button #dpad1          { display: none; }\n.layout-2button #dpad2          { display: none; }\n.layout-2button #buttonA        { left:  70px;   }\n.layout-2button #buttonB        { right: 70px;  }\n\n.layout-1dpad-1button #dpad1    { left: 70px; width: 160px; height: 160px; }\n.layout-1dpad-1button #dpad2    { display: none; }\n.layout-1dpad-1button #buttonA  { right: 70px;   }\n.layout-1dpad-1button #buttonB  { display: none;  }\n\n.layout-1dpad-2button #dpad1    { left:  70px; width: 160px; height: 160px; }\n.layout-1dpad-2button #dpad2    { display: none; }\n.layout-1dpad-2button #buttonA  { right: 200px;  }\n.layout-1dpad-2button #buttonB  { right:  70px;  }\n\n.layout-1dpad #dpad1            { left:  70px; width: 160px; height: 160px; }\n.layout-1dpad #dpad2            { display: none; }\n.layout-1dpad #buttonA          { display: none; }\n.layout-1dpad #buttonB          { display: none; }\n\n.layout-2dpad #dpad1            { left:  70px; width: 160px; height: 160px; }\n.layout-2dpad #dpad2            { right: 70px; width: 160px; height: 160px; }\n.layout-2dpad #buttonA          { display: none; }\n.layout-2dpad #buttonB          { display: none; }\n\n#inputarea {\n    position: absolute;\n    z-index: 4100;\n    top: 0px;\n    left: 0px;\n    width: 100%;\n    height: 100%;\n}\n\n@media only screen\n  and (max-device-width: 480px) {\n\n.layout-1button #buttonA        { right: 20px; }\n\n.layout-2button #buttonA        { left:  20px; }\n.layout-2button #buttonB        { right: 20px; }\n\n.layout-1dpad-1button #dpad1    { left:  20px; width: 160px; height: 160px; }\n.layout-1dpad-1button #buttonA  { right: 20px; }\n\n.layout-1dpad-2button #dpad1    { left:   20px; width: 160px; height: 160px; }\n.layout-1dpad-2button #buttonA  { right: 150px; }\n.layout-1dpad-2button #buttonB  { right:  20px; }\n\n.layout-1dpad #dpad1            { left:  20px; width: 160px; height: 160px; }\n\n.layout-2dpad #dpad1            { left:  20px; width: 160px; height: 160px; }\n.layout-2dpad #dpad2            { right: 20px; width: 160px; height: 160px; }\n\n}\n\n@media only screen and (orientation: portrait) {\n\n    .layout-1button #buttonA        { right: inherit; top: 50%; }\n\n    .layout-2button #buttonA        { left:  inherit; top: 20%; }\n    .layout-2button #buttonB        { right: inherit; bottom: 20%; }\n\n    #buttonA {\n        width: 100%;\n        margin: 0 auto;\n    }\n\n    #buttonB {\n        width: 100%;\n        margin: 0 auto;\n    }\n\n}\n",
  "scripts/controller.js": "/*\n * Copyright 2014, Gregg Tavares.\n * All rights reserved.\n *\n * Redistribution and use in source and binary forms, with or without\n * modification, are permitted provided that the following conditions are\n * met:\n *\n *     * Redistributions of source code must retain the above copyright\n * notice, this list of conditions and the following disclaimer.\n *     * Redistributions in binary form must reproduce the above\n * copyright notice, this list of conditions and the following disclaimer\n * in the documentation and/or other materials provided with the\n * distribution.\n *     * Neither the name of Gregg Tavares. nor the names of its\n * contributors may be used to endorse or promote products derived from\n * this software without specific prior written permission.\n *\n * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS\n * \"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT\n * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR\n * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT\n * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,\n * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT\n * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,\n * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY\n * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT\n * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\n * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n */\n\"use strict\";\n\n// Start the main app logic.\nrequirejs([\n    'hft/commonui',\n    'hft/gameclient',\n    'hft/misc/input',\n    'hft/misc/misc',\n    'hft/misc/mobilehacks',\n    'hft/misc/strings',\n    'hft/misc/touch',\n    '../3rdparty/chroma.min',\n  ], function(\n    commonUI,\n    GameClient,\n    input,\n    misc,\n    mobileHacks,\n    strings,\n    touch,\n    chroma) {\n\n  var $ = document.getElementById.bind(document);\n  var globals = {\n    debug: false,\n    // orientation: \"landscape-primary\",\n  };\n  misc.applyUrlSettings(globals);\n  mobileHacks.disableContextMenu();\n  mobileHacks.fixHeightHack();\n  mobileHacks.adjustCSSBasedOnPhone([\n    {\n      test: mobileHacks.isIOS8OrNewerAndiPhone4OrIPhone5,\n      styles: {\n        \".button\": {\n          bottom: \"100px\",\n        },\n      },\n    },\n  ]);\n\n  var client = new GameClient();\n\n  var layouts = {\n    \"1button\": {\n      orientation: \"none\",\n    },\n    \"2button\": {\n      orientation: \"none\",\n    },\n    \"1dpad-1button\": {\n      orientation: \"landscape\",\n    },\n    \"1dpad-2button\": {\n      orientation: \"landscape\",\n    },\n    \"1dpad\": {\n      orientation: \"none\",\n    },\n    \"2dpad\": {\n      orientation: \"landscape\",\n    },\n  };\n\n  function handleColor(data) {\n    // the color arrives in data.color.\n    // we use chroma.js to darken the color\n    // then we get our style from a template in controller.html\n    // sub in our colors, remove extra whitespace and attach to body.\n    var subs = {\n      light: data.color,\n      dark: chroma(data.color).darken().hex(),\n    };\n    var style = $(\"background-style\").text;\n    style = strings.replaceParams(style, subs).replace(/[\\n ]+/g, ' ').trim();\n    document.body.style.background = style;\n  }\n\n  function notLayout(name) {\n    return name.substr(0, 7) !== \"layout-\";\n  }\n\n  function handleOptions(data) {\n    var controllerType = data ? data.controllerType : undefined;\n    controllerType = (controllerType || \"\").replace(/s/g, \"\").toLowerCase();  // remove 's' so buttons -> button, dpads -> dpad\n    if (!(controllerType in layouts)) {\n      if (controllerType) {\n        client.error(\"unknown controller type: \" + controllerType);\n        client.error(\"valid types are:\\n\" + Object.keys(layouts).join(\"\\n\"));\n      }\n      controllerType = \"1dpad-2button\";\n    }\n    var elem = $(\"buttons\");\n    var classes = elem.className.split(/[ \\t\\n]+/);\n    classes = classes.filter(notLayout);\n    classes.unshift(\"layout-\" + controllerType);\n    elem.className = classes.join(\" \");\n\n    var layout = layouts[controllerType];\n    commonUI.setOrientation(layout.orientation);\n  }\n\n  client.addEventListener('color', handleColor);\n  client.addEventListener('options', handleOptions);\n\n  // This way of making buttons probably looks complicated but\n  // it lets us easily make more buttons.\n  //\n  // It's actually pretty simple. We embed 2 svg files\n  // in the HTML in a script tag. We could load them but\n  // loading is ASYNC\n  //\n  // We put in substitutions in the form of %(nameOfValue)s\n  // so we can easily replace the colors. We could have done\n  // that by looking up nodes or using CSS but this was easiest.\n  //\n  // We then insert that text into a div by id, look up\n  // the 2 svg files and hook up some functions, press(), and\n  // isPressed() that we can use check the state of the button\n  // and to change which svg shows.\n  var Button = function() {\n    var svgSrc = $(\"button-img\").text + $(\"button-pressed\").text;\n\n    return function Button(id, options) {\n      var element = $(id);\n      var pressed = false;\n      element.innerHTML = strings.replaceParams(svgSrc, options);\n      var buttonSvg  = element.querySelector(\".button-img\");\n      var pressedSvg = element.querySelector(\".button-pressed\");\n\n      this.press = function(press) {\n        pressed = press;\n        buttonSvg.style.display  =  pressed ? \"none\" : \"inline-block\";\n        pressedSvg.style.display = !pressed ? \"none\" : \"inline-block\";\n      };\n\n      this.isPressed = function() {\n        return pressed;\n      };\n\n      this.press(false);\n    };\n  }();\n\n  // Make 2 buttons\n  var buttons = [\n    new Button(\"buttonA\", { surfaceColor: \"#F64B83\", edgeColor: \"#76385E\" }),\n    new Button(\"buttonB\", { surfaceColor: \"#1C97FA\", edgeColor: \"#1C436A\" }),\n  ];\n\n  var DPad = function(id) {\n    var element = $(id);\n    element.innerHTML = $(\"dpad-image\").text;\n  };\n  // TODO: animate dpads\n  var dpads = [  // eslint-disable-line\n    new DPad(\"dpad1\"),\n    new DPad(\"dpad2\"),\n  ];\n\n  commonUI.setupStandardControllerUI(client, globals);\n\n  // Since we take input touch, mouse, and keyboard\n  // we only send the button to the game when it's state\n  // changes.\n  function handleButton(pressed, id) {\n    var button = buttons[id];\n    if (pressed !== button.isPressed()) {\n      button.press(pressed);\n      client.sendCmd('button', { id: id, pressed: pressed });\n    }\n  }\n\n  function handleDPad(e) {\n    client.sendCmd('dpad', { pad: e.pad, dir: e.info.direction });\n  }\n\n  // Setup some keys so we can more easily test on desktop\n  var keys = { };\n  keys[\"Z\"]                     = function(e) { handleButton(e.pressed,  0); };  // eslint-disable-line\n  keys[\"X\"]                     = function(e) { handleButton(e.pressed,  1); };  // eslint-disable-line\n  input.setupKeys(keys);\n  input.setupKeyboardDPadKeys(handleDPad, {\n    pads: [\n     { keys: input.kCursorKeys, },\n     { keys: input.kASWDKeys,   },\n    ],\n  });\n\n  // Setup the touch areas for buttons.\n  touch.setupButtons({\n    inputElement: $(\"buttons\"),\n    buttons: [\n      { element: $(\"buttonA\"), callback: function(e) { handleButton(e.pressed, 0); }, },  // eslint-disable-line\n      { element: $(\"buttonB\"), callback: function(e) { handleButton(e.pressed, 1); }, },  // eslint-disable-line\n    ],\n  });\n\n  // should I look this up? I can't actually know it until the CSS is set.\n  var dpadSize = 160;\n  touch.setupVirtualDPads({\n    inputElement: $(\"dpads\"),\n    callback: handleDPad,\n    fixedCenter: true,\n    pads: [\n      { referenceElement: $(\"dpad1\"), offsetX: dpadSize / 2, offsetY: dpadSize / 2, },\n      { referenceElement: $(\"dpad2\"), offsetX: dpadSize / 2, offsetY: dpadSize / 2, },\n    ],\n  });\n});\n\n"
};
});


/*
 * Copyright 2014, Gregg Tavares.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Gregg Tavares. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


define('hftctrl/controller-support',[
  './3rdparty/chroma.min',
  './files',
], function(
  chroma,
  files
) {
  function init() {

    var gamepads = [];          // HFT gamepads
    var combinedGamepads = [];  // both native and HFT gamepads

    // wrap navigator.getGamepads
    var originalGetGamepads = window.navigator.getGamepads.bind(navigator);
    window.navigator.getGamepads = function() {
      var realGamepads = originalGetGamepads();
      var len = Math.max(realGamepads.length, gamepads.length);
      for (var ii = 0; ii < len; ++ii) {
        combinedGamepads[ii] = gamepads[ii] || realGamepads[ii] || null;
      }
      if (len < combinedGamepads.length) {
        combinedGamepads.splice(len);
      }
      return combinedGamepads;
    };

    function load() {
      var r = window.require.config({
        paths: {
          hft: '//localhost:18679/hft/0.x.x/scripts',
        },
      });
      r([
          'hft/gameserver',
          'hft/misc/input',
        ], function(
          GameServer,
          input
        ) {

        window.buttons = window.buttons || [];

        var hftOptions;
        var script = document.querySelector("script[hft-options]");
        if (script) {
          try {
            var opt = script.getAttribute("hft-options").replace(/'/g, '"').replace(/(\w+)\:/g, '"$1":');
            hftOptions = JSON.parse(opt);
          } catch (e) {
            console.error("Could not read hft-options from script:", opt);  // eslint-disable-line
            console.error(e);  // eslint-disable-line
          }
        }
        hftOptions = hftOptions || {};
        var controllerId = hftOptions.reportMapping ? ("happyfuntimes-" + (hftOptions.controllerType || "1dpad-2button") + "-controller") : "standard";

        /**
         * @typedef {Object} HFTOptions
         * @param {string} [controllerType] what type controller. Valid types are
         *    "1button", "2button", "1dpad-1button", "1dpad-2button", "1dpad", "2dpad".
         *    Default = 1dpad-2button".
         * @param {boolean} dpadToAxes Copy dpad values to axes values. Default = true;
         * @param {boolean} axesOnly Dpad values show up as axes, not dpad at all.
         * @param {boolean} reportMapping If true Gamepad.mapping will be `happyfuntimes-<controllerType>`.
         *    Default = false in which case Gamepad.mapping will be `standard`.
         */

        // TODO: Pass in options in window.HFTOptions like maxplayers, if
        // more than max put up message and do all the shit like unity
        // Need to handle more than 16 players (as in le
        function getSlotNdx() {
          for (var ii = 0; ii < gamepads.length; ++ii) {
            if (!gamepads[ii]) {
              return ii;
            }
          }
          return ii;
        }

        var Gamepad = function(netPlayer, name, ndx) {
          // readonly    attribute id;
          // readonly    attribute long                index;
          // readonly    attribute boolean             connected;
          // readonly    attribute DOMHighResTimeStamp timestamp;
          // readonly    attribute GamepadMappingType  mapping;
          // readonly    attribute double[]            axes;
          // readonly    attribute GamepadButton[]     buttons;
          //
          var connected = true;  // eslint-disable-line
          var timestamp = window.performance.now();  // eslint-disable-line

          var axes = [0, 0, 0, 0];
          var buttons = [
            { pressed: false, value: 0, },  //  0 button A
            { pressed: false, value: 0, },  //  1 button B
            { pressed: false, value: 0, },  //  2
            { pressed: false, value: 0, },  //  3
            { pressed: false, value: 0, },  //  4
            { pressed: false, value: 0, },  //  5
            { pressed: false, value: 0, },  //  6
            { pressed: false, value: 0, },  //  7
            { pressed: false, value: 0, },  //  8
            { pressed: false, value: 0, },  //  9
            { pressed: false, value: 0, },  // 10
            { pressed: false, value: 0, },  // 11
            { pressed: false, value: 0, },  // 12 dpad1 up
            { pressed: false, value: 0, },  // 13 dpad1 down
            { pressed: false, value: 0, },  // 14 dpad1 left
            { pressed: false, value: 0, },  // 15 dpad1 right
            { pressed: false, value: 0, },  // 16 dpad2 up
            { pressed: false, value: 0, },  // 17 dpad2 down
            { pressed: false, value: 0, },  // 18 dpad2 left
            { pressed: false, value: 0, },  // 19 dpad2 right
          ];

          // If anyone knows a better way to pick super distinct colors please tell me
          // This one goes around the color wheel at 90 degrees every for players
          // For every other set of 4 players is offset 22.5. So you get
          //
          //      0     90    180    270   : players 0-3
          //     22.5  112.5  202.5  292.5 : players 4-7
          //     45    135    225    315   : players 8-11
          //     67.5  157.5  247.5  337.5 : players 12-16
          //
          // after that repeat the same sequence + 12.5 degrees
          // but at full saturation (vs 0.4 saturation for the first 16 players)
          //
          // After that those 2 sequences repeat but at value = 0.5 instead of value = 1
          // I suspect that's too dark. Ideally the game itself should figure out
          // a way to decide on colors and possibly different avatars or different patterns.
          var majorHue = ndx % 4;
          var minorHue = ndx / 4 | 0;
          var tinyHue  = (ndx & 0x10) ? 0 : 1;
          var hue = (majorHue * 90 + minorHue * 22.5 + tinyHue * 12.5) % 360;
          var saturation = (ndx & 0x10) ? 1 : 0.4;
          var value = (ndx & 0x20) ? 0.5 : 1;
          var color = chroma.hsv(hue, saturation, value).hex();

          // Send the color to the controller.
          this.color = color;

          // The player disconnected.
          var disconnect = function() {
            connected = false;
            gamepads[ndx] = undefined;
            var event = new CustomEvent('gamepaddisconnected', { });
            event.gamepad = this;
            window.dispatchEvent(event);
          }.bind(this);

          var updateButton = function(ndx, pressed) {
            timestamp = window.performance.now();
            button = buttons[ndx];
            if (!button) {
              button = { pressed: false, value: 0, };
              buttons[ndx] = button;
            }
            button.pressed = pressed;
            button.value   = pressed ? 1 : 0;
          };

          var handleButton = function(data) {
            updateButton(data.id, data.pressed);
          };

          var axisButtonMap = [
            [14, 15, 12, 13],
            [18, 19, 16, 17],
          ];
          var handleDPad = function(data) {
            var axisOffset = data.pad * 2;
            var buttonIndices = axisButtonMap[data.pad];
            var dirInfo = input.getDirectionInfo(data.dir);
            if (!hftOptions.axesOnly) {
              updateButton(buttonIndices[0], (dirInfo.bits & 0x2) ? true : false);
              updateButton(buttonIndices[1], (dirInfo.bits & 0x1) ? true : false);
              updateButton(buttonIndices[2], (dirInfo.bits & 0x4) ? true : false);
              updateButton(buttonIndices[3], (dirInfo.bits & 0x8) ? true : false);
            }

            if (hftOptions.dpadToAxes !== false || hftOptions.axesOnly) {
              axes[axisOffset + 0] =  dirInfo.dx;
              axes[axisOffset + 1] = -dirInfo.dy;
            }
          };

          netPlayer.sendCmd('options', hftOptions);
          netPlayer.addEventListener('disconnect', disconnect);
          netPlayer.addEventListener('button', handleButton);
          netPlayer.addEventListener('dpad', handleDPad);
        };

        var server = new GameServer({
          gameId: window.location.origin + window.location.pathname,
          reconnectOnDisconnect: true,
          url: "ws://localhost:18679",
          files: files,
          packageInfo: {
            happyFunTimes: {
              name: "whatever",
              apiVersion: "1.11.0",
            },
          },
        });

        // A new player has arrived.
        server.addEventListener('playerconnect', function(netPlayer, name) {
          var ndx = getSlotNdx();
          var gamepad = new Gamepad(netPlayer, name, ndx);
          gamepads[ndx] = gamepad;
          var event = new CustomEvent('gamepadconnected', { });
          event.gamepad = gamepad;
          window.dispatchEvent(event);
        });

        Object.defineProperties(this, {
          id: {
            value: controllerId,
            writable: false,
          },
          index: {
            value: ndx,
            writable: false,
          },
          connected: {
            get: function() {
              return connected;
            },
          },
          timestamp: {
            get: function() {
              return timestamp;
            },
          },
          mapping: {
            value: controllerId,  // does this have to be ""?
            writable: false,
          },
          axes: {
            get: function() {
              return axes;
            },
          },
          buttons: {
            get: function() {
              return buttons;
            },
          },
          color: {
            get: function() {
              return color;
            },
            // Must be a valid CSS color value, eg "white", "#F05", "#F701D3", "rgb(255,127,0)", etc..
            set: function(newColor) {
              color = newColor;
              netPlayer.sendCmd('color', { color: color });
            },
          },
          netPlayer: {
            get: function() {
              return netPlayer;
            },
          },
          name: {
            get: function() {
              return netPlayer.name;
            },
          },
        });
      });
    }

    if (window.require && window.define && window.define.amd) {
      load();
    } else {
      var script = document.createElement("script");
      script.addEventListener('load', load);
      script.type = "text/javascript";
      script.src = "http://localhost:18679/3rdparty/require.js";
      window.document.body.appendChild(script);
    }
  }

  return {
    init: init,
  };
});

/*
 * Copyright 2014, Gregg Tavares.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Gregg Tavares. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


define('hftctrl/hft-connect',[
    './io',
    './controller-support',
  ], function(
    io,
    controllerSupport) {

  var g = {
    client: undefined,
    connectedState: undefined,   // connected or not?
  };

  var connectedStateFuncs = {
    init_offline: function() {
      checkForHFT();  // eslint-disable-line
    },
    init_connectedToHappyFunTimes: function() {
    },
  };

  var setConnectedState = function(state) {
    if (g.connectedState !== state) {
      g.connectedState = state;
      var initFn = connectedStateFuncs["init_" + state];
      if (!initFn) {
        console.error("unknown connected state: " + state);  // eslint-disable-line
        return;
      }
      initFn();
    }
  };

  var tryToConnectToHFT = function() {
    g.client = g.appHelp.createClient();
    g.client.addEventListener('connect', function() {}, false);
    g.client.addEventListener('disconnect', function() {
      g.client = undefined;
      setConnectedState("offline");
    });
    setConnectedState("connectedToHappyFunTimes");

    g.client.addEventListener('hftInfo', function(hftInfo) {
      console.log(hftInfo);  // eslint-disable-line
    });
  };

  var checkForHFT = function() {
    var checkForHFTCallback = function(err) {
      if (err) {
        setTimeout(checkForHFT, 1000);
        return;
      }

      if (g.appHelp) {
        tryToConnectToHFT();
      } else {
        controllerSupport.init();
      }
    };
    io.sendJSON("http://localhost:18679/", {cmd: 'happyFunTimesPing'}, checkForHFTCallback, { timeout: 1000 });
  };

  var init = function() {
    setConnectedState("offline");
  };

  return {
    init: init,
  };
});








define('main', [
    'hftctrl/hft-connect',
  ], function(
    hftConnect
  ) {
    return hftConnect;
})

require(['main'], function(main) {
  return main;
}, undefined, true);   // forceSync = true


;
define("build/js/includer", function(){});

    return require('main');
}));
