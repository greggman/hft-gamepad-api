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
define([
    '.io',
  ], function(
    io) {

  "use strict";

  var g = {
    client: undefined,
    connectedState: undefined,   // connected or not?
  };

  var noop = function() {
  };

  var connectedStateFuncs = {
    init_offline: function() {
      checkForHFT();
    },
    init_connectedToHappyFunTimes: function() {
    },
  };

  var setConnectedState = function(state) {
    if (g.connectedState != state) {
      g.connectedState = state;
      var initFn = connectedStateFuncs["init_" + state];
      if (!initFn) {
        console.error("unknown connected state: " + state);
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
      g.session.set("hft-version", hftInfo.apiVersion);
    });
  };

  var checkForHFT = function() {
    var checkForHFTCallback = function(err, obj) {
      if (err) {
        setTimeout(checkForHFT, 1000);
        return;
      }

      if (g.appHelp) {
        tryToConnectToHFT();
      } else {
        // load apphelp async from happyFunTimes
        requirejs(['hftapp/apps/apphelp'], function(LoadedAppHelp) {
          g.appHelp = LoadedAppHelp;
          tryToConnectToHFT();
        });
      }
    }
    io.sendJSON("http://localhost:18679/", {cmd: 'happyFunTimesPing'}, checkForHFTCallback, { timeout: 1000 });
  };

  var init = function(options) {
    g.session = options.session;
    setConnectedState("offline");
  };

  return {
    init: init,
  };
}());







