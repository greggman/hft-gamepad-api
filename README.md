HFT-GAMEPAD-API
===============

This script emualtes the HTML5 Gamepad API using smartphones and [HappyFunTimes](http://superhappyfuntimes.net).

<img src="assets/screenshot.png" width="50%" height="50%" />

It's **SUPER EASY TO USE**

Just put the `dist/happyfuntimes-gamepad-emu.min.js` file somewhere and include it at the bottom of your HTML file

   <script src="happyfuntimes-gamepad-emu.min.js"></script>

* Then [run happyfuntimes](http://superhappyfuntimes.net).
* Start your game
* Make sure your smartphone is on the same WiFi as the computer running your game
* On your phone's browser go to `happyfuntimes.net`

In a moment the phone should connect to your game and offer a dpad and 2 buttons. You can connect
any number of phones up to the limit of your WiFi setup.

## NOTE!!!! NOTE!!!! NOTE!!!! NOTE!!!! NOTE!!!! NOTE!!!!**

While this will work, if your game is not designed for HappyFunTimes you're probably going to be
slightly disappoinetd. By that I mean if your game is expecting an XBox 360 / PS3 controller with
2 analog sticks, a dpad, 13 buttons you're going to be disappointed.

## BE CREATIVE

The point of HappyFunTimes is to make **NEW EXPERIENCES**. What can you do with 16 to 30 players?

What this script does do is give you an easy way to get started. You can take any HTML5 engine
that supports the Gamepad API, add this script and get HappyFunTimes support. Of course it's
up to you to design a game that plays well with lots of players.

Once you get started [please consider getting even more creative](http://blog.happyfuntimes.net/blog/thinking-outside-the-box-making-hft-games/).

## Options

There's few options you can specify in your script tag. For example you can set the controller to 1 of 6 types
using a script tag like

    <script src="happyfuntimes-gamepad-emu.js" hft-options='{controllerType:"1dpad-1button"}'></script>

Controller Types:

*   1button

    <img width="50%" height="50%" src="assets/1button.png" />

*   2button

    <img width="50%" height="50%" src="assets/2button.png" />

*   1dpad-1button

    <img width="50%" height="50%" src="assets/1dpad-1button.png" />

*   1dpad-2button

    <img width="50%" height="50%" src="assets/1dpad-2button.png" />

*   1dpad

    <img width="50%" height="50%" src="assets/1dpad.png" />

*   2dpad

    <img width="50%" height="50%" src="assets/2dpad.png" />

    Note: 2dpad reports the 2nd dpad on `gamepad.axes[2]` and `gamepad.axes[3]` as well as
    `gamepad.button[16]`, `gamepad.button[17]`, `gamepad.button[18]`, `gamepad.button[19]`

You can also set a few boolean options in the form of

    <script src="happyfuntimes-gamepad-emu.js" hft-options='{option:true}'></script>

Or example setting all options might look like this

    <script
       src="happyfuntimes-gamepad-emu.js"
       hft-options='{
         controllerType: "2dpad",
         dpadToAxis: false,
         axisOnly: true,
         reportMapping: true,
         maxGamepads: 16,
       }'></script>

`dpadToAxis`

normally dpad values show up as both buttons and axes. Settings this to false means
they will only show up as buttons

`axesOnly`

settings this to true means dpad values will only show up as axes.

`reportMapping`

Gamepads have a `mapping` field. The spec only defines 2 values, `"standard"` and `"".
This script defaults to reporting `standard` even though it can't support all 14 inputs
and 4 axes. Setting `reportMapping` to true will make the script report
`happyfuntimes-<controllerType>-controler` so your game can check for that if you want.

`maxGampads`

Let's you set a maximum number of gamepads. The default is unlimited.
If you set this then when more than that many phones connect those players
over the limit will be put in a waiting list. If other players quit they'll
be added to the game in the order they connected. Also see `queue` in [API](#api)

## API

There's a few extra properties on gamepad objects provided by this script.

`color`

color is a CSS color. By default the script tries to give each controller a unique
color. You can look at this field in the game if you'd like to match the color
of the player's avatar to the color of the controller. Conversely you can set this
value to a valid CSS color value and the contoller will change color to match.
(eg, "red", or "#37EF4D", or "rgb(25,17,123)", etc.)

`name`

Name is the name the user set on their phone when they started playing. If they
change the name it will be updated

`netPlayer`

This is the [HappyFunTimes NetPlayer object](http://docs.happyfuntimes.net/docs/hft/NetPlayer.html).
You'd probably be better off making
a custom HappyFunTimes controller if you want to do anything um, custom? A few
things you could without a custom contoller are for example register a handler
to be notified if the user changes their name or if they're busy in the system menu.

`queue`

A function you can call to remove this gamepad from the *active* gamepads and put them
in the queue of waiting players. If you set a maxGamepads setting then any players
over the limit are in a queue of waiting players. Calling `queue` on a gamepad takes
an active player's gamepad and puts it on the waiting list letting the longest waiting
player into the game. If there no players waiting this is a no-op.

2 use cases come to mind. One, you have a life based game. Each time a player dies you
call `gamepad.queue()` on that player's gamepad letting the next player play. Another is
you have a round based game. At the end of a round you call `gamepad.queue()` on all players
to get a fresh set of players.



