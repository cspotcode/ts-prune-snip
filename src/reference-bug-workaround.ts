import { Project as TsProject, ScriptKind, SourceFile } from "ts-morph";
import Path from "path";
import { LoadedConfig } from "./config";

/**
 * Workaround for a TS bug.
 * Keeping it here to make it easier to rip out of this library when TS fixes the bug.
 * 
 * Import all exports from all files into a virtual file.
 */
export function createReferencesBugWorkaroundApi(config: LoadedConfig, tsProject: TsProject) {
    // Collect all exports from all files
    let virtualSourceFileText = '';
    let next = 0;
    const mapping = new Map<string, Map<string, number>>();

    function addFile(sf: SourceFile) {
        const m = new Map<string, number>();
        mapping.set(sf.getFilePath(), m);

        for(const sym of sf.getExportSymbols()) {
            const partA = 'const {';
            const partB = `${sym.getName()}} = require('${sf.getFilePath().replace(/\.ts$/, '')}');\n`;
            m.set(sym.getName(), virtualSourceFileText.length + partA.length);
            virtualSourceFileText += partA + partB;
        }
    }

    // function addExportInFile(sf: SourceFile, exportName: string) {
    //     const partA = 'const {';
    //     const partB = `${sym.getName()}} = require('${sf.getFilePath().replace(/\.ts$/, '')}');\n`;
    //     m.set(sym.getName(), virtualSourceFileText.length + partA.length);
    //     virtualSourceFileText += partA + partB;
    // }

    function createSourceFile() {
        // const start = virtualSourceFileMapping.get('/home/ubuntu/dev/brain-dce/alive-brain-lambda/tools/dce/example/reference-bug-foo.js')?.get('showsBug')!;
        // assert.equal(virtualSourceFileText.slice(start, start + 8), 'showsBug');

        const virtualSourceFile = tsProject.createSourceFile(Path.resolve(config.basedir, '__virtual__.js'), virtualSourceFileText, {
            scriptKind: ScriptKind.JS
        });

        return virtualSourceFile;
        // virtualSourceFile.saveSync();
    }

    function getExportPosition(sf: SourceFile | string, exportName: string) {
        const sfPath = (sf as SourceFile)?.getFilePath() ?? sf;
        return mapping.get(sfPath)?.get(exportName);
    }

    return {
        addFile, createSourceFile, getExportPosition
    }
}