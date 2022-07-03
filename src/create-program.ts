import {EnumDeclaration, ExportDeclaration, Project, ExportedDeclarations, ExpressionStatement, SyntaxKind, SourceFile, Node} from 'ts-morph';
import { Config } from './config';
import Path from 'path';
import { createSpan, NodeFactory } from './graph';
import { globby } from '@cspotcode/zx';
import assert from 'assert';

export async function createProgram(config: Config) {
    const project = new Project({
        tsConfigFilePath: config.tsConfigPath,
    });

    const entrypoints = (await globby(config.entrypoints)).map(s =>
        Path.resolve(s)
    );

    const nodeFactory = new NodeFactory();
    const pruneProject = nodeFactory.createProject({
        files: []
    });

    for(const sf of project.getSourceFiles()) {
        const file = nodeFactory.createFile({
            filename: sf.getFilePath(),
            isEntrypoint: entrypoints.includes(sf.getFilePath())
        });
        pruneProject.files.push(file);

        console.log(file.filename);
        for(const d of forEachSourceFileExport(sf)) {
            console.log(`- ${d.exportName} ${JSON.stringify(d.statement.getFullText())}`);
        }

        // for(const ea of sf.getExportAssignments()) {
        //     console.dir({file: sf.getFilePath(), exportName: ea.getSymbol()?.getName()});
        // }
        // for(const ed of sf.getExportDeclarations()) {
        //     console.dir({file: sf.getFilePath(), exportName: ed.getSymbol()?.getName()});
        // }
        // for(const ed of sf.getExportedDeclarations()) {
        //     console.dir({
        //         file: sf.getFilePath(),
        //         ed0: ed[0],
        //         kind: ed[1][0].getKindName(),
        //     });
        //     for(const d of ed[1]) {
        //         visited.add(d);
        //         const declaration = nodeFactory.createDeclaration({
        //             file,
        //             name: ed[0],
        //             span: createSpan(d),
        //         });
        //         file.declarations.push(declaration);
        //     }
        // }
        // for(const statement of sf.getStatements()) {
        //     if(visited.has(statement)) continue;
        //     const be = statement.asKind(SyntaxKind.ExpressionStatement)?.getExpression().asKind(SyntaxKind.BinaryExpression);
        //     if(be?.getOperatorToken().isKind(SyntaxKind.EqualsToken)) {
        //         const propAccess = be.getLeft().asKind(SyntaxKind.PropertyAccessExpression);
        //         if(propAccess?.getExpression().asKind(SyntaxKind.Identifier)?.getText() === 'exports') {
        //             const exportName = propAccess.getName();
        //             const references = propAccess.getNameNode().findReferencesAsNodes();
        //             console.dir({
        //                 file: sf.getFilePath(),
        //                 exportName,
        //                 text: statement.getFullText(),
        //                 references: references.map(r => [r.getFullText(), r.getStartLineNumber(), r.getSourceFile().getFilePath()]),
        //             });
        //             continue;
        //         }
        //     }
        //     console.dir({
        //         file: sf.getFilePath(),
        //         kind: statement.getKindName(),
        //         text: statement.getFullText(),
        //     });
        // }
    }
}

interface ExportInfo {
    /** Direct child of SourceFile */
    statement: Node;
    /** node suitable for "find all references" queries */
    identifier: Node;
    /** Name of the export, null if it is `export =` assignment */
    exportName: string;
}

function* forEachSourceFileExport(sf: SourceFile): Iterable<ExportInfo> {
    const visited = new Set();
    for(const ed of sf.getExportedDeclarations()) {
        for(const decl of ed[1]) {
            const statement = ascendToDirectChild(sf, decl);
            if(visited.has(statement)) continue;
            visited.add(statement);
            const name = getNameIdentifier(decl);
            yield {
                exportName: ed[0],
                statement: decl,
                identifier: name,
            };
        }
    }
    for(const statement of sf.getStatements()) {
        if(visited.has(statement)) continue;
        const be = statement.asKind(SyntaxKind.ExpressionStatement)?.getExpression().asKind(SyntaxKind.BinaryExpression);
        if(be?.getOperatorToken().isKind(SyntaxKind.EqualsToken)) {
            const propAccess = be.getLeft().asKind(SyntaxKind.PropertyAccessExpression);
            if(propAccess?.getExpression().asKind(SyntaxKind.Identifier)?.getText() === 'exports') {
                const exportName = propAccess.getName();
                const exportNameIdentifier = propAccess.getNameNode();
                yield {
                    exportName,
                    identifier: exportNameIdentifier,
                    statement
                };
            }
        }
    }
}

function getNameIdentifier(node: ExportedDeclarations) {
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