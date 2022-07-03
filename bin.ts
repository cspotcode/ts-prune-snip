import {$, globby} from '@cspotcode/zx';
import {} from 'clipanion';
import {} from 'ts-morph';
import { validateAPIInputSSAIGetDebugToken } from '../../src/main_validate_functions';
import { Declaration, Project, Reference } from './graph';

export interface Config {
    /** Do a git reset before DCE analysis. */
    gitReset?: boolean;
    /** Run this shell command before doing DCE analysis; useful if you keep re-running DCE a lot. */
    cmdBefore?: string;
    /** Delete these files before starting DCE analysis.  Useful when you `git reset` first. */
    deleteFiles?: string[];
    /** Entrypoint files; nothing in them or referenced by them can be DCEd */
    entrypoints: string[];
}
