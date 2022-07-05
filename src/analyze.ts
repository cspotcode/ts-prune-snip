import {EnumDeclaration, ExportDeclaration, Project as TsProject, ExportedDeclarations, ExpressionStatement, SyntaxKind, SourceFile, Node, Identifier, ObjectBindingPattern, ArrayBindingElement, ArrayBindingPattern, StringLiteral, ReferenceFindableNode, createWrappedNode, PropertyAccessExpression, ScriptKind} from 'ts-morph';
import { Config, LoadedConfig } from './config';
import Path from 'path';
import { createSpan, Declaration, GraphFactory, Project, File, GraphNodeKind, GraphNode, Span } from './graph';
import { globby } from '@cspotcode/zx';
import assert from 'assert';
import { GcFlag, mark, resetGcFlags } from './gc';
import { getLoggableFilename, getLoggableLocation } from './logging';
import { groupBy, mapValues, uniq } from 'lodash';
import { applyCollapsedEdits, collapseSpans } from './snipping';
import fs from 'fs';
import {createUi} from './ui';
import { createReferencesBugWorkaroundApi } from './reference-bug-workaround';
import { forEachDeclarationOrStatement, getNameIdentifier, NamedDeclarationInfo } from './iterate-declarations';
import { postprocessSource } from './string-based-postprocessing';

let log: (msg: string) => void;

