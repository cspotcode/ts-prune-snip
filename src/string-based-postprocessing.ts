
/**
 * Pragmatically, some of our snipping is imperfect and leaves the source text
 * as syntactically invalid JS.  This postprocessing step aims to fix those
 * syntax errors using a regexp find-and-replace pass.
 */
export function postprocessSource(sourceText: string) {
    // Strip extra commas in import {} or export {}
    repeatTillStable(() => {
        sourceText = sourceText.replace(/(\b(export|import)[\s\n]*\{([\s\n]*[a-zA-Z_$][a-zA-Z_$0-9]*[\s\n]*,)*)[\s\n]*,/g, '$1');
    });

    // Remove empty var, const, or let declarations
    repeatTillStable(() => {
        sourceText = sourceText.replace(/(^|\n) *(export *)?(var|const|let)[\s\n]*(;|\n)/g, '');
    });

    return sourceText;

    function repeatTillStable(cb: () => void) {
        let before: string;
        do {
            before = sourceText;
            cb();
        } while(sourceText !== before);
    }
}
