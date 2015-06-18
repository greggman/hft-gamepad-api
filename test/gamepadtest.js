/*
 * Gamepad API Test
 * Written in 2013 by Ted Mielczarek <ted@mielczarek.org>
 *
 * To the extent possible under law, the author(s) have dedicated all copyright and related and neighboring rights to this software to the public domain worldwide. This software is distributed without any warranty.
 *
 * You should have received a copy of the CC0 Public Domain Dedication along with this software. If not, see <http://creativecommons.org/publicdomain/zero/1.0/>.
 */

var $ = document.getElementById.bind(document);
var haveEvents = 'GamepadEvent' in window;
var controllers = [];

var controllerTypes = [
    "1button",
    "2button",
    "1dpad-1button",
    "1dpad-2button",
    "1dpad",
    "2dpad",
    "1lrpad-1button",
    "1lrpad-2button",
    "1lrpad",
    "touch",
];

var relaxedJsonParse = function(str) {
  try {
    str = str.replace(/'/g, '"').replace(/(\w+)\:/g, '"$1":');
    return JSON.parse(str);
  } catch (e) {
    console.error(e);  // eslint-disable-line
  }
};

var controllerOptions = relaxedJsonParse(document.querySelector("script[hft-options]").getAttribute("hft-options")) || {};

controllerTypes.forEach(function(type) {
  var option = document.createElement("option");
  option.value = type
  option.innerHTML = type;
  if (type === controllerOptions.controllerType) {
    option.selected = "selected";
  }
  $("controllerType").appendChild(option);
});

function getGamepads() {
  return navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);
}

function sendOptionsToGamepads() {
  var gamepads = getGamepads();
  for (var ii = 0; ii < gamepads.length; ++ii) {
    var gamepad = gamepads[ii];
    if (gamepad && gamepad.hft) {
      gamepad.hft.setOptions(controllerOptions);
    }
  }
}

function changeProvide(e) {
  controllerOptions[e.target.id] = e.target.checked;
  sendOptionsToGamepads();
}

Array.prototype.forEach.call(document.querySelectorAll("input[type=checkbox]"), function(checkbox) {
  checkbox.addEventListener('change', changeProvide);
});

$("controllerType").addEventListener('change', function(e) {
  // make every gamepad use new controller type
  controllerOptions.controllerType = e.target.options[e.target.selectedIndex].value;
  sendOptionsToGamepads();
});

function connecthandler(e) {
  addgamepad(e.gamepad);
}

function getAxesElements(d, numAxes) {
  var a = d.getElementsByClassName("axes")[0];
  var axes = a.getElementsByClassName("axis");
  if (axes.length < numAxes) {
    for (var i = axes.length; i < numAxes; ++i) {
      e = document.createElement("progress");
      e.className = "axis";
      //e.id = "a" + i;
      e.setAttribute("max", "2");
      e.setAttribute("value", "1");
      e.innerHTML = i;
      a.appendChild(e);
    }
    axes = a.getElementsByClassName("axis");
  }
  return axes;
}

function addgamepad(gamepad) {
  var controllerInfo = controllers[gamepad.index];
  if (!controllerInfo) {
    controllerInfo = {
      element: document.createElement("div"),
    };
    controllers[gamepad.index] = controllerInfo;
    var d = controllerInfo.element;
    controllerInfo.gamepad = gamepad;
    d.setAttribute("id", "controller" + gamepad.index);
    var t = document.createElement("h1");
    var name = gamepad.hft ? gamepad.hft.name : "";
    controllerInfo.nameNode = document.createTextNode(name);
    t.appendChild(controllerInfo.nameNode);
    t.appendChild(document.createTextNode("] gamepad: " + gamepad.id));
    d.appendChild(t);
    var b = document.createElement("div");
    b.className = "buttons";
    for (var i=0; i<gamepad.buttons.length; i++) {
      var e = document.createElement("span");
      e.className = "button";
      //e.id = "b" + i;
      e.innerHTML = i;
      b.appendChild(e);
    }
    d.appendChild(b);
    var a = document.createElement("div");
    a.className = "axes";
    d.appendChild(a);
    getAxesElements(d, gamepad.axes.length);
    document.getElementById("start").style.display = "none";
    document.body.appendChild(d);
  }
  requestAnimationFrame(updateStatus);
}

function disconnecthandler(e) {
  removegamepad(e.gamepad);
}

function removegamepad(gamepad) {
  controllers[gamepad.index].gamepad = null;
}

function updateStatus() {
  scangamepads();
  for (var j = 0; j < controllers.length; ++j) {
    var controllerInfo = controllers[j];
    var controller = controllerInfo.gamepad;
    var d = controllerInfo.element;
    controllerInfo.nameNode.nodeValue = controller ? (controller.hft ? controller.hft.name : "") : "-disconnected-";
    if (!controller) {
      d.style.backgroundColor = "#444";
      continue;
    }
    if (controller.hft && controller.hft.color) {
      d.style.backgroundColor = controller.hft.color;
    }
    var buttons = d.getElementsByClassName("button");
    for (var i=0; i<controller.buttons.length; i++) {
      var b = buttons[i];
      var val = controller.buttons[i];
      var pressed = val == 1.0;
      if (typeof(val) == "object") {
        pressed = val.pressed;
        val = val.value;
      }
      var pct = Math.round(val * 100) + "%";
      b.style.backgroundSize = pct + " " + pct;
      if (pressed) {
        b.className = "button pressed";
      } else {
        b.className = "button";
      }
    }

    var axes = getAxesElements(d, controller.axes.length);
    for (var i=0; i<controller.axes.length; i++) {
      var a = axes[i];
      a.innerHTML = i + ": " + controller.axes[i].toFixed(4);
      a.setAttribute("value", controller.axes[i] + 1);
    }
  }
  requestAnimationFrame(updateStatus);
}

function scangamepads() {
  var gamepads = getGamepads();
  for (var i = 0; i < gamepads.length; ++i) {
    var gamepad = gamepads[i];
    if (gamepad) {
      if (!controllers[gamepad.index]) {
        addgamepad(gamepad);
      } else {
        controllers[gamepad.index].gamepad = gamepad;
      }
    }
  }
}

if (haveEvents) {
  window.addEventListener("gamepadconnected", connecthandler);
  window.addEventListener("gamepaddisconnected", disconnecthandler);
} else {
  setInterval(scangamepads, 500);
}

window.c = controllers;
