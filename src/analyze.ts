import {EnumDeclaration, ExportDeclaration, Project as TsProject, ExportedDeclarations, ExpressionStatement, SyntaxKind, SourceFile, Node, Identifier, ObjectBindingPattern, ArrayBindingElement, ArrayBindingPattern, StringLiteral, ReferenceFindableNode, createWrappedNode, PropertyAccessExpression} from 'ts-morph';
import { Config, LoadedConfig } from './config';
import Path from 'path';
import { createSpan, Declaration, GraphFactory, Project, File, GraphNodeKind, GraphNode, Span } from './graph';
import { globby } from '@cspotcode/zx';
import assert from 'assert';
import { GcFlag, mark, resetGcFlags } from './gc';
import { getLoggableFilename, getLoggableLocation } from './logging';
import { groupBy, mapValues } from 'lodash';
import { applyCollapsedEdits, collapseSpans } from './snipping';
import fs from 'fs';
import {createUi} from './ui';

let log: (msg: string) => void;

export async function createProgram(config: LoadedConfig) {

    const ui = createUi();
    // ui.start();
    log = ui.state.log.bind(ui.state);

    const tsProject = new TsProject({
        tsConfigFilePath: Path.resolve(config.basedir, config.tsConfigPath),
    });

    const graphFactory = new GraphFactory();
    const project = graphFactory.createProject({
        files: []
    });

    // Iterate once to avoid ts-morph bug(?)
    for(const sf of tsProject.getSourceFiles()) {
        for(const d of forEachSourceFileExportOrStatement(sf)) {}
    }
    for(const sf of tsProject.getSourceFiles()) {
        for(const d of forEachSourceFileExportOrStatement(sf)) {}
    }

    // Iterate again to instantiate files, declarations, and collect references
    const tuples: [ExportInfo, Declaration, Node[]][] = [];
    for(const sourceFile of tsProject.getSourceFiles()) {
        const file = graphFactory.createFile({
            filename: sourceFile.getFilePath(),
            isEntrypoint: config.entrypointsGlobbedAbs.includes(sourceFile.getFilePath()),
            sourceFile
        });
        project.files.push(file);
        ui.state.filesInProjectCount = project.files.length;
        file.gcFlags |= GcFlag.didReferenceSearch;

        log(`- ${ getLoggableFilename(file.filename) }`);
        for(const d of forEachSourceFileExportOrStatement(sourceFile)) {
            const graphDeclaration = graphFactory.createDeclaration({
                file,
                statement: d.statement,
                span: createSpan(d.statement),
                isExport: d.isExport
            });
            file.declarations.push(graphDeclaration);
            if(d.isExport) {
                graphDeclaration.name = d.exportName;
                log(`  - <export> ${d.exportName} ${getLoggableLocation(d.name ?? d.declaration)}`);
                let refs: Node[];
                try {
                    refs = d.referenceFindableNode.findReferencesAsNodes();
                } catch(e) {
                    if(e.message.includes('A language service is required')) {
                        refs = tsProject.getLanguageService().findReferencesAsNodes(d.referenceFindableNode);
                    } else {
                        throw e;
                    }
                }
                graphDeclaration.gcFlags |= GcFlag.didReferenceSearch;
                tuples.push([d, graphDeclaration, refs]);
                log(refs.map(r => `    - ${getLoggableLocation(r)}`).join('\n'));
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
                declarationContainingReference.checkerUsages.push(checkerUsage);
            } else {
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
            log(`- ${declaration.name ?? '<statement>'} (in ${getLoggableFilename(declaration.file.filename)}:${declaration.statement.getStartLineNumber()})`)
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
        const sourceAfter = applyCollapsedEdits(sourceBefore, collapsedSpans);
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

interface ExportInfo {
    isExport: true,
    /** Direct child of SourceFile */
    statement: Node;
    declaration: Node;
    name: NameNode;
    /** node suitable for "find all references" queries */
    referenceFindableNode: ReferenceFindableNode;
    /** Name of the export, null if it is `export =` assignment */
    exportName: string;
    obtainedViaAlternateMethod: boolean;
}
interface StatementInfo {
    isExport: false;
    statement: Node;
}

/**
 * Iterate top-level statements, whether or not they are exports,
 * and return useful info about each.
 */
function* forEachSourceFileExportOrStatement(sf: SourceFile): Iterable<ExportInfo | StatementInfo> {
    const visited = new Set();
    for(const ed of sf.getExportedDeclarations()) {
        for(const declaration of ed[1]) {
            const statement = getParentTopLevelStatement(declaration);
            // assert(!visited.has(declaration));
            // assert(!visited.has(statement), `${getLoggableLocation(statement)}`);
            if(visited.has(declaration)) continue;
            visited.add(declaration);
            visited.add(statement);
            // log(`visited ${getLoggableLocation(statement)} via:\n${declaration.getFullText().slice(0, 300).split('\n').map(l => `> ${l}`).join('\n')}`);
            log(`visited ${getLoggableLocation(statement)}`);
            const name = getNameIdentifier(declaration);
            const referenceFindableNode = getReferenceFindable(declaration);
            yield {
                isExport: true,
                exportName: ed[0],
                statement,
                declaration,
                name,
                obtainedViaAlternateMethod: false,
                referenceFindableNode
            };
        }
    }
    for(const statement of sf.getStatements()) {
        if(visited.has(statement)) continue;
        const be = statement.asKind(SyntaxKind.ExpressionStatement)?.getExpression().asKind(SyntaxKind.BinaryExpression);
        if(be?.getOperatorToken().isKind(SyntaxKind.EqualsToken)) {
            const propAccess = be.getLeft().asKind(SyntaxKind.PropertyAccessExpression);
            if(visited.has(propAccess)) continue;
            if(propAccess?.getExpression().asKind(SyntaxKind.Identifier)?.getText() === 'exports') {
                // assert(false, 'This statement should have been identified as an export');
            }
        }
        yield {
            isExport: false,
            statement
        };
        //         const exportName = propAccess.getName();
        //         const exportNameIdentifier = propAccess.getNameNode();
        //         const referenceFindableNode = getReferenceFindable(propAccess);
        //         yield {
        //             exportName,
        //             name: exportNameIdentifier,
        //             declaration: propAccess,
        //             statement,
        //             obtainedViaAlternateMethod: true,
        //             referenceFindableNode,
        //         };
        //     }
        // }
    }
}

type NameNode = Identifier | ObjectBindingPattern | ArrayBindingPattern | StringLiteral;
function getNameIdentifier(node: ExportedDeclarations): NameNode {
    const ret = node.asKind(SyntaxKind.ClassDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.InterfaceDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.EnumDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.FunctionDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.VariableDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.TypeAliasDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.ModuleDeclaration)?.getNameNode();
    // Expression | SourceFile
    if(ret) return ret;

    // Maybe it's `exports.foo = ` expression
    const propAccessExpr = node.asKind(SyntaxKind.PropertyAccessExpression);
    if(propAccessExpr?.getExpression().asKind(SyntaxKind.Identifier)?.getText() === 'exports') {
        return propAccessExpr.getNameNode();
    }

    // Maybe it's `someFunctionDeclaration.foo = ` expression (TODO dedupe with logic above for perf)
    if(
        node.getParent()?.asKind(SyntaxKind.PropertyAccessExpression)?.getExpression() === node &&
        node.getParent()?.getParent()?.asKind(SyntaxKind.BinaryExpression)?.getOperatorToken().asKind(SyntaxKind.EqualsToken)
    ) {
        return node.getParent().asKind(SyntaxKind.PropertyAccessExpression)?.getNameNode();
    }

    // Maybe it's Object.defineProperty(exports, 'foo', {` statement
    const callExpr = node.asKind(SyntaxKind.CallExpression);
    const callExprExpr = callExpr?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if(callExprExpr?.getExpression().asKind(SyntaxKind.Identifier)?.getText() === 'Object' && callExprExpr.getName() === 'defineProperty') {
        if(callExpr.getArguments()[0].asKind(SyntaxKind.Identifier).getText() === 'exports') {
            log(`WARNING found defineProperty call on exports; this makes static analysis difficult.  Recommend refactoring into a getter function.\n${getLoggableLocation(callExpr)}`);
        }
    }

    const tryGetJsDocTypedefName = node.asKind(SyntaxKind.JSDocTypedefTag)?.compilerNode.name;
    if(tryGetJsDocTypedefName) return createWrappedNode(tryGetJsDocTypedefName);

    if(node.isKind(SyntaxKind.BindingElement) && node.getParent()?.getParent().isKind(SyntaxKind.VariableDeclaration)) {
        // is `export const {foo} = bar;`; skip for now
        return undefined;
    }

    assert(ret != null, `${ node.getKindName() } ${getLoggableLocation(node)} ${node.getFullText()}`);
    return ret;
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

function getParentTopLevelStatement(node: Node) {
    const ret = ascendToDirectChild(node.getSourceFile(), node);
    // This didn't work; pretty sure I got mixed up on the logic
    // const ret = node.getParentWhile((parent, child) => !parent.isKind(SyntaxKind.SourceFile));
    assert(ret);
    return ret;
}

function getReferenceFindable(node: ExportedDeclarations) {
    let ret: Node | undefined = getNameIdentifier(node) ?? node;
    while(!Node.isReferenceFindable(ret)) {
        ret = ret.getParent();
        assert(ret);
    }
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