import { Span } from "./graph";
import { sortBy } from "lodash";

export function collapseSpans(spans: Span[]) {
    const sorted = sortBy(spans, span => span.start);
    const collapsed = [];
    let previous: Span | undefined = undefined;
    for(const next of sorted) {
        if(previous && previous.end > next.start) {
            // collapse both spans together
            previous = {
                start: previous.start,
                end: Math.max(previous.end, next.end)
            };
            return;
        }
        collapsed.push(previous);
        previous = next;
    }
    collapsed.push(previous);
    return collapsed;
}

export function applyCollapsedEdits(source: string, spans: Span[]) {
    let acc = source;
    for(let i = spans.length - 1; i >= 0; i--) {
        const span = spans[i];
        acc = acc.slice(0, span.start) + acc.slice(span.end);
    }
    return acc;
}
