// ── External Dependencies & Registrations
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Local Framework
import { Tool } from '@/index';

// ── Tests ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const URL = 'https://sample-data-eu.dpuse.app/fileStore/people.csv';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n');
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

function stubFetchBytes(bytes: Uint8Array<ArrayBuffer> | string): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue(new Response(typeof bytes === 'string' ? bytes : new Blob([bytes])));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

// Russian letters 'А'–'я' sit 0x350 below their code points in 'windows-1251'; Latin-1 letters keep theirs in 'windows-1252'.
function encodeSingleByte(text: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(text, (character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 0x4_10 && codePoint <= 0x4_4f ? codePoint - 0x3_50 : codePoint;
    });
}

// A mostly-ASCII CSV in MacRoman, the hard case: too few accented letters for a confident detection.
function encodeMacRomanCSV(): Uint8Array<ArrayBuffer> {
    const text = 'id,name,city\n1,John Smith,London\n2,Hélène Dubois,Orléans\n3,Mary Jones,Leeds\n4,Noël Béranger,Nîmes\n5,Peter Brown,Boston\n';
    const macRomanBytes: Record<string, number> = { é: 0x8e, è: 0x8f, ë: 0x91, î: 0x94 };
    return Uint8Array.from(text, (character) => macRomanBytes[character] ?? character.codePointAt(0) ?? 0);
}

// Each character low byte first, after the 'FF FE' byte order mark. Only for text without characters beyond U+FFFF,
// which UTF-16 would split in two.
function encodeUTF16LittleEndian(text: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from({ length: 2 + text.length * 2 }, (_, index) => {
        if (index < 2) return index === 0 ? 0xff : 0xfe;
        const codeUnit = text.codePointAt((index - 2) >> 1) ?? 0;
        return index % 2 === 0 ? codeUnit & 0xff : codeUnit >> 8;
    });
}

async function previewFile(minimumConfidenceLevel?: number): Promise<Awaited<ReturnType<Tool['previewFile']>>> {
    return new Tool().previewFile(URL, new AbortController().signal, undefined, minimumConfidenceLevel);
}

describe('Tool', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('asks for only the start of the file', async () => {
        const fetchMock = stubFetchBytes('a,b\n');

        await previewFile();

        expect(fetchMock).toHaveBeenCalledWith(URL, expect.objectContaining({ headers: { Range: 'bytes=0-4095' } }));
    });

    it('decodes delimited text up to its last complete line', async () => {
        stubFetchBytes('name,age\r\nAda,36\r\nGra');

        const preview = await previewFile();

        expect(preview.dataFormatId).toBe('dtv');
        expect(preview.text).toBe('name,age\r\nAda,36');
        expect(preview.encodingId).toBeDefined();
        expect(preview.fileTypeConfig).toBeUndefined();
    });

    it.each([
        ['an object', '{"name": "Ada", "age": 36}\n'],
        ['an empty object', '{}\n'],
        ['an array of objects', '[{"name": "Ada"}, {"name": "Grace"}]\n'],
        ['an array of numbers', '[1, -2.5, 3e8]\n'],
        ['an array of literals', '[true, false, null]\n'],
        ['nested values over several lines', '{\n  "people": [\n    {"name": "Ada", "tags": ["a", "b"]}\n  ]\n}\n'],
        ['escapes in strings', String.raw`{"quote": "\"", "path": "C:\\data", "accent": "\u00e9"}` + '\n'],
        ['a file cut off after a complete line', '[\n  {"name": "Ada"},\n  {"name": "Gra'],
        ['minified JSON cut off inside a string', '[{"name":"Ada"},{"name":"Gra'],
        ['minified JSON cut off inside a number', '[{"age":36},{"age":4'],
        ['minified JSON cut off inside a literal', '[{"isActive":true},{"isActive":fal'],
        ['a byte order mark', '\u{FEFF}{"name": "Ada"}\n']
    ])('recognises JSON: %s', async (_description, text) => {
        stubFetchBytes(text);

        const preview = await previewFile();

        expect(preview.dataFormatId).toBe('json');
    });

    it.each([
        ['a bracketed CSV header', '[Id],[Name]\n1,"Smith, J"\n'],
        ['a CSV with a bracketed header and a literal', '[x],flag\n1,true\n'],
        ['a log line', '[2026-10-22 10:00] INFO user "bob" logged in\n'],
        ['an INI section', '[section]\nkey="value"\n'],
        ['a markdown link', '[link](https://dpuse.app) "quoted"\n'],
        ['a single quoted key', "{'name': 'Ada'}\n"],
        ['an unquoted key', '{name: "Ada"}\n'],
        ['a trailing comma', '[1, 2,]\n'],
        ['a number with a leading zero', '[01, 2]\n'],
        ['a bad escape', String.raw`["\q"]` + '\n'],
        ['a mismatched bracket', '{"name": "Ada"]\n'],
        ['a line break inside a string', '["Ada\nLovelace"]\n'],
        ['a bare string', '"Ada"\n']
    ])('does not mistake %s for JSON', async (_description, text) => {
        stubFetchBytes(text);

        const preview = await previewFile();

        expect(preview.dataFormatId).toBe('dtv');
    });

    it.each([
        ['an object per line', '{"name": "Ada"}\n{"name": "Grace"}\n'],
        ['an array per line', '["Ada", 36]\n["Grace", 85]\n'],
        ['blank lines between records', '{"name": "Ada"}\n\n{"name": "Grace"}\n'],
        ['Windows line endings', '{"name": "Ada"}\r\n{"name": "Grace"}\r\n'],
        ['a file cut off part way through a record', '{"name": "Ada"}\n{"name": "Grace"}\n{"name": "Kath']
    ])('recognises JSON Lines: %s', async (_description, text) => {
        stubFetchBytes(text);

        const preview = await previewFile();

        expect(preview.dataFormatId).toBe('jsonl');
    });

    it.each([
        ['a line that is not JSON', '{"name": "Ada"}\nname,age\n'],
        ['lines of numbers', '1\n2\n3\n'],
        ['lines of strings', '"Ada"\n"Grace"\n']
    ])('does not mistake %s for JSON Lines', async (_description, text) => {
        stubFetchBytes(text);

        const preview = await previewFile();

        expect(preview.dataFormatId).toBe('dtv');
    });

    it('recognises JSON Lines before reading the extension', async () => {
        stubFetchBytes('{"name": "Ada"}\n{"name": "Grace"}\n');

        const preview = await new Tool().previewFile('https://sample-data-eu.dpuse.app/fileStore/people.txt', new AbortController().signal);

        expect(preview.dataFormatId).toBe('jsonl');
    });

    it('recognises JSON before reading the extension', async () => {
        stubFetchBytes('{"name": "Ada"}\n');

        const preview = await new Tool().previewFile('https://sample-data-eu.dpuse.app/fileStore/people.txt', new AbortController().signal);

        expect(preview.dataFormatId).toBe('json');
    });

    it.each([
        ['notes.md', 'markdown'],
        ['README.MARKDOWN', 'markdown'],
        ['notes.txt', 'dtv'],
        ['server.log', 'dtv']
    ])('reads %s as %s, as only markdown is known by its extension', async (fileName, dataFormatId) => {
        stubFetchBytes('# Title\n\nSome words, and more words.\n');

        const preview = await new Tool().previewFile(`https://sample-data-eu.dpuse.app/fileStore/${fileName}`, new AbortController().signal);

        expect(preview.dataFormatId).toBe(dataFormatId);
        expect(preview.text).toBe('# Title\n\nSome words, and more words.');
    });

    it.each([
        ['UTF-8-SIG', [0xef, 0xbb, 0xbf, 0x61, 0x0a]],
        ['utf-16-be', [0xfe, 0xff, 0x00, 0x61, 0x00, 0x0a]],
        ['utf-16-le', [0xff, 0xfe, 0x61, 0x00, 0x0a, 0x00]]
    ])('reads a %s byte order mark with full confidence', async (encodingId, bytes) => {
        stubFetchBytes(new Uint8Array(bytes));

        const preview = await previewFile();

        expect(preview.encodingId).toBe(encodingId);
        expect(preview.encodingConfidenceLevel).toBe(1);
        expect(preview.encodingCandidates).toEqual([{ confidenceLevel: 1, id: encodingId }]);
    });

    it('lists only the best guess when no encoding reaches the minimum confidence', async () => {
        stubFetchBytes(encodeMacRomanCSV());

        const preview = await previewFile();

        expect(preview.encodingCandidates).toHaveLength(1);
    });

    it('lists more candidates, best first, as the minimum confidence is lowered', async () => {
        stubFetchBytes(encodeMacRomanCSV());

        const preview = await previewFile(0.01);
        const confidenceLevels = preview.encodingCandidates?.map(({ confidenceLevel = 0 }) => confidenceLevel) ?? [];

        expect(preview.encodingCandidates?.map(({ id }) => id)).toContain('MacRoman');
        expect(confidenceLevels).toEqual(confidenceLevels.toSorted((left, right) => right - left));
        expect(confidenceLevels.every((confidenceLevel) => confidenceLevel >= 0.01)).toBe(true);
    });

    it.each([
        ['Windows-1251', 'Все люди рождаются свободными и равными в своем достоинстве и правах.'],
        ['Windows-1252', 'Tous les êtres humains naissent libres et égaux en dignité et en droits.']
    ])('detects and decodes %s text', async (encodingId, text) => {
        stubFetchBytes(encodeSingleByte(`${text}\n`));

        const preview = await previewFile();

        expect(preview.encodingId).toBe(encodingId);
        expect(preview.text).toBe(text);
    });

    it('identifies a known binary format it cannot yet read', async () => {
        stubFetchBytes(PDF_BYTES);

        const preview = await previewFile();

        expect(preview.fileTypeConfig?.ext).toBe('pdf');
        expect(preview.dataFormatId).toBeUndefined();
        expect(preview.text).toBe('%PDF-1.7\n');
        expect(preview.encodingId).toBeUndefined();
    });

    it('decodes XML in the encoding its declaration names', async () => {
        stubFetchBytes(encodeSingleByte('<?xml version="1.0" encoding="ISO-8859-1"?>\n<name>Hélène</name>\n'));

        const preview = await previewFile();

        expect(preview.fileTypeConfig?.ext).toBe('xml');
        expect(preview.encodingId).toBe('ISO-8859-1');
        expect(preview.encodingConfidenceLevel).toBe(1);
        expect(preview.text).toBe('<?xml version="1.0" encoding="ISO-8859-1"?>\n<name>Hélène</name>');
    });

    it('decodes XML without an encoding declaration as UTF-8', async () => {
        stubFetchBytes('<?xml version="1.0"?>\n<name>Hélène</name>\n');

        const preview = await previewFile();

        expect(preview.encodingId).toBe('utf-8');
        expect(preview.text).toBe('<?xml version="1.0"?>\n<name>Hélène</name>');
    });

    it('decodes XML by its byte order mark', async () => {
        stubFetchBytes(encodeUTF16LittleEndian('<?xml version="1.0" encoding="UTF-16"?>\n<name>Hélène</name>\n'));

        const preview = await previewFile();

        expect(preview.fileTypeConfig?.ext).toBe('xml');
        expect(preview.encodingId).toBe('utf-16-le');
        expect(preview.text).toBe('<?xml version="1.0" encoding="UTF-16"?>\n<name>Hélène</name>');
    });

    it('identifies a binary format it does not list', async () => {
        stubFetchBytes(PNG_BYTES);

        const preview = await previewFile();

        expect(preview.fileTypeConfig?.ext).toBe('png');
        expect(preview.dataFormatId).toBeUndefined();
    });

    it('shows a binary file one character per byte, with control characters as dots', async () => {
        stubFetchBytes(PNG_BYTES);

        const preview = await previewFile();

        expect(preview.text).toBe('\u{2030}PNG\r\n\u{B7}\n\u{B7}\u{B7}\u{B7}\rIHDR'); // 0x89 is '‰' in Windows-1252.
        expect(preview.encodingId).toBeUndefined();
    });

    it('returns nothing to preview for an empty file', async () => {
        stubFetchBytes('');

        expect(await previewFile()).toEqual({
            bytes: new Uint8Array(0),
            dataFormatId: undefined,
            encodingId: undefined,
            encodingConfidenceLevel: undefined,
            fileTypeConfig: undefined,
            text: undefined
        });
    });

    it('returns nothing to preview for an empty file the store will not send a range of', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(undefined, { status: 416, statusText: 'Range Not Satisfiable' })));

        const preview = await previewFile();

        expect(preview.bytes).toEqual(new Uint8Array(0));
        expect(preview.text).toBeUndefined();
    });

    it('rejects when the file cannot be fetched', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404, statusText: 'Not Found' })));

        await expect(previewFile()).rejects.toThrow(`Failed to fetch '${URL}' file.`);
    });
});
