export interface Config {
    /** Do a git reset before DCE analysis. */
    gitReset?: boolean;
    /** Run this shell command before doing DCE analysis; useful if you keep re-running DCE a lot. */
    cmdBefore?: string;
    /** Delete these files before starting DCE analysis.  Useful when you `git reset` first. */
    deleteFiles?: string[];
    /** Entrypoint files; nothing in them or referenced by them can be DCEd */
    entrypoints: string[];
    /** All source files.  Used when checking for grep references */
    sources: string[];
    tsConfigPath: string;
}

export const config: Config = {
    gitReset: false,
    deleteFiles: [
        'src/index_ui_*'
    ],
    entrypoints: [
        'src/index_*'
    ],
    sources: [
        'src/**/*.js',
        'src/**/*.ts'
    ],
    tsConfigPath: 'example/tsconfig.json'
};

export default config;