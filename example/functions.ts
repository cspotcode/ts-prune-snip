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