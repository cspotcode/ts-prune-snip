// Note:
// References here are a bit different than you might expect.
// 
// If the body of a function A contains a call to a function B, then we say that function A refers to function B.
//
// This is a bit different than TS's language service, where the reference is between the declaration of function B and
// the function call's identifier.  The call's identifier is *within* function A, but the language service doesn't
// necessary say that function A refers to function B.
//
// We need to think about how function A's body refers to function B, because that drives garbage collection of dead
// code.

import { GcObject } from "./gc";
import { Node, SourceFile } from "ts-morph";

export type GraphNode = Project | File | Declaration | Reference;

export enum GraphNodeKind {
    Project = 'p',
    File = 'f',
    Declaration = 'd',
    GrepUsage = 'gu',
    CheckerUsage = 'cu'
}

export interface Project extends GcObject {
    kind: GraphNodeKind.Project;
    files: File[];
}
export interface File extends GcObject {
    kind: GraphNodeKind.File;
    isEntrypoint: boolean;
    filename: string;
    declarations: Declaration[];
    orphanedCheckerUsages: CheckerUsage[];
    orphanedGrepUsages: GrepUsage[];
    sourceFile: SourceFile;
}

export interface Declaration extends GcObject {
    kind: GraphNodeKind.Declaration;
    file: File;
    /** null if this declaration is a statement that doesn't have a name because it does not declare a function, var, class, etc. */
    name: string | null;
    isExport: boolean;
    span: Span;
    checkerUsages: CheckerUsage[];
    grepUsages: GrepUsage[];
    statement: Node;
}

export type Reference = GrepUsage | CheckerUsage;
export interface BaseUsage extends GcObject {
    containingDeclaration: Declaration | null;
    location: number;
    target: Declaration;
}

/**
 * A grep reference is where we found a declaration's name elsewhere in the code, but we're not sure
 * if it's a real reference, or merely a coincidence/code comment.  Maybe two functions have the same name.
 */
export interface GrepUsage extends BaseUsage {
    kind: GraphNodeKind.GrepUsage;
}
/**
 * A checker reference means that the typechecker was able to link two AST nodes, which is pretty definitive
 * evidence that one bit of code relies on another.
 */
export interface CheckerUsage extends BaseUsage {
    kind: GraphNodeKind.CheckerUsage;
}
export interface Span {
    fullStart: number;
    start: number;
    end: number;
}

export function createSpan(node: Node): Span {
    return {
        fullStart: node.getFullStart(),
        start: node.getStart(),
        end: node.getEnd()
    };
}

type P<T> = Partial<Omit<T, keyof GcObject | 'kind'>>;
export class GraphFactory {
    nodes = new Set<GraphNode>();

    createProject(project: P<Project>): Project {
        return this.initNode<Project>({
            kind: GraphNodeKind.Project,
            files: [],
            ...project
        });
    }
    createFile(file: P<File>): File {
        return this.initNode<File>({
            kind: GraphNodeKind.File,
            declarations: [],
            filename: '',
            isEntrypoint: false,
            orphanedCheckerUsages: [],
            orphanedGrepUsages: [],
            statement: null,
            ...file
        });
    }
    createDeclaration(declaration: P<Declaration>): Declaration {
        return this.initNode<Declaration>({
            kind: GraphNodeKind.Declaration,
            checkerUsages: [],
            file: null,
            grepUsages: [],
            name: null,
            span: null,
            isExport: false,
            ...declaration
        });
    }
    createGrepUsage(grepUsage: P<GrepUsage>): GrepUsage {
        return this.initNode<GrepUsage>({
            kind: GraphNodeKind.GrepUsage,
            containingDeclaration: null,
            location: 0,
            target: null,
            ...grepUsage
        });
    }
    createCheckerUsage(checkerUsage: P<CheckerUsage>): CheckerUsage {
        return this.initNode<CheckerUsage>({
            kind: GraphNodeKind.CheckerUsage,
            containingDeclaration: null,
            location: 0,
            target: null,
            ...checkerUsage
        });
    }
    private initNode<T extends GraphNode>(node: Omit<T, 'gcFlags'>): T {
        // node.kind = kind;
        const _node = node as T & GraphNode;
        _node.gcFlags = 0;
        this.nodes.add(_node);
        return _node;
    }
}
