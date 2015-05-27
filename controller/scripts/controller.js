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

// Start the main app logic.
requirejs([
    'hft/commonui',
    'hft/gameclient',
    'hft/misc/input',
    'hft/misc/misc',
    'hft/misc/mobilehacks',
    'hft/misc/strings',
    'hft/misc/touch',
    '../3rdparty/chroma.min',
  ], function(
    commonUI,
    GameClient,
    input,
    misc,
    mobileHacks,
    strings,
    touch,
    chroma) {

  var $ = document.getElementById.bind(document);
  var globals = {
    debug: false,
    // orientation: "landscape-primary",
  };
  misc.applyUrlSettings(globals);
  mobileHacks.disableContextMenu();
  mobileHacks.fixHeightHack();
  mobileHacks.adjustCSSBasedOnPhone([
    {
      test: mobileHacks.isIOS8OrNewerAndiPhone4OrIPhone5,
      styles: {
        ".button": {
          bottom: "100px",
        },
      },
    },
  ]);

  var client = new GameClient();

  var layouts = {
    "1button": {
      orientation: "none",
    },
    "2button": {
      orientation: "none",
    },
    "1dpad-1button": {
      orientation: "landscape",
    },
    "1dpad-2button": {
      orientation: "landscape",
    },
    "1dpad": {
      orientation: "none",
    },
    "2dpad": {
      orientation: "landscape",
    },
  };

  function handleColor(data) {
    // the color arrives in data.color.
    // we use chroma.js to darken the color
    // then we get our style from a template in controller.html
    // sub in our colors, remove extra whitespace and attach to body.
    var subs = {
      light: data.color,
      dark: chroma(data.color).darken().hex(),
    };
    var style = $("background-style").text;
    style = strings.replaceParams(style, subs).replace(/[\n ]+/g, ' ').trim();
    document.body.style.background = style;
  }

  function notLayout(name) {
    return name.substr(0, 7) !== "layout-";
  }

  function handleOptions(data) {
    var controllerType = data ? data.controllerType : undefined;
    controllerType = (controllerType || "").replace(/s/g, "").toLowerCase();  // remove 's' so buttons -> button, dpads -> dpad
    if (!(controllerType in layouts)) {
      if (controllerType) {
        client.error("unknown controller type: " + controllerType);
        client.error("valid types are:\n" + Object.keys(layouts).join("\n"));
      }
      controllerType = "1dpad-2button";
    }
    var elem = $("buttons");
    var classes = elem.className.split(/[ \t\n]+/);
    classes = classes.filter(notLayout);
    classes.unshift("layout-" + controllerType);
    elem.className = classes.join(" ");

    var layout = layouts[controllerType];
    commonUI.setOrientation(layout.orientation);
  }

  client.addEventListener('color', handleColor);
  client.addEventListener('options', handleOptions);

  // This way of making buttons probably looks complicated but
  // it lets us easily make more buttons.
  //
  // It's actually pretty simple. We embed 2 svg files
  // in the HTML in a script tag. We could load them but
  // loading is ASYNC
  //
  // We put in substitutions in the form of %(nameOfValue)s
  // so we can easily replace the colors. We could have done
  // that by looking up nodes or using CSS but this was easiest.
  //
  // We then insert that text into a div by id, look up
  // the 2 svg files and hook up some functions, press(), and
  // isPressed() that we can use check the state of the button
  // and to change which svg shows.
  var Button = function() {
    var svgSrc = $("button-img").text + $("button-pressed").text;

    return function Button(id, options) {
      var element = $(id);
      var pressed = false;
      element.innerHTML = strings.replaceParams(svgSrc, options);
      var buttonSvg  = element.querySelector(".button-img");
      var pressedSvg = element.querySelector(".button-pressed");

      this.press = function(press) {
        pressed = press;
        buttonSvg.style.display  =  pressed ? "none" : "inline-block";
        pressedSvg.style.display = !pressed ? "none" : "inline-block";
      };

      this.isPressed = function() {
        return pressed;
      };

      this.press(false);
    };
  }();

  // Make 2 buttons
  var buttons = [
    new Button("buttonA", { surfaceColor: "#F64B83", edgeColor: "#76385E" }),
    new Button("buttonB", { surfaceColor: "#1C97FA", edgeColor: "#1C436A" }),
  ];

  var DPad = function(id) {
    var element = $(id);
    element.innerHTML = $("dpad-image").text;
  };
  // TODO: animate dpads
  var dpads = [  // eslint-disable-line
    new DPad("dpad1"),
    new DPad("dpad2"),
  ];

  commonUI.setupStandardControllerUI(client, globals);

  // Since we take input touch, mouse, and keyboard
  // we only send the button to the game when it's state
  // changes.
  function handleButton(pressed, id) {
    var button = buttons[id];
    if (pressed !== button.isPressed()) {
      button.press(pressed);
      client.sendCmd('button', { id: id, pressed: pressed });
    }
  }

  function handleDPad(e) {
    client.sendCmd('dpad', { pad: e.pad, dir: e.info.direction });
  }

  // Setup some keys so we can more easily test on desktop
  var keys = { };
  keys["Z"]                     = function(e) { handleButton(e.pressed,  0); };  // eslint-disable-line
  keys["X"]                     = function(e) { handleButton(e.pressed,  1); };  // eslint-disable-line
  input.setupKeys(keys);
  input.setupKeyboardDPadKeys(handleDPad, {
    pads: [
     { keys: input.kCursorKeys, },
     { keys: input.kASWDKeys,   },
    ],
  });

  // Setup the touch areas for buttons.
  touch.setupButtons({
    inputElement: $("buttons"),
    buttons: [
      { element: $("buttonA"), callback: function(e) { handleButton(e.pressed, 0); }, },  // eslint-disable-line
      { element: $("buttonB"), callback: function(e) { handleButton(e.pressed, 1); }, },  // eslint-disable-line
    ],
  });

  // should I look this up? I can't actually know it until the CSS is set.
  var dpadSize = 160;
  touch.setupVirtualDPads({
    inputElement: $("dpads"),
    callback: handleDPad,
    fixedCenter: true,
    pads: [
      { referenceElement: $("dpad1"), offsetX: dpadSize / 2, offsetY: dpadSize / 2, },
      { referenceElement: $("dpad2"), offsetX: dpadSize / 2, offsetY: dpadSize / 2, },
    ],
  });
});

