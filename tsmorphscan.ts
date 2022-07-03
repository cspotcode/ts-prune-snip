// Create project
// iterate source files
// iterate declarations
// record declaration's name and span

// iterate declarations a second time
// find references
// For each reference
//    is it within a known declaration?
//        if yes, create reference from declaration
//        if no, create reference from file to declaration
// Grep codebase for identifier
// For each grepped location
//    is it within a known declaration?
//        if yes, create reference from declaration
//        if no, create reference from file

// NOTE THE ABOVE WILL CREATE SELF-REFERENCES, BUT SHOULD BE OK

// GC by following checkerreferences
//     visit entrypoints
//     visit other explicitly included declarations
// GC by following grepreferences
//     visit entrypoints
//     visit other explicitly included declarations
// Build set of things that are *only* grepreferenced, not checkerreferenced

// TODO how to report to the user about grepreferences?

// TODO how to tell pruning tool our decision re: a given declaration? (keep/delete)

// Filter diagnostics for "unreferenced local"
// Convert each to a Deletion

// Filter GC results for unreferenced declarations
// Convert each to a Deletion

// Apply deletions
//     Sort
//     Merge overlaps
//     Then apply last to first
