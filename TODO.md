Clean up disk space on ec2 instance
npm install
create git repo for this DCE tool

## ts-morph DCE

- Create program
- Iterate all exports
- Find all references to them
- If has no references, check for regexp of the identifier anyway
- Emit location info so that a snipping pass can remove them
- Enable `noUnusedLocals`; grep for resulting diagnostics
- Write script to remove lambdas: remove lambdas.json, apigtw.json, and `index_` file
- How to find all exports of a file?


## Current status

It is iterating exports
We identified a bug where .js exports are unavailable until the first time we loop through exports

## Next steps

- [ ] stop thinking "exports;" start thinking "declarations"
  - it doesn't actually matter if something is an export

- [x] iterate exports first to avoid that bug
- [ ] iterate exports second
  - [ ] create declaration nodes
  - [x] collect references
  - expand this iteration step to collect statements, even though they are not all "reference-able"
    - concept of "reference-able" and "non-reference-able" statements (exports are reference-able statements)
- [ ] traverse discovered statements and references
  - [ ] attribute each reference to a statement, build up the graph

then mark()
then generate excel sheet of exports
- 

## Keep in mind

- circular references should be skipped.  If a function calls itself, it can still be dead code.
- Run `unusedLocals` / `unusedImports` removal.
- Compound exports might confuse references, consider splitting them up if found in the codebase
  - implement this as a linter?  When these nodes are found, flag them?
  -
        const a = 123;
        export {a, b};
  - If b is used, it references the export statement.
  - export statement reference `const a`.
  - yet `const a` may be unused.