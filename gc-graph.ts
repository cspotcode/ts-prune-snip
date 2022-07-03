import { Declaration, File, Project, Reference } from "./graph";

interface MarkAndSweepState {
    reachable: Set<unknown>;
    visited: Set<unknown>;
}
export function markAndSweep(project: Project, considerGrepToBeReachable: boolean) {
    const state: MarkAndSweepState = {
        reachable: new Set(),
        visited: new Set()
    };
    visitProject(project);
    function checkVisited(thing: unknown) {
        if(state.visited.has(thing)) return true;
        state.visited.add(thing);
        return false;
    }
    function visitProject(project: Project) {
        if(checkVisited(project)) return;
        for(const file of project.files) {
            visitFile(file);
        }
    }
    function visitFile(file: File) {
        if(checkVisited(file)) return;
        for(const d of file.declarations) {
            visitDeclaration(d);
        }
        if(considerGrepToBeReachable) {
            for(const r of file.orphanedGrepReferences) {
                visitReference(r);
            }
        }
    }
    function visitDeclaration(d: Declaration) {
        if(checkVisited(d)) return;
        for(const r of d.references) {
            visitReference(r);
        }
        if(considerGrepToBeReachable) {
            for(const r of d.grepReferences) {
                visitReference(r);
            }
        }
    }
    function visitReference(r: Reference) {
        if(checkVisited(r)) return;
        visitDeclaration(r.declaration);
    }
}