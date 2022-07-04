import {EnumDeclaration, ExportDeclaration, Project, ExportedDeclarations, ExpressionStatement, SyntaxKind, SourceFile, Node, Identifier, ObjectBindingPattern, ArrayBindingElement, ArrayBindingPattern, StringLiteral, ReferenceFindableNode} from 'ts-morph';
import { Config } from './config';
import Path from 'path';
import { createSpan, NodeFactory } from './graph';
import { globby } from '@cspotcode/zx';
import assert from 'assert';

export async function createProgram(cwd: string, config: Config) {
    const project = new Project({
        tsConfigFilePath: Path.resolve(cwd, config.tsConfigPath),
    });

    const entrypoints = (await globby(config.entrypoints)).map(s =>
        Path.resolve(cwd, s)
    );

    const nodeFactory = new NodeFactory();
    const pruneProject = nodeFactory.createProject({
        files: []
    });

    // Iterate once to avoid ts-morph bug(?)
    for(const sf of project.getSourceFiles()) {
        for(const d of forEachSourceFileExport(sf)) {}
    }

    // Iterate again to instantiate files, declarations, and collect references
    const tuples: [ExportInfo, Node[]][] = [];
    for(const sourceFile of project.getSourceFiles()) {
        const file = nodeFactory.createFile({
            filename: sourceFile.getFilePath(),
            isEntrypoint: entrypoints.includes(sourceFile.getFilePath()),
            sourceFile
        });
        pruneProject.files.push(file);

        console.log(Path.relative(process.cwd(), file.filename));
        for(const d of forEachSourceFileExport(sourceFile)) {
            console.log(`- ${d.exportName} ${getLoggableLocation(d.name)}`);
            // console.log(`- ${d.exportName} ${JSON.stringify(d.declaration.getFullText())} ${JSON.stringify(d.statement.getFullText())} ${d.obtainedViaAlternateMethod}`);
            const refs = d.referenceFindableNode.findReferencesAsNodes();
            tuples.push([d, refs]);
            console.log(refs.map(r => `  - ${getLoggableLocation(r)}`).join('\n'));
        }
    }
}

interface ExportInfo {
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

function* forEachSourceFileExport(sf: SourceFile): Iterable<ExportInfo> {
    const visited = new Set();
    for(const ed of sf.getExportedDeclarations()) {
        for(const declaration of ed[1]) {
            const statement = ascendToDirectChild(sf, declaration);
            if(visited.has(declaration)) continue;
            visited.add(declaration);
            const name = getNameIdentifier(declaration);
            const referenceFindableNode = getReferenceFindable(declaration);
            yield {
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
                const exportName = propAccess.getName();
                const exportNameIdentifier = propAccess.getNameNode();
                const referenceFindableNode = getReferenceFindable(propAccess);
                yield {
                    exportName,
                    name: exportNameIdentifier,
                    declaration: propAccess,
                    statement,
                    obtainedViaAlternateMethod: true,
                    referenceFindableNode,
                };
            }
        }
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