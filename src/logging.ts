import Path from 'path';
import {Node} from 'ts-morph';

export function getLoggableLocation(node: Node) {
    const path = getLoggableFilename(node);
    const line = node.getStartLineNumber();
    return `${path}:${line}`;
}

export function getLoggableFilename(node: Node): string;
export function getLoggableFilename(filename: string): string;
export function getLoggableFilename(arg: string | Node) {
    const absFilename = (arg as Node).getSourceFile?.().getFilePath() ?? arg;
    return Path.relative(process.cwd(), absFilename);
}