export async function createProgram(config: LoadedConfig) {

    const ui = createUi();
    // ui.start();
    log = ui.state.log.bind(ui.state);
    log = console.log;

    const tsProject = new TsProject({
        tsConfigFilePath: Path.resolve(config.basedir, config.tsConfigPath),
    });

    const graphFactory = new GraphFactory();
    const project = graphFactory.createProject({
        files: []
    });

    // Iterate once to avoid ts-morph bug(?)
    for(const sf of tsProject.getSourceFiles()) {
        for(const d of forEachDeclarationOrStatement(sf)) {}
    }

    // Instantiate workaround helper
    const referencesBugWorkaroundApi = createReferencesBugWorkaroundApi(config, tsProject);
    for(const sf of tsProject.getSourceFiles()) {
        referencesBugWorkaroundApi.addFile(sf);
    }
    const referencesSourceFile = referencesBugWorkaroundApi.createSourceFile();
    if(config.emitVirtualFile)
        referencesSourceFile.saveSync();


    // Iterate again to instantiate files, declarations, and collect references
    // TODO make third element of tuple a SourceFile & position pair, not a Node
    const tuples: [NamedDeclarationInfo, Declaration, Node[]][] = [];
    for(const sourceFile of tsProject.getSourceFiles()) {
        const file = graphFactory.createFile({
            filename: sourceFile.getFilePath(),
            isEntrypoint: config.entrypointsGlobbedAbs.includes(sourceFile.getFilePath()),
            sourceFile
        });
        project.files.push(file);
        ui.state.filesInProjectCount = project.files.length;
        file.gcFlags |= GcFlag.didReferenceSearch;

        log(`- FILE ${ getLoggableFilename(file.filename) }`);
        for(const d of forEachDeclarationOrStatement(sourceFile)) {
            const isExportDotEquals = d.statement.asKind(SyntaxKind.ExpressionStatement)?.getExpression().asKind(SyntaxKind.BinaryExpression)?.getLeft().asKind(SyntaxKind.PropertyAccessExpression)?.getExpression().getText() === 'exports';

            const graphDeclaration = graphFactory.createDeclaration({
                file,
                statement: d.statement,
                span: isExportDotEquals ? createSpan(d.statement) : createSpan((d as NamedDeclarationInfo).declaration ?? d.statement),
                isExport: d.isExport
            });
            file.declarations.push(graphDeclaration);
            if(d.hasName) {
                graphDeclaration.name = d.nameString;
                log(`  - ${d.isExport ? 'EXPORT' : 'LOCAL'} ${d.nameString} ${getLoggableLocation(d.name ?? d.declaration)}`);
                let refs: Node[];
                try {
                    refs = d.referenceFindableNode.findReferencesAsNodes();
                } catch(e: unknown) {
                    if((e as Error).message.includes('A language service is required')) {
                        log(`using language service for ${d.referenceFindableNode.getFullText()}`);
                        refs = tsProject.getLanguageService().findReferencesAsNodes(d.referenceFindableNode);
                    } else {
                        throw e;
                    }
                }
                const moreRefs = tsProject.getLanguageService().findReferencesAtPosition(referencesSourceFile, referencesBugWorkaroundApi.getExportPosition(sourceFile, d.nameString)!);
                for(const r of moreRefs) {
                    refs.push(r.getDefinition().getNode());
                    for(const r2 of r.getReferences()) {
                        refs.push(r2.getNode());
                    }
                }
                refs = uniq(refs);

                // TODO use the workaround to find more references

                graphDeclaration.gcFlags |= GcFlag.didReferenceSearch;
                tuples.push([d, graphDeclaration, refs]);
                log(refs.map(r => `    - REF ${getLoggableLocation(r)}`).join('\n'));
            } else {
                log(`  - <statement> ${getLoggableLocation(d.statement)}`);
            }
            if(ui.occasionallyAwait()) await null;
        }
    }

    // Now that all files and declarations are instantiated, iterate all references,
    // creating "usage" edges in the graph
    for(const [exportInfo, declaration, references] of tuples) {
        for (const referenceNode of references) {
            const fileContainingReference = getFile(project, referenceNode);
            if(!fileContainingReference) continue;
            assert(fileContainingReference, `File not found in project: ${referenceNode.getSourceFile().getFilePath()}\nProject contains files:\n${project.files.map(f => f.filename).join('\n')}`);
            const declarationContainingReference = getDeclaration(fileContainingReference, referenceNode);
            /*
             * Get target file
             * Iterate file's declarations, finding one that wraps this node's position.
             * If no such declaration found, attribute the reference to the file instead.
             */
            const checkerUsage = graphFactory.createCheckerUsage({
                location: referenceNode.getStart(),
                containingDeclaration: declarationContainingReference,
                target: declaration
            });
            if(declarationContainingReference) {
                log(`USAGE ${getLoggableFilename(declarationContainingReference.file.filename)} ${declarationContainingReference.name} USES ${getLoggableFilename(declaration.file.filename)} ${declaration.name}`);
                declarationContainingReference.checkerUsages.push(checkerUsage);
            } else {
                log(`ORPHANED USAGE ${getLoggableFilename(fileContainingReference.filename)} USES ${getLoggableFilename(declaration.file.filename)} ${declaration.name}`);
                fileContainingReference.orphanedCheckerUsages.push(checkerUsage);
            }
            ui.state.analyzedReferencesCount++;
            if(ui.occasionallyAwait()) await null;
        }
    }

    log('Marking all reachable statements...');
    mark(project, GcFlag.reachableByChecker, {
        followGrepReferences: false
    });

    function reachable(node: GraphNode) {
        return node.gcFlags & GcFlag.reachableByChecker || !(node.gcFlags & GcFlag.didReferenceSearch);
    }

    log = console.log;

    // NOTE: cannot check the file node's reachability bit.
    // Must check each declaration within the file.
    log('Unreachable files:');
    const unreachableFiles = new Set<File>();
    for(const file of graphFactory.nodes) {
        if(file.kind === GraphNodeKind.File) {
            if(file.declarations.every(d => !reachable(d)) && config.sourcesGlobbedAbs.includes(file.filename)) {
                log(`- ${getLoggableFilename(file.filename)}`);
                unreachableFiles.add(file);
            }
        }
    }

    const unreachableFilenames = new Set<string>();
    for(const f of unreachableFiles) {
        unreachableFilenames.add(f.filename);
    }

    const spansToRemove: [string, Span][] = [];

    log('Unreachable statements:');
    for(const declaration of graphFactory.nodes) {
        if(declaration.kind === GraphNodeKind.Declaration && !reachable(declaration) && !unreachableFiles.has(declaration.file) && config.sourcesGlobbedAbs.includes(declaration.file.filename)) {
            log(`- ${declaration.name ?? '<statement>'} (in ${getLoggableFilename(declaration.file.filename)}:${declaration.statement.getStartLineNumber()})`);
            spansToRemove.push([declaration.file.filename, declaration.span]);
        }
    }

    const groupedSpans = mapValues(groupBy(spansToRemove, ([filename]) => filename), v => v.map(([f, s]) => s));
    for(const [filename, spans] of Object.entries(groupedSpans)) {
        if(unreachableFilenames.has(filename)) continue;
        const sourceBefore = getFile(project, filename).sourceFile.getFullText();
        const extendedSpans = spans.map(s => {
            if(sourceBefore[s.end] === '\n') return {
                ...s,
                end: s.end + 1
            }
            return s;
        });
        const collapsedSpans = collapseSpans(extendedSpans);
        const linesBefore = sourceBefore.split('\n').length;
        let sourceAfter = applyCollapsedEdits(sourceBefore, collapsedSpans);
        sourceAfter = postprocessSource(sourceAfter);

        const linesAfter = sourceAfter.split('\n').length;
        log(`${getLoggableFilename(filename)} has ${linesBefore - linesAfter} lines of code to be removed.`);
        if(config.emit) {
            fs.writeFileSync(filename, sourceAfter);
        }
    }

    for(const file of unreachableFiles) {
        if(config.emit) {
            fs.rmSync(file.filename);
        }
    }
}


/** Given a (grand)child of a descendent, return the *direct* child of the descendent that contains the (grand)child */
function ascendToDirectChild(parent: Node, node: Node) {
    let _node: Node | undefined = node;
    while(_node.getParent()?.compilerNode !== parent.compilerNode) {
        _node = _node.getParent();
        assert(_node != null);
    }
    return _node;
}

export function getParentTopLevelStatement(node: Node) {
    const ret = ascendToDirectChild(node.getSourceFile(), node);
    // This didn't work; pretty sure I got mixed up on the logic
    // const ret = node.getParentWhile((parent, child) => !parent.isKind(SyntaxKind.SourceFile));
    assert(ret);
    return ret;
}

function getFile(project: Project, node: Node): File;
function getFile(project: Project, filename: string): File;
function getFile(project: Project, arg: Node | string) {
    // TODO optimize this search
    const filename = (arg as Node).getSourceFile?.().getFilePath() ?? arg;
    return project.files.find(file =>
        file.filename === filename
    );
}

function getDeclaration(file: File, node: Node) {
    const start = node.getStart();
    // const end = node.getEnd();

    // TODO optimize this search
    return file.declarations.find(d =>
        d.span.start <= start && d.span.end > start
    );
}

