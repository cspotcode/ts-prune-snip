export function foo() {
    bar();
}
export function bar() {
    foo();
}
export function isUsed() {
    internal();
}

function internal() {}

const varUnused = 1;
const varUsed = 2;
export {varUnused, varUsed};