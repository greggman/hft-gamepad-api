(function (root, factory) {
    if (false && typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        root.HFTConnect = factory();
        root.HFTConnect.init();
    }
}(this, function () {

