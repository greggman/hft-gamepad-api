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


