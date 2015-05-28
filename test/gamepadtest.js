/*
 * Gamepad API Test
 * Written in 2013 by Ted Mielczarek <ted@mielczarek.org>
 *
 * To the extent possible under law, the author(s) have dedicated all copyright and related and neighboring rights to this software to the public domain worldwide. This software is distributed without any warranty.
 *
 * You should have received a copy of the CC0 Public Domain Dedication along with this software. If not, see <http://creativecommons.org/publicdomain/zero/1.0/>.
 */
var haveEvents = 'GamepadEvent' in window;
var controllers = [];

function connecthandler(e) {
  addgamepad(e.gamepad);
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
    controllerInfo.nameNode = document.createTextNode(gamepad.name);
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
    for (i=0; i<gamepad.axes.length; i++) {
      e = document.createElement("progress");
      e.className = "axis";
      //e.id = "a" + i;
      e.setAttribute("max", "2");
      e.setAttribute("value", "1");
      e.innerHTML = i;
      a.appendChild(e);
    }
    d.appendChild(a);
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
    controllerInfo.nameNode.nodeValue = controller ? controller.name : "-disconnected-";
    if (!controller) {
      d.style.backgroundColor = "#444";
      continue;
    }
    if (controller.color) {
      d.style.backgroundColor = controller.color;
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

    var axes = d.getElementsByClassName("axis");
    for (var i=0; i<controller.axes.length; i++) {
      var a = axes[i];
      a.innerHTML = i + ": " + controller.axes[i].toFixed(4);
      a.setAttribute("value", controller.axes[i] + 1);
    }
  }
  requestAnimationFrame(updateStatus);
}

function scangamepads() {
  var gamepads = navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);
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
