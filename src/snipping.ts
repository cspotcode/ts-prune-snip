import { Span } from "./graph";
import { sortBy } from "lodash";

export function collapseSpans(spans: Span[]) {
    const sorted = sortBy(spans, span => span.fullStart);
    const collapsed: Span[] = [];
    let previous: Span | undefined = undefined;
    for(const next of sorted) {
        if(previous && previous.end > next.fullStart) {
            // collapse both spans together
            previous = {
                fullStart: previous.fullStart,
                start: previous.start,
                end: Math.max(previous.end, next.end)
            };
            continue;
        }
        if(previous) collapsed.push(previous);
        previous = next;
    }
    if(previous) collapsed.push(previous);
    return collapsed;
}

export function applyCollapsedEdits(source: string, spans: Span[], preserveLineNumbers: boolean) {
    let acc = source;
    for(let i = spans.length - 1; i >= 0; i--) {
        const span = spans[i];
        let replacement = '';
        if(preserveLineNumbers) {
            replacement = '\n'.repeat(acc.slice(span.start, span.end).split('\n').length - 1);
        }
        acc = acc.slice(0, span.start) + replacement + acc.slice(span.end);
    }
    return acc;
}
