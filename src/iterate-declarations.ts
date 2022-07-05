import { ArrayBindingPattern, ExportedDeclarations, Identifier, ObjectBindingPattern, ReferenceFindableNode, StringLiteral, SyntaxKind, Node, SourceFile, ImportSpecifier, BindingPattern, BindingName, VariableDeclaration, BindingElement } from "ts-morph";
import assert from 'assert';
import { getLoggableLocation } from "./logging";
import { getParentTopLevelStatement } from "./analyze";

export interface NamedDeclarationInfo {
    hasName: true;
    isExport: boolean;
    /** Direct child of SourceFile */
    statement: Node;
    declaration: Node;
    name: NameNode; // TODO is this used?
    /** node suitable for "find all references" queries */
    referenceFindableNode: ReferenceFindableNode & Node;
    /** Name of the export, null if it is `export =` assignment */
    nameString: string; // TODO is this used?
    obtainedViaAlternateMethod: boolean; // TODO remove?
}
interface StatementInfo {
    hasName: false;
    isExport: false;
    statement: Node;
}

/**
 * Iterate top-level statements, whether or not they are exports,
 * and return useful info about each.
 */
export function* forEachDeclarationOrStatement(sf: SourceFile): Iterable<NamedDeclarationInfo | StatementInfo> {
    const visited = new Set();
    for(const ed of sf.getExportedDeclarations()) {
        for(const declaration of ed[1]) {
            const statement = getParentTopLevelStatement(declaration);
            // assert(!visited.has(declaration));
            // assert(!visited.has(statement), `${getLoggableLocation(statement)}`);
            if(visited.has(declaration)) continue;
            visited.add(declaration);
            visited.add(statement);
            const name = getNameIdentifier(declaration);
            const referenceFindableNode = getReferenceFindable(declaration);
            yield {
                isExport: true,
                hasName: true,
                nameString: ed[0],
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

        // Does this statement declare things?  If so, iterate them, each is its own declaration
        const varStatement = statement.asKind(SyntaxKind.VariableStatement);
        if(varStatement) {
            for(const decl of varStatement.getDeclarations()) {
                const bindingName = decl.getNameNode();
                for(const name of traverseBindingElement(bindingName)) {
                    yield {
                        isExport: false,
                        hasName: true,
                        name,
                        nameString: name.getText(),
                        obtainedViaAlternateMethod: false,
                        referenceFindableNode: getReferenceFindable(name.getParent() as VariableDeclaration | BindingElement),
                        statement,
                        declaration: name.getParent(),
                    }
                }
            }
            continue;
        }

        const importDeclaration = statement.asKind(SyntaxKind.ImportDeclaration);
        if(importDeclaration) {
            for(const binding of importDeclaration.getNamedImports() ?? []) {
                yield {
                    hasName: true,
                    declaration: binding,
                    isExport: false,
                    name: getNameIdentifier(binding),
                    nameString: binding.getText(),
                    obtainedViaAlternateMethod: false,
                    referenceFindableNode: getReferenceFindable(binding),
                    statement: statement
                }
            }
            const nsImport = importDeclaration.getNamespaceImport();
            if(nsImport) {
                yield {
                    hasName: true,
                    name: getNameIdentifier(nsImport),
                    declaration: nsImport,
                    isExport: false,
                    nameString: nsImport.getText(),
                    obtainedViaAlternateMethod: false,
                    referenceFindableNode: getReferenceFindable(nsImport),
                    statement,
                }
            }
            continue;
        }

        const functionOrClassDeclaration = statement.asKind(SyntaxKind.FunctionDeclaration) ?? statement.asKind(SyntaxKind.ClassDeclaration);
        if(functionOrClassDeclaration) {
            yield {
                isExport: false,
                hasName: true,
                declaration: functionOrClassDeclaration,
                name: getNameIdentifier(functionOrClassDeclaration),
                nameString: getNameIdentifier(functionOrClassDeclaration).getText(),
                obtainedViaAlternateMethod: false,
                referenceFindableNode: getReferenceFindable(functionOrClassDeclaration),
                statement,
            }
        }

        // TODO legacy code?
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
            hasName: false,
            statement
        };
    }
}

function* traverseBindingElement(node: BindingName): Iterable<Identifier> {
    const obp = node.asKind(SyntaxKind.ObjectBindingPattern);
    const abp = node.asKind(SyntaxKind.ArrayBindingPattern);
    if(obp) {
        for(const e of obp.getElements()) {
            const be = e.asKind(SyntaxKind.BindingElement);
            if(!be) continue;
            for(const i of traverseBindingElement(e.asKind(SyntaxKind.BindingElement)!.getNameNode())) yield i;
        }
    } else if (abp) {
        for(const e of abp.getElements()) {
            const be = e.asKind(SyntaxKind.BindingElement);
            if(!be) continue;
            for(const i of traverseBindingElement(e.asKind(SyntaxKind.BindingElement)!.getNameNode())) yield i;
        }
    } else {
        const ident = node.asKind(SyntaxKind.Identifier);
        assert(ident);
        yield ident;
    }
}

type NameNode = Identifier | ObjectBindingPattern | ArrayBindingPattern | StringLiteral;

// For reference:
// export declare type ExportedDeclarations = ClassDeclaration | InterfaceDeclaration | EnumDeclaration | FunctionDeclaration | VariableDeclaration | TypeAliasDeclaration | ModuleDeclaration | Expression | SourceFile;

export function getNameIdentifier(node: ExportedDeclarations | ImportSpecifier): NameNode {
    const ret = node.asKind(SyntaxKind.ClassDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.InterfaceDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.EnumDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.FunctionDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.VariableDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.TypeAliasDeclaration)?.getNameNode()
        ?? node.asKind(SyntaxKind.ModuleDeclaration)?.getNameNode();
    // Expression | SourceFile
    if(ret) return ret;

    const importSpecifier = node.asKind(SyntaxKind.ImportSpecifier);
    if(importSpecifier) return importSpecifier?.getAliasNode() ?? importSpecifier.getNameNode();

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

function getReferenceFindable(node: ExportedDeclarations) {
    let ret: Node | undefined = getNameIdentifier(node) ?? node;
    while(!Node.isReferenceFindable(ret)) {
        ret = ret.getParent();
        assert(ret);
    }
    return ret;
}
