import Path from 'path';
import {globby} from '@cspotcode/zx';

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
    emitVirtualFile?: boolean;
    emit: boolean;
    preserveLineNumbers?: boolean;
    skipReferenceDiscovery: string[];
}

export interface LoadedConfig extends Config {
    basedir: string;
    entrypointsGlobbedAbs: string[];
    sourcesGlobbedAbs: string[];
    skipReferenceDiscoveryGlobbedAbs: string[];
}

export async function readConfig(configPath: string, cwd: string = process.cwd()): Promise<LoadedConfig> {
    const configPathAbs = Path.resolve(cwd, configPath);
    const configModule = require(configPathAbs);
    const config = (configModule?.config ?? configModule?.default ?? configModule) as Config;
    const basedir = Path.dirname(configPathAbs);
    const entrypointsGlobbedAbs = (await globby(config.entrypoints, {absolute: true, cwd: basedir}));
    const sourcesGlobbedAbs = (await globby(config.sources, {absolute: true, cwd: basedir}));
    const skipReferenceDiscoveryGlobbedAbs = (await globby(config.skipReferenceDiscovery, {absolute: true, cwd: basedir}));
    return {
        basedir,
        entrypointsGlobbedAbs,
        sourcesGlobbedAbs,
        skipReferenceDiscoveryGlobbedAbs,
        ...config,
    }
}
