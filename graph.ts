
// Note:
// References here are a bit different than you might expect.
// 
// If the body of a function A contains a call to a function B, then we say that function A refers to function B.
//
// This is a bit different than TS's language service, where the reference is between the declaration of function B and
// the function call's identifier.  The call's identifier is *within* function A, but the language service doesn't
// necessary say that function A refers to function B.
//
// We need to think about how function A's body refers to function B, because that drives garbage collection of dead
// code.

export interface Project {
    files: File[];
}
export interface File {
    isEntrypoint: boolean;
    filename: string;
    declarations: Declaration[];
    orphanedReferences: CheckerReference[];
    orphanedGrepReferences: GrepReference[];
}

export interface Declaration {
    file: File;
    name: string;
    span: Span;
    references: CheckerReference[];
    grepReferences: GrepReference[];
}

export interface Span {
    start: number;
    end: number;
}

export type Reference = GrepReference | CheckerReference;
export interface BaseReference {
    containingDeclaration: Declaration | null;
    location: number;
    declaration: Declaration;
}

/**
 * A grep reference is where we found a declaration's name elsewhere in the code, but we're not sure
 * if it's a real reference, or merely a coincidence/code comment.  Maybe two functions have the same name.
 */
export interface GrepReference extends BaseReference {}
/**
 * A checker reference means that the typechecker was able to link two AST nodes, which is pretty definitive
 * evidence that one bit of code relies on another.
 */
export interface CheckerReference extends BaseReference {}

// Recursively visits graph, calls callback on each item, if callback returns false, does not continue.
function visitor() {
    visit
}