// ── External Dependencies & Registrations
import { describe, expect, it } from 'vitest';

// ── Local Framework
import { isLikelyJSONFormat, isLikelyJSONLinesFormat } from '@/jsonDetection';

// ── Tests ────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('isLikelyJSONFormat', () => {
    it.each([
        ['an object', '{"name": "Ada", "age": 36}\n'],
        ['an empty object', '{}\n'],
        ['an empty array', '[]\n'],
        ['an array of objects', '[{"name": "Ada"}, {"name": "Grace"}]\n'],
        ['an array of numbers', '[1, -2.5, 3e8]\n'],
        ['an array of literals', '[true, false, null]\n'],
        ['nested values over several lines', '{\n  "people": [\n    {"name": "Ada", "tags": ["a", "b"]}\n  ]\n}\n'],
        ['blank lines before it', '  \n\n{"name": "Ada"}\n'],
        ['escapes in strings', String.raw`{"quote": "\"", "path": "C:\\data", "accent": "\u00e9"}` + '\n'],
        ['a file cut off after a complete line', '[\n  {"name": "Ada"},\n  {"name": "Gra'],
        ['minified JSON cut off inside a string', '[{"name":"Ada"},{"name":"Gra'],
        ['minified JSON cut off inside an escape', '[{"name":"Ada"},{"name":"\\u00'],
        ['minified JSON cut off after a backslash', '[{"path":"C:\\'],
        ['minified JSON cut off after a key', '[{"name":"Ada"},{"name"'],
        ['minified JSON cut off after a colon', '[{"name":"Ada"},{"name":'],
        ['minified JSON cut off inside a number', '[{"age":36},{"age":4'],
        ['minified JSON cut off inside an exponent', '[{"distance":3e8},{"distance":1e'],
        ['minified JSON cut off inside a literal', '[{"isActive":true},{"isActive":fal'],
        ['a byte order mark', '\u{FEFF}{"name": "Ada"}\n']
    ])('recognises JSON: %s', (_description, text) => {
        expect(isLikelyJSONFormat(text)).toBe(true);
    });

    it.each([
        ['a bracketed CSV header', '[Id],[Name]\n1,"Smith, J"\n'],
        ['a CSV with a bracketed header and a literal', '[x],flag\n1,true\n'],
        ['a log line', '[2026-10-22 10:00] INFO user "bob" logged in\n'],
        ['an INI section', '[section]\nkey="value"\n'],
        ['a markdown link', '[link](https://dpuse.app) "quoted"\n'],
        ['a single quoted key', "{'name': 'Ada'}\n"],
        ['an unquoted key', '{name: "Ada"}\n'],
        ['a missing colon', '{"name" "Ada"}\n'],
        ['a trailing comma in an array', '[1, 2,]\n'],
        ['a trailing comma in an object', '{"name": "Ada",}\n'],
        ['a number with a leading zero', '[01, 2]\n'],
        ['a number ending in a point', '[1., 2]\n'],
        ['a misspelt literal', '[nul, true]\n'],
        ['a bad escape', String.raw`["\q"]` + '\n'],
        ['a bad unicode escape', String.raw`["\u00zz"]` + '\n'],
        ['a mismatched bracket', '{"name": "Ada"]\n'],
        ['a line break inside a string', '["Ada\nLovelace"]\n'],
        ['a tab inside a string', '["Ada\tLovelace"]\n'],
        ['text after the closing bracket', '{"name": "Ada"} and more\n'],
        ['two values on one line', '{"name": "Ada"} {"name": "Grace"}\n'],
        ['a bare string', '"Ada"\n'],
        ['only blank lines', '  \n\n  \n']
    ])('does not mistake %s for JSON', (_description, text) => {
        expect(isLikelyJSONFormat(text)).toBe(false);
    });
});

describe('isLikelyJSONLinesFormat', () => {
    it.each([
        ['an object per line', '{"name": "Ada"}\n{"name": "Grace"}\n'],
        ['an array per line', '["Ada", 36]\n["Grace", 85]\n'],
        ['blank lines between records', '{"name": "Ada"}\n\n{"name": "Grace"}\n'],
        ['Windows line endings', '{"name": "Ada"}\r\n{"name": "Grace"}\r\n']
    ])('recognises JSON Lines: %s', (_description, text) => {
        expect(isLikelyJSONLinesFormat(text)).toBe(true);
    });

    it.each([
        ['a line that is not JSON', '{"name": "Ada"}\nname,age\n'],
        ['lines of numbers', '1\n2\n3\n'],
        ['lines of strings', '"Ada"\n"Grace"\n'],
        ['lines of null', 'null\nnull\n'],
        ['a single line of JSON', '{"name": "Ada"}\n']
    ])('does not mistake %s for JSON Lines', (_description, text) => {
        expect(isLikelyJSONLinesFormat(text)).toBe(false);
    });
});
