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
"use strict";

define([
  './3rdparty/chroma.min',
  './files',
], function(
  chroma,
  files
) {
  function init() {

    var gamepads = [];          // HFT gamepads
    var combinedGamepads = [];  // both native and HFT gamepads
    var hftOptions = {};
    var waitingGamepads = [];

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
          'hft/misc/misc',
        ], function(
          GameServer,
          input,
          misc
        ) {

        window.buttons = window.buttons || [];

        var relaxedJsonParse = function(str) {
          try {
            str = str.replace(/'/g, '"').replace(/(\w+)\:/g, '"$1":');
            return JSON.parse(str);
          } catch (e) {
            console.error(e);  // eslint-disable-line
          }
        };

        var script = document.querySelector("script[hft-options]");
        if (script) {
          hftOptions = relaxedJsonParse(script.getAttribute("hft-options"));
          if (!hftOptions) {
            console.error("Could not read hft-options from script:", opt);  // eslint-disable-line
          }
        }
        hftOptions = hftOptions || {};
        var args = misc.parseUrlQuery();
        if (args.hftOptions) {
          var opts = relaxedJsonParse(args.hftOptions);
          if (opts) {
            hftOptions = misc.mergeObjects(hftOptions, opts);
          }
        }
        var controllerId = hftOptions.reportMapping ? ("happyfuntimes-" + (hftOptions.controllerType || "1dpad-2button") + "-controller") : "standard";
        var maxGamepads = parseInt(hftOptions.maxGamepads) || 0;

        /**
         * @typedef {Object} HFTOptions
         * @param {string} [controllerType] what type controller. Valid types are
         *    "1button", "2button", "1dpad-1button", "1dpad-2button", "1dpad", "2dpad".
         *    Default = 1dpad-2button".
         * @param {boolean} [dpadToAxes] Copy dpad values to axes values. Default = true;
         * @param {boolean} [axesOnly] Dpad values show up as axes, not dpad at all.
         * @param {boolean} [reportMapping] If true Gamepad.mapping will be `happyfuntimes-<controllerType>`.
         *    Default = false in which case Gamepad.mapping will be `standard`.
         */

        function getSlotNdx() {
          for (var ii = 0; ii < gamepads.length; ++ii) {
            if (!gamepads[ii]) {
              return ii;
            }
          }
          return ii;
        }

        function startWaitingGamepads() {
          while (waitingGamepads.length) {
            var ndx = getSlotNdx();
            if (maxGamepads !== 0 && ndx >= maxGamepads) {
              return;
            }

            var gamepad = waitingGamepads.shift();
            gamepads[ndx] = gamepad;
            gamepad.hft.makeActive(ndx);
            var event = new CustomEvent('gamepadconnected', { });
            event.gamepad = gamepad;
            window.dispatchEvent(event);
          }
        }

        var Gamepad = function(netPlayer) {
          // readonly    attribute id;
          // readonly    attribute long                index;
          // readonly    attribute boolean             connected;
          // readonly    attribute DOMHighResTimeStamp timestamp;
          // readonly    attribute GamepadMappingType  mapping;
          // readonly    attribute double[]            axes;
          // readonly    attribute GamepadButton[]     buttons;
          var connected = false;
          var timestamp = window.performance.now();
          var ndx = -1;
          var color;

          var AXIS_ORIENTATION_ALPHA = 4;
          var AXIS_ORIENTATION_BETA  = 5;
          var AXIS_ORIENTATION_GAMMA = 6;

          var AXIS_ACCELERATION_X = 7;
          var AXIS_ACCELERATION_Y = 8;
          var AXIS_ACCELERATION_Z = 9;

          var AXIS_ROTATION_RATE_ALPHA = 10;
          var AXIS_ROTATION_RATE_BETA  = 11;
          var AXIS_ROTATION_RATE_GAMMA = 12;

          var AXIS_TOUCH_X = 13;
          var AXIS_TOUCH_Y = 14;

          var axes = [
            0,  //  0 x0 pad0
            0,  //  1 y0
            0,  //  2 x1 pad1
            0,  //  3 y1
          ];

          var extraAxes = [
            0,  //  4 orientation alpha
            0,  //  5 orientaiton beta
            0,  //  6 orientation gamma
            0,  //  7 acceleration x
            0,  //  8 acceleration y
            0,  //  9 acceleration z
            0,  // 10 rotation rate alpha
            0,  // 11 rotation rate beta
            0,  // 12 rotation rate gamma
            0,  // 13 touch x
            0,  // 14 touch y
          ];

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

          // The player disconnected.
          var disconnect = function() {
            connected = false;
            if (ndx >= 0) {
              gamepads[ndx] = undefined;
              var event = new CustomEvent('gamepaddisconnected', { });
              event.gamepad = this;
              window.dispatchEvent(event);
              ndx = -1;
              startWaitingGamepads();
            } else {
              var ii = waitingGamepads.indexOf(this);
              waitingGamepads.splice(ii, 1);
            }
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

          var handleOrient = function(data) {
            // console.log(JSON.stringify(data)); // eslint-disable-line
            axes[AXIS_ORIENTATION_ALPHA] = data.a; // data.a / 180 - 1;  // range is suspposed to be 0 to 359
            axes[AXIS_ORIENTATION_BETA]  = data.b; // data.b / 180;      // range is suspposed to be -180 to 180
            axes[AXIS_ORIENTATION_GAMMA] = data.g; // data.g / 90;       // range is suspposed to be -90 to 90
          };

          var handleAccel = function(data) {
            // console.log(JSON.stringify(data)); // eslint-disable-line
            // These values are supposed to be in meters per second squared but I need to convert them to 0 to 1 values.
            // A quick test seems to make them go to +/- around 50 at least on my iPhone5s but different on my android.
            // Maybe I should keep track of max values and reset over time with some threshold?
            // actually I'm just going to pass them through as is.
            axes[AXIS_ACCELERATION_X] = data.x; //clamp(data.x / maxAcceleration, -1, 1);
            axes[AXIS_ACCELERATION_Y] = data.y; //clamp(data.y / maxAcceleration, -1, 1);
            axes[AXIS_ACCELERATION_Z] = data.z; //clamp(data.z / maxAcceleration, -1, 1);
          };

          var handleRot = function(data) {
            // console.log(JSON.stringify(data)); // eslint-disable-line
            axes[AXIS_ROTATION_RATE_ALPHA] = data.a;
            axes[AXIS_ROTATION_RATE_BETA]  = data.b;
            axes[AXIS_ROTATION_RATE_GAMMA] = data.g;
          };

          var handleTouch = function(data) {
            axes[AXIS_TOUCH_X] = data.x / 500 - 1;
            axes[AXIS_TOUCH_Y] = data.y / 500 - 1;
          };

          var setOptions = function(options) {
            // only add the extra axes if we've requested that data
            // this it so axes.length === 4 which woul be the default
            if (axes.length === 4 &&
                (options.provideOrientation ||
                 options.provideAcceleration ||
                 options.provideRotationRate ||
                 (options.controllerType && options.controllerType.toLowerCase() === "touch"))) {
              axes = axes.concat(extraAxes);
            }

            netPlayer.sendCmd('options', options);
          };

          setOptions(hftOptions);

          netPlayer.addEventListener('disconnect', disconnect);
          netPlayer.addEventListener('button', handleButton);
          netPlayer.addEventListener('dpad', handleDPad);
          netPlayer.addEventListener('orient', handleOrient);
          netPlayer.addEventListener('accel', handleAccel);
          netPlayer.addEventListener('rot', handleRot);
          netPlayer.addEventListener('touch', handleTouch);

          var makeActive = function(_ndx) {
            ndx = _ndx;
            connected = true;

            var hue = (((ndx & 0x01) << 5) |
                       ((ndx & 0x02) << 3) |
                       ((ndx & 0x04) << 1) |
                       ((ndx & 0x08) >> 1) |
                       ((ndx & 0x10) >> 3) |
                       ((ndx & 0x20) >> 5)) / 64.0;
            var sat   = (ndx & 0x10) !== 0 ? 0.5 : 1.0;
            var value = (ndx & 0x20) !== 0 ? 0.5 : 1.0;
            var color = chroma.hsv(hue, sat, value).hex();

            // Send the color to the controller.
            this.color = color;
            netPlayer.sendCmd('play');
          };

          var queue = function() {
             // only do this if there's waiting player
             if (ndx >= 0 && !waitingGamepads.length) {
               return;
             }
             netPlayer.sendCmd('full');
             waitingGamepads.push(this);
             disconnect();
          };

          var hft = {
            makeActive: makeActive,
            queue: queue,
            setOptions: setOptions,
          };

          Object.defineProperties(hft, {
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
                return netPlayer.getName();
              },
            },
          });

          Object.defineProperties(this, {
            id: {
              value: controllerId,
              writable: false,
            },
            index: {
              get: function() {
                return ndx;
              },
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
            hft: {
              get: function() {
                return hft;
              },
            },
          });
        };

        var gameName = hftOptions.name || document.title || window.location.hostname;
        var crapNameRE = /(^[0-9\.]+|localhost)$/;
        if (crapNameRE.test(gameName)) {
          gameName = "HappyFunTimes Gamepad Emu";
        }

        var server = new GameServer({
          gameId: window.location.origin + window.location.pathname,
          reconnectOnDisconnect: true,
          url: "ws://localhost:18679",
          files: files,
          packageInfo: {
            happyFunTimes: {
              name: gameName,
              apiVersion: "1.13.0",
            },
          },
        });

        // A new player has arrived.
        server.addEventListener('playerconnect', function(netPlayer, name) {
          var gamepad = new Gamepad(netPlayer, name);
          waitingGamepads.push(gamepad);
          startWaitingGamepads();
          // We were not immediately added.
          if (waitingGamepads.length > 0) {
            netPlayer.sendCmd('full');
          }
        });
      });
    }

    if (window.require && window.define && window.define.amd) {
      load();
    } else {
      var script = document.createElement("script");
      script.addEventListener('load', load);
      script.type = "text/javascript";
      script.charset = "utf-8";
      script.async = true;
      script.src = "http://localhost:18679/3rdparty/require.js";
      window.document.body.appendChild(script);
    }
  }

  return {
    init: init,
  };
});
