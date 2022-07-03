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
