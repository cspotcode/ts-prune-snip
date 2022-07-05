const {showsBug} = require('./reference-bug-foo');

const fns = require('./functions');
const jsFns = require('./functions_js');
exports.handler = function () {

    fns.isUsed();
    jsFns.jsfn;
    showsBug;
}

exports.jsfn = function this_is_js_fn() {

}
