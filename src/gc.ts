import { defaults } from "lodash";
import { Declaration, File, Project, Reference } from "./graph";

// interface MarkAndSweepState {
//     reachable: Set<unknown>;
//     visited: Set<unknown>;
// }

export interface GcObject {
    gcFlags: number;
}
export enum GcFlag {
    reachableByChecker = 1,
    reachableByGrep = 2
}

type VisitCallbackRet = boolean;
interface VisitCallbacks {
    visit(object: any): VisitCallbackRet;
    visitProject?(object: Project): VisitCallbackRet;
    visitFile?(object: File): VisitCallbackRet;
    visitDeclaration?(object: Declaration): VisitCallbackRet;
    visitReference?(object: Reference): VisitCallbackRet;
}

interface VisitOptions {
    followGrepReferences: boolean;
}

/** Traverse the graph, call callback on each node.  Callbacks can return false to skip traversal of references. */
export function visitProject(project: Project, visitOptions: VisitOptions, _visitors: VisitCallbacks) {

    const visitors = defaults({}, _visitors, {
        visitProject: _visitors.visit,
        visitFile: _visitors.visit,
        visitDeclaration: _visitors.visit,
        visitReference: _visitors.visit,
    });

    return visitProject(project);
    function visitProject(project: Project) {
        if(!visitors.visitProject(project)) return;
        for(const file of project.files) {
            visitFile(file);
        }
    }
    function visitFile(file: File) {
        if(!visitors.visitFile(file)) return;
        for(const d of file.declarations) {
            visitDeclaration(d);
        }
        for(const usage of file.orphanedCheckerUsages) {
            visitReference(usage);
        }
        if(visitOptions.followGrepReferences) {
            for(const r of file.orphanedGrepUsages) {
                visitReference(r);
            }
        }
    }
    function visitDeclaration(d: Declaration) {
        if(!visitors.visitDeclaration(d)) return;
        for(const r of d.checkerUsages) {
            visitReference(r);
        }
        if(visitOptions.followGrepReferences) {
            for(const r of d.grepUsages) {
                visitReference(r);
            }
        }
    }
    function visitReference(r: Reference) {
        if(!visitors.visitReference(r)) return;
        visitDeclaration(r.target);
    }
}

/** Traverse object graph, marking all reachable nodes */
export function mark(project: Project, flag: GcFlag, visitOptions: VisitOptions) {
    // const state: MarkAndSweepState = {
    //     reachable: new Set(),
    //     visited: new Set()
    // };
    visitProject(project, visitOptions, {
        visit(obj: GcObject) {
            if(obj.gcFlags & flag) return false;
            obj.gcFlags |= flag;
            return true;
        },
        visitFile(file) {
            if(!file.isEntrypoint) return false;
            return this.visit(file);
        }
    });
}

/** Reset gc flags on all nodes */
export function resetGcFlags(nodes: Set<GcObject>) {
    for(const node of nodes) {
        node.gcFlags = 0;
    }
}

export function sweep(nodes: Set<GcObject>, flag: GcFlag) {
    const deletions = [];
    for(const node of nodes) {
        if(!(node.gcFlags & flag)) {
            // unreachable
            // deletions.
        }
    }
}
