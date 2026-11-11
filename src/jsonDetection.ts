// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// The token expected next, and the position reached.
type JSONExpectation = 'closeOrKey' | 'closeOrValue' | 'colon' | 'commaOrClose' | 'end' | 'key' | 'value';
interface JSONPosition {
    expectation: JSONExpectation;
    index: number;
}

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

const JSON_LITERALS = ['false', 'null', 'true'];
const JSON_WHITESPACE_CHARACTERS = new Set([' ', '\t', '\n', '\r']);

// ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// One object or array, valid as far as the text goes, so JSON cut off at the end of a preview still counts. One invalid
// token rules it out, so '[Id],[Name]', INI sections and log lines starting with '[' are not mistaken for JSON. A
// second value after the first also rules it out.
export function isLikelyJSONFormat(text: string): boolean {
    const openBrackets: string[] = [];
    const firstIndex = text.search(/\S/);
    if (text[firstIndex] !== '{' && text[firstIndex] !== '[') return false;
    let position: JSONPosition | undefined = { expectation: 'value', index: firstIndex };
    while (position != null && position.index < text.length) position = readJSONToken(text, position, openBrackets);
    return position != null;
}

// Every line is a whole JSON object or array. At least two lines, because one line is plain JSON. The preview's
// unfinished last line has already been dropped.
export function isLikelyJSONLinesFormat(text: string): boolean {
    const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '');
    return lines.length > 1 && lines.every((line) => isJSONObjectOrArray(line));
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function isJSONObjectOrArray(line: string): boolean {
    try {
        const value: unknown = JSON.parse(line);
        return typeof value === 'object' && value !== null;
    } catch {
        return false;
    }
}

function readJSONToken(text: string, { expectation, index }: JSONPosition, openBrackets: string[]): JSONPosition | undefined {
    const character = text.charAt(index);
    if (JSON_WHITESPACE_CHARACTERS.has(character)) return { expectation, index: index + 1 };
    switch (expectation) {
        case 'closeOrKey':
            return character === '}' ? closeJSONBracket(character, index, openBrackets) : readJSONKey(text, index);
        case 'closeOrValue':
            return character === ']' ? closeJSONBracket(character, index, openBrackets) : readJSONValue(text, index, openBrackets);
        case 'colon':
            return character === ':' ? { expectation: 'value', index: index + 1 } : undefined;
        case 'commaOrClose':
            if (character === ',') return { expectation: openBrackets.at(-1) === '{' ? 'key' : 'value', index: index + 1 };
            return closeJSONBracket(character, index, openBrackets);
        case 'end':
            return undefined; // Something after the outermost bracket closed.
        case 'key':
            return readJSONKey(text, index);
        case 'value':
            return readJSONValue(text, index, openBrackets);
    }
}

function closeJSONBracket(character: string, index: number, openBrackets: string[]): JSONPosition | undefined {
    if (character !== (openBrackets.at(-1) === '{' ? '}' : ']')) return undefined;
    openBrackets.pop();
    return { expectation: openBrackets.length === 0 ? 'end' : 'commaOrClose', index: index + 1 };
}

function readJSONKey(text: string, index: number): JSONPosition | undefined {
    const endIndex = text.charAt(index) === '"' ? findJSONStringEnd(text, index) : undefined;
    return endIndex == null ? undefined : { expectation: 'colon', index: endIndex };
}

function readJSONValue(text: string, index: number, openBrackets: string[]): JSONPosition | undefined {
    const character = text.charAt(index);
    if (character === '{' || character === '[') {
        openBrackets.push(character);
        return { expectation: character === '{' ? 'closeOrKey' : 'closeOrValue', index: index + 1 };
    }
    const endIndex = character === '"' ? findJSONStringEnd(text, index) : findJSONNumberOrLiteralEnd(text, index);
    return endIndex == null ? undefined : { expectation: 'commaOrClose', index: endIndex };
}

// The index after the closing quote. A string still open at the end of the text is cut off, not invalid.
function findJSONStringEnd(text: string, quoteIndex: number): number | undefined {
    let index = quoteIndex + 1;
    while (index < text.length) {
        const character = text.charAt(index);
        if (character === '"') return index + 1;
        if (character < ' ') return undefined; // JSON strings cannot hold raw control characters, line breaks included.
        if (character === '\\') {
            const escapeEndIndex = findJSONEscapeEnd(text, index);
            if (escapeEndIndex == null) return undefined;
            index = escapeEndIndex;
        } else {
            index++;
        }
    }
    return text.length;
}

// The index after an escape such as '\n' or '\u00e9' inside a string.
function findJSONEscapeEnd(text: string, backslashIndex: number): number | undefined {
    const escapedCharacter = text.charAt(backslashIndex + 1);
    if (escapedCharacter === 'u') return /^[\da-f]*$/i.test(text.slice(backslashIndex + 2, backslashIndex + 6)) ? backslashIndex + 6 : undefined;
    return escapedCharacter === '' || String.raw`"\/bfnrt`.includes(escapedCharacter) ? backslashIndex + 2 : undefined;
}

// The index after a number, 'true', 'false' or 'null'. One still open at the end of the text is cut off, not invalid.
function findJSONNumberOrLiteralEnd(text: string, index: number): number | undefined {
    const word = /^[\w.+-]+/.exec(text.slice(index))?.[0];
    if (word == null) return undefined;
    const endIndex = index + word.length;
    if (endIndex === text.length) return JSON_LITERALS.some((literal) => literal.startsWith(word)) || /^[\d.e+-]*$/i.test(word) ? endIndex : undefined;
    return JSON_LITERALS.includes(word) || isJSONNumber(word) ? endIndex : undefined;
}

// 'JSON.parse' applies JSON's own number rules, which reject forms such as '01', '1.' and '+1'.
function isJSONNumber(word: string): boolean {
    try {
        return typeof JSON.parse(word) === 'number';
    } catch {
        return false;
    }
}
