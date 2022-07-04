import {EnumDeclaration, ExportDeclaration, Project as TsProject, ExportedDeclarations, ExpressionStatement, SyntaxKind, SourceFile, Node, Identifier, ObjectBindingPattern, ArrayBindingElement, ArrayBindingPattern, StringLiteral, ReferenceFindableNode} from 'ts-morph';
import { Config, LoadedConfig } from './config';
import Path from 'path';
import { createSpan, Declaration, NodeFactory, Project, File } from './graph';
import { globby } from '@cspotcode/zx';
import assert from 'assert';

export async function createProgram(config: LoadedConfig) {
    const tsProject = new TsProject({
        tsConfigFilePath: Path.resolve(config.basedir, config.tsConfigPath),
    });

    const entrypoints = (await globby(config.entrypoints)).map(s =>
        Path.resolve(config.basedir, s)
    );

    const nodeFactory = new NodeFactory();
    const project = nodeFactory.createProject({
        files: []
    });

    // Iterate once to avoid ts-morph bug(?)
    for(const sf of tsProject.getSourceFiles()) {
        for(const d of forEachSourceFileExportOrStatement(sf)) {}
    }

    // Iterate again to instantiate files, declarations, and collect references
    const tuples: [ExportInfo, Declaration, Node[]][] = [];
    for(const sourceFile of tsProject.getSourceFiles()) {
        const file = nodeFactory.createFile({
            filename: sourceFile.getFilePath(),
            isEntrypoint: entrypoints.includes(sourceFile.getFilePath()),
            sourceFile
        });
        project.files.push(file);

        console.log(`- ${ Path.relative(process.cwd(), file.filename) }`);
        for(const d of forEachSourceFileExportOrStatement(sourceFile)) {
            const graphDeclaration = nodeFactory.createDeclaration({
                file,
                statement: d.statement,
                span: createSpan(d.statement)
            });
            file.declarations.push(graphDeclaration);
            if(d.isExport) {
                graphDeclaration.name = d.exportName;
                console.log(`  - <export> ${d.exportName} ${getLoggableLocation(d.name)}`);
                const refs = d.referenceFindableNode.findReferencesAsNodes();
                tuples.push([d, graphDeclaration, refs]);
                console.log(refs.map(r => `    - ${getLoggableLocation(r)}`).join('\n'));
            } else {
                console.log(`  - <statement> ${getLoggableLocation(d.statement)}`);
            }
        }
    }

    // Now that all files and declarations are instantiated, iterate all references,
    // creating "usage" edges in the graph
    for(const [exportInfo, declaration, references] of tuples) {
        for (const referenceNode of references) {
            const fileContainingReference = getFile(project, referenceNode);
            assert(fileContainingReference);
            const declarationContainingReference = getDeclaration(fileContainingReference, referenceNode);
            /*
             * Get target file
             * Iterate file's declarations, finding one that wraps this node's position.
             * If no such declaration found, attribute the reference to the file instead.
             */
            const checkerUsage = nodeFactory.createCheckerUsage({
                location: referenceNode.getStart(),
                containingDeclaration: declarationContainingReference,
                target: declaration
            });
            if(declarationContainingReference) {
                declarationContainingReference.checkerUsages.push(checkerUsage);
            } else {
                fileContainingReference.orphanedCheckerUsages.push(checkerUsage);
            }
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
            const statement = ascendToDirectChild(sf, declaration);
            assert(!visited.has(declaration));
            assert(!visited.has(statement));
            if(visited.has(declaration)) continue;
            visited.add(declaration);
            visited.add(statement);
            const name = getNameIdentifier(declaration);
            const referenceFindableNode = getReferenceFindable(declaration);
            yield {
                isExport: true,
                exportName: ed[0],
                statement,
                declaration,
                name: name,
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
    const propAccessExpr = node.asKind(SyntaxKind.PropertyAccessExpression);
    if(propAccessExpr?.getExpression().asKind(SyntaxKind.Identifier)?.getText() === 'exports') {
        return propAccessExpr.getNameNode();
    }
    console.log(node.getKindName());
    console.log(node.getFullText());
    assert(ret != null);
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
    const ret = node.getParentWhile((parent, child) => !parent.isKind(SyntaxKind.SourceFile));
    assert(ret);
    return ret;
}

function getReferenceFindable(node: ExportedDeclarations) {
    let ret: Node | undefined = getNameIdentifier(node);
    while(!Node.isReferenceFindable(ret)) {
        ret = ret.getParent();
        assert(ret);
    }
    return ret;
}

function getLoggableLocation(node: Node) {
    const path = Path.relative(process.cwd(), node.getSourceFile().getFilePath());
    const line = node.getStartLineNumber();
    return `${path}:${line}`;
}

function getFile(project: Project, node: Node) {
    // TODO optimize this search
    return project.files.find(file => {
        file.sourceFile === node.getSourceFile()
    });
}

function getDeclaration(file: File, node: Node) {
    const start = node.getStart();
    // const end = node.getEnd();

    // TODO optimize this search
    return file.declarations.find(d =>
        d.span.start <= start && d.span.end > start
    );
}