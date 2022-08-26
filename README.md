# ts-prune-snip

This CLI tool uses the TypeScript language service to identify unused code and remove it from the codebase, *so that the results can be committed to version control.*

This is different than typical dead code elimination where unused code is removed from a production build but *not* from the codebase.

The goal is slightly different here:
to identify code in a large codebase that nobody is using so that it can be reviewed and deleted from the source code.

## Usage

This tool is a WIP, a prototype.  In lieu of a proper usage guide, consult the example:

- [example](example)
- [configuration file](example/config.ts)
- [to run the tool](example/run-example.sh)
