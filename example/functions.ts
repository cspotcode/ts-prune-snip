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

const a = 1;
const b = 2;
export {a, b};