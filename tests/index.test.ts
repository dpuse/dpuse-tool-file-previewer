// ── External Dependencies & Registrations
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── DPUse Framework
import type { DataFormatId, FilePreviewResult } from '@dpuse/dpuse-shared';

// ── Local Framework
import config from '~/config.json';
import { name as packageName } from '~/package.json';
import { Tool } from '@/index';

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

// Named stand-ins for 'previewFile's positional parameters, so each test sets only what it is about.
interface PreviewArguments {
    chunkSize?: number;
    encodingId?: string; // An encoding the user chose.
    mimeType?: string;
    signal?: AbortSignal;
    url?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

const URL_PREFIX = 'https://sample-data-eu.dpuse.app/fileStore';
const CSV_URL = `${URL_PREFIX}/people.csv`;
const MARKDOWN_URL = `${URL_PREFIX}/notes.md`;

const DEFAULT_RANGE = 'bytes=0-65535';

const MARKDOWN_TEXT = '# Title\n\nSome words, and more words.\n';

const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n');
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

// The fewest bytes 'file-type' needs to identify each data format the tool reports. The zeros pad each out to the
// length 'file-type' reads before it decides.
const DATA_FILE_SAMPLES: [string, Uint8Array<ArrayBuffer>, DataFormatId][] = [
    ['arrow', padBytes(new TextEncoder().encode('ARROW1\0\0')), 'arrow'],
    ['avro', padBytes(new Uint8Array([0x4f, 0x62, 0x6a, 0x01])), 'avro'],
    ['ods', encodeZIPBytes('mimetype', 'application/vnd.oasis.opendocument.spreadsheet'), 'ods'],
    ['parquet', padBytes(new TextEncoder().encode('PAR1')), 'parquet'],
    ['sav', padBytes(new TextEncoder().encode('$FL2@(#) IBM SPSS')), 'sav'],
    ['sqlite', new TextEncoder().encode('SQLite format 3\0'), 'sqlite'],
    ['xlsx', encodeZIPBytes('[Content_Types].xml', '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'), 'xlsx'],
    ['xlsm', encodeZIPBytes('[Content_Types].xml', '<Types><Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>'), 'xlsx']
];

// ── Tests ────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('Tool', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // The app reads 'config.json' to decide which actions it can ask the tool for.
    describe('config', () => {
        it('lists exactly the actions the tool implements', () => {
            const implementedActionNames = Object.getOwnPropertyNames(Tool.prototype).filter((propertyName) => propertyName !== 'constructor');

            expect(new Set(config.actionNames)).toEqual(new Set(implementedActionNames));
        });

        it('is identified by the package name, without its scope', () => {
            expect(`@dpuse/${config.id}`).toBe(packageName);
        });
    });

    describe('fetching', () => {
        it('asks for only the start of the file', async () => {
            const fetchMock = stubFetchBytes('a,b\n');

            await previewFile();

            expect(fetchMock).toHaveBeenCalledWith(CSV_URL, expect.objectContaining({ headers: { Range: DEFAULT_RANGE } }));
        });

        it('asks for the same amount of a markdown file', async () => {
            const fetchMock = stubFetchBytes('# Title\n');

            await previewFile({ url: MARKDOWN_URL });

            expect(fetchMock).toHaveBeenCalledWith(MARKDOWN_URL, expect.objectContaining({ headers: { Range: DEFAULT_RANGE } }));
        });

        it('asks for the chunk size given, whatever the format', async () => {
            const fetchMock = stubFetchBytes('# Title\n');

            await previewFile({ chunkSize: 1024, url: MARKDOWN_URL });

            expect(fetchMock).toHaveBeenCalledWith(MARKDOWN_URL, expect.objectContaining({ headers: { Range: 'bytes=0-1023' } }));
        });

        it("hands the caller's signal to the fetch, so the caller can stop it", async () => {
            const fetchMock = stubFetchBytes('a,b\n');
            const { signal } = new AbortController();

            await previewFile({ signal });

            expect(fetchMock).toHaveBeenCalledWith(CSV_URL, expect.objectContaining({ signal }));
        });

        it('encodes a path holding spaces before fetching it', async () => {
            const fetchMock = stubFetchBytes('a,b\n');

            await previewFile({ url: `${URL_PREFIX}/Encoding Samples/people.csv` });

            expect(fetchMock).toHaveBeenCalledWith(`${URL_PREFIX}/Encoding%20Samples/people.csv`, expect.anything());
        });

        it('reads the extension from the path, not the query', async () => {
            stubFetchBytes(MARKDOWN_TEXT);

            const preview = await previewFile({ url: `${MARKDOWN_URL}?version=2` });

            expect(preview.dataFormatId).toBe('markdown');
        });

        it('stops reading at the chunk size when the store ignores the range, and reports the preview as not complete', async () => {
            const cancel = vi.fn();
            const body = new ReadableStream<Uint8Array>({
                cancel,
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('a,b\n1,2\n'));
                    controller.enqueue(new TextEncoder().encode('3,4\n5,6\n'));
                }
            });
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));

            const preview = await previewFile({ chunkSize: 12 });

            expect(preview.bytes).toHaveLength(12);
            expect(preview.isComplete).toBe(false);
            expect(preview.text).toBe('a,b\n1,2\n3,4');
            expect(cancel).toHaveBeenCalledOnce();
        });

        it('reports a whole file of exactly the chunk size as complete when the store ignores the range', async () => {
            stubFetchBytes('a,b\n1,2', true);

            const preview = await previewFile({ chunkSize: 7 });

            expect(preview.isComplete).toBe(true);
            expect(preview.text).toBe('a,b\n1,2');
        });

        it("rejects with the store's status when the file cannot be fetched", async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404, statusText: 'Not Found' })));

            const preview = previewFile();

            await expect(preview).rejects.toThrow(`Failed to fetch '${CSV_URL}' file. Response status '404 - Not Found' received.`);
            await expect(preview).rejects.toMatchObject({ name: 'FetchError' });
        });

        it('rejects when the caller stops the fetch', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn(
                    (_url: string, init: { signal: AbortSignal }) =>
                        new Promise((_resolve, reject: (reason: Error) => void) => {
                            init.signal.addEventListener('abort', () => {
                                reject(new DOMException('The operation was aborted.', 'AbortError'));
                            });
                        })
                )
            );
            const abortController = new AbortController();

            const preview = previewFile({ signal: abortController.signal });
            abortController.abort();

            await expect(preview).rejects.toMatchObject({ name: 'AbortError' });
        });
    });

    // A preview of a whole file keeps its last line. A preview cut short ends part-way through a line, which is dropped.
    describe('completeness', () => {
        it('reports a whole file as complete and keeps its last line', async () => {
            stubFetchBytes('name,age\nAda,36', true);

            const preview = await previewFile();

            expect(preview.isComplete).toBe(true);
            expect(preview.text).toBe('name,age\nAda,36');
        });

        it('reports the start of a larger file as not complete, and drops its partial last line', async () => {
            stubFetchBytes('name,age\nAda,36\nGra');

            const preview = await previewFile();

            expect(preview.isComplete).toBe(false);
            expect(preview.text).toBe('name,age\nAda,36');
        });

        it('reports a range that reaches the end of the file as complete', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('a,b\n1,2', { status: 206, headers: { 'Content-Range': 'bytes 0-6/7' } })));

            const preview = await previewFile();

            expect(preview.isComplete).toBe(true);
            expect(preview.text).toBe('a,b\n1,2');
        });

        it('reports a range with no total as complete when the store sent fewer bytes than asked for', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('a,b\n1,2', { status: 206 })));

            const preview = await previewFile();

            expect(preview.isComplete).toBe(true);
        });

        it('reports a range with no total as not complete when the store sent every byte asked for', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('a,b\n1,23', { status: 206 })));

            const preview = await previewFile({ chunkSize: 8 });

            expect(preview.isComplete).toBe(false);
            expect(preview.text).toBe('a,b');
        });

        it.each([
            ['Windows', 'name,age\r\nAda,36\r\nGra'],
            ['classic Mac', 'name,age\rAda,36\rGra']
        ])('drops the partial last line of a preview with %s line endings', async (_description, text) => {
            stubFetchBytes(text);

            const preview = await previewFile();

            expect(preview.text).toBe(text.slice(0, text.lastIndexOf('Ada,36') + 'Ada,36'.length));
        });

        it.each([
            ['little-endian, with Windows line endings', encodeUTF16('a,b\r\n1,2\r\n3,', false)],
            ['big-endian', encodeUTF16('a,b\n1,2\n3,', true)]
        ])('drops the partial last line of a UTF-16 preview, %s', async (_description, bytes) => {
            stubFetchBytes(bytes);

            const preview = await previewFile();

            expect(preview.text).toMatch(/^a,b\r?\n1,2$/);
        });

        it('does not cut a UTF-16 preview at a byte that only looks like a line break', async () => {
            stubFetchBytes(encodeUTF16('a\nb\nĊc', false)); // 'Ċ' is U+010A, so its low byte is the line feed's 0x0A.

            const preview = await previewFile();

            expect(preview.text).toBe('a\nb');
        });

        it('leaves out a character cut in two at the end of the preview', async () => {
            stubFetchBytes(new TextEncoder().encode('Hélène').subarray(0, 5)); // 'H', 'é' and 'l' take four bytes; the fifth starts 'è'.

            const preview = await previewFile();

            expect(preview.encodingId).toBe('utf-8');
            expect(preview.text).toBe('Hél');
        });

        it('keeps all of a preview cut short with no line break in it', async () => {
            stubFetchBytes('name,age,city');

            const preview = await previewFile();

            expect(preview.text).toBe('name,age,city');
        });

        it('returns nothing to preview for an empty file', async () => {
            stubFetchBytes('');

            expect(await previewFile()).toEqual({
                bytes: new Uint8Array(0),
                dataFormatId: undefined,
                dataFormatSourceId: undefined,
                encodingId: undefined,
                encodingConfidenceLevel: undefined,
                encodingSourceId: undefined,
                encodingCandidates: undefined,
                replacementCharacterCount: undefined,
                fileTypeConfig: undefined,
                isComplete: true,
                text: undefined
            });
        });

        it('returns nothing to preview for an empty file the store will not send a range of', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(undefined, { status: 416, statusText: 'Range Not Satisfiable' })));

            const preview = await previewFile();

            expect(preview.bytes).toEqual(new Uint8Array(0));
            expect(preview.isComplete).toBe(true);
            expect(preview.text).toBeUndefined();
        });
    });

    describe('encodings', () => {
        it.each([
            ['utf-8-sig', [0xef, 0xbb, 0xbf, 0x61, 0x0a]],
            ['utf-16-be', [0xfe, 0xff, 0x00, 0x61, 0x00, 0x0a]],
            ['utf-16-le', [0xff, 0xfe, 0x61, 0x00, 0x0a, 0x00]]
        ])('reads a %s byte order mark with full confidence, and leaves the mark out of the text', async (encodingId, bytes) => {
            stubFetchBytes(new Uint8Array(bytes), true);

            const preview = await previewFile();

            expect(preview.encodingId).toBe(encodingId);
            expect(preview.encodingConfidenceLevel).toBe(1);
            expect(preview.encodingCandidates).toEqual([{ confidenceLevel: 1, id: encodingId }]);
            expect(preview.text).toBe('a\n');
        });

        it('reads text that is valid UTF-8 as UTF-8, with full confidence', async () => {
            stubFetchBytes('name,city\nHélène Dubois,Orléans\nNoël Béranger,Nîmes\n');

            const preview = await previewFile();

            expect(preview.encodingId).toBe('utf-8');
            expect(preview.encodingConfidenceLevel).toBe(1);
            expect(preview.encodingCandidates).toEqual([{ confidenceLevel: 1, id: 'utf-8' }]);
            expect(preview.text).toBe('name,city\nHélène Dubois,Orléans\nNoël Béranger,Nîmes');
        });

        it('assumes UTF-8 for text that is all ASCII, as it gives no evidence of its encoding', async () => {
            stubFetchBytes('name,age\nAda,36\n');

            const preview = await previewFile();

            expect(preview.encodingId).toBe('utf-8');
            expect(preview.encodingConfidenceLevel).toBeUndefined();
            expect(preview.encodingCandidates).toEqual([]);
        });

        it('decodes with the first candidate the browser can decode, when the best cannot be', async () => {
            stubFetchBytes(encodeMacRomanCSV());

            const preview = await previewFile();

            expect(preview.encodingCandidates?.[0]?.id).toBe('maclatin2');
            expect(preview.encodingId).toBe('macroman');
            expect(preview.text).toContain('Hélène Dubois,Orléans');
        });

        it.each([
            ['windows-1251', 'Все люди рождаются свободными и равными в своем достоинстве и правах.'],
            ['windows-1252', 'Tous les êtres humains naissent libres et égaux en dignité et en droits.']
        ])('detects and decodes %s text', async (encodingId, text) => {
            stubFetchBytes(encodeSingleByte(`${text}\n`));

            const preview = await previewFile();

            expect(preview.encodingId).toBe(encodingId);
            expect(preview.text).toBe(text);
        });

        it("reports the best candidate's encoding and confidence", async () => {
            stubFetchBytes(encodeSingleByte('Tous les êtres humains naissent libres et égaux en dignité et en droits.\n'));

            const preview = await previewFile();

            expect(preview.encodingId).toBe(preview.encodingCandidates?.[0]?.id);
            expect(preview.encodingConfidenceLevel).toBe(preview.encodingCandidates?.[0]?.confidenceLevel);
        });

        it('lists every candidate jschardet detects, best first, however low its confidence', async () => {
            stubFetchBytes(encodeMacRomanCSV());

            const preview = await previewFile();
            const confidenceLevels = preview.encodingCandidates?.map(({ confidenceLevel = 0 }) => confidenceLevel) ?? [];

            expect(confidenceLevels.length).toBeGreaterThan(10);
            expect(preview.encodingCandidates?.map(({ id }) => id)).toContain('macroman');
            expect(confidenceLevels).toEqual(confidenceLevels.toSorted((left, right) => right - left));
            expect(confidenceLevels.every((confidenceLevel) => confidenceLevel < 0.2)).toBe(true);
        });

        it('lists only encoding ids, in lower case', async () => {
            stubFetchBytes(encodeSingleByte('Все люди рождаются свободными и равными в своем достоинстве и правах.\n'));

            const preview = await previewFile();

            expect(preview.encodingCandidates?.every(({ id }) => id === id.toLowerCase())).toBe(true);
        });
    });

    describe('how the encoding was found', () => {
        it.each([
            ['a byte order mark', new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x0a]), 'byteOrderMark'],
            ['text that is all ASCII', new TextEncoder().encode('name,age\nAda,36\n'), 'asciiAssumption'],
            ['text that is valid UTF-8', new TextEncoder().encode('name,city\nHélène,Orléans\n'), 'utf8Validation'],
            ['text that jschardet identifies', encodeSingleByte('Tous les êtres humains naissent libres et égaux en dignité et en droits.\n'), 'detection']
        ])('reports %s', async (_description, bytes, encodingSourceId) => {
            stubFetchBytes(bytes);

            const preview = await previewFile();

            expect(preview.encodingSourceId).toBe(encodingSourceId);
        });

        it('counts no replacement characters when the encoding fits the text', async () => {
            stubFetchBytes(encodeSingleByte('Tous les êtres humains naissent libres et égaux en dignité et en droits.\n'));

            const preview = await previewFile();

            expect(preview.replacementCharacterCount).toBe(0);
        });

        it('counts the replacement characters when the encoding chosen does not fit the text', async () => {
            stubFetchBytes(encodeSingleByte('name,city\nHélène,Orléans\n'));

            const preview = await previewFile({ encodingId: 'utf-8' });

            expect(preview.text).toBe('name,city\nH\u{FFFD}l\u{FFFD}ne,Orl\u{FFFD}ans');
            expect(preview.replacementCharacterCount).toBe(3);
        });
    });

    describe('text formats', () => {
        // The JSON and JSON Lines checks have their own tests. These check the preview hands them its text, with the
        // unfinished last line already dropped, and falls back to delimited text.
        it.each([
            ['JSON cut off part way through a line', '[\n  {"name": "Ada"},\n  {"name": "Gra', 'json'],
            ['JSON Lines cut off part way through a record', '{"name": "Ada"}\n{"name": "Grace"}\n{"name": "Kath', 'jsonl'],
            ['JSON after a UTF-8 byte order mark', '\u{FEFF}{"name": "Ada"}\n', 'json'],
            ['text that is neither JSON nor JSON Lines', '[Id],[Name]\n1,"Smith, J"\n', 'dtv']
        ])('reads %s as %s', async (_description, text, dataFormatId) => {
            stubFetchBytes(text);

            const preview = await previewFile();

            expect(preview.dataFormatId).toBe(dataFormatId);
        });

        it.each([
            ['JSON', 'people.txt', '{"name": "Ada"}\n', 'json'],
            ['JSON Lines', 'people.txt', '{"name": "Ada"}\n{"name": "Grace"}\n', 'jsonl'],
            ['JSON', 'notes.md', '{"name": "Ada"}\n', 'json']
        ])('recognises %s in %s before reading the extension', async (_description, fileName, text, dataFormatId) => {
            stubFetchBytes(text);

            const preview = await previewFile({ url: `${URL_PREFIX}/${fileName}` });

            expect(preview.dataFormatId).toBe(dataFormatId);
        });

        it.each([
            ['notes.md', 'markdown'],
            ['README.MARKDOWN', 'markdown'],
            ['notes.txt', 'dtv'],
            ['server.log', 'dtv'],
            ['README', 'dtv']
        ])('reads %s as %s, as only markdown is known by its extension', async (fileName, dataFormatId) => {
            stubFetchBytes(MARKDOWN_TEXT);

            const preview = await previewFile({ url: `${URL_PREFIX}/${fileName}` });

            expect(preview.dataFormatId).toBe(dataFormatId);
            expect(preview.text).toBe('# Title\n\nSome words, and more words.');
        });

        it.each([
            ['notes.txt', 'text/markdown', 'markdown'],
            ['notes.txt', 'Text/Markdown', 'markdown'],
            ['notes.txt', 'text/markdown; charset=UTF-8', 'markdown'],
            ['notes.md', 'text/plain', 'dtv'],
            ['notes.md', 'application/octet-stream', 'markdown'],
            ['notes.md', '', 'markdown']
        ])('reads %s with MIME type %j as %s, as the type decides before the extension', async (fileName, mimeType, dataFormatId) => {
            stubFetchBytes(MARKDOWN_TEXT);

            const preview = await previewFile({ mimeType, url: `${URL_PREFIX}/${fileName}` });

            expect(preview.dataFormatId).toBe(dataFormatId);
        });

        it.each([
            ['JSON', 'people.txt', undefined, '{"name": "Ada"}\n', 'jsonSyntax'],
            ['JSON Lines', 'people.txt', undefined, '{"name": "Ada"}\n{"name": "Grace"}\n', 'jsonSyntax'],
            ['markdown by its MIME type', 'notes.txt', 'text/markdown', MARKDOWN_TEXT, 'mimeType'],
            ['markdown by its extension', 'notes.md', undefined, MARKDOWN_TEXT, 'extension'],
            ['delimited text, by default', 'people.csv', undefined, 'name,age\nAda,36\n', 'default']
        ])('reports how %s was recognised', async (_description, fileName, mimeType, text, dataFormatSourceId) => {
            stubFetchBytes(text);

            const preview = await previewFile({ ...(mimeType != null && { mimeType }), url: `${URL_PREFIX}/${fileName}` });

            expect(preview.dataFormatSourceId).toBe(dataFormatSourceId);
        });

        it('identifies no file type for text', async () => {
            stubFetchBytes('name,age\nAda,36\n');

            const preview = await previewFile();

            expect(preview.fileTypeConfig).toBeUndefined();
        });
    });

    describe('identified file types', () => {
        it.each(DATA_FILE_SAMPLES)('reports a %s file as its data format, with no encoding', async (extension, bytes, dataFormatId) => {
            stubFetchBytes(bytes);

            const preview = await previewFile();

            expect(preview.fileTypeConfig?.ext).toBe(extension);
            expect(preview.dataFormatId).toBe(dataFormatId);
            expect(preview.dataFormatSourceId).toBe('fileContent');
            expect(preview.encodingId).toBeUndefined();
            expect(preview.encodingConfidenceLevel).toBeUndefined();
            expect(preview.encodingSourceId).toBeUndefined();
            expect(preview.encodingCandidates).toBeUndefined();
            expect(preview.replacementCharacterCount).toBeUndefined();
        });

        it.each([
            ['pdf', PDF_BYTES],
            ['png', PNG_BYTES]
        ])('identifies a %s file, which is not data, with no format', async (extension, bytes) => {
            stubFetchBytes(bytes);

            const preview = await previewFile();

            expect(preview.fileTypeConfig?.ext).toBe(extension);
            expect(preview.dataFormatId).toBeUndefined();
            expect(preview.dataFormatSourceId).toBeUndefined();
            expect(preview.encodingId).toBeUndefined();
        });

        it('shows a binary file one character per byte, with control characters as dots', async () => {
            stubFetchBytes(PNG_BYTES);

            const preview = await previewFile();

            expect(preview.text).toBe('\u{2030}PNG\r\n\u{B7}\n\u{B7}\u{B7}\u{B7}\rIHDR'); // 0x89 is '‰' in Windows-1252.
        });

        it('shows the delete and C1 control characters as dots, and keeps tabs', async () => {
            stubFetchBytes(new Uint8Array([...new TextEncoder().encode('PAR1'), 0x09, 0x7f, 0x81, 0x9d, 0x41]));

            const preview = await previewFile();

            expect(preview.text).toBe('PAR1\t\u{B7}\u{B7}\u{B7}A');
        });

        it('keeps every byte of a binary file cut short, as it has no lines', async () => {
            stubFetchBytes(PDF_BYTES);

            const preview = await previewFile();

            expect(preview.isComplete).toBe(false);
            expect(preview.text).toBe('%PDF-1.7\n');
        });
    });

    // XML states its own encoding, so no candidates are listed and the encoding found is certain.
    describe('XML', () => {
        it('decodes XML in the encoding its declaration names', async () => {
            stubFetchBytes(encodeSingleByte('<?xml version="1.0" encoding="ISO-8859-1"?>\n<name>Hélène</name>\n'));

            const preview = await previewFile();

            expect(preview.fileTypeConfig?.ext).toBe('xml');
            expect(preview.dataFormatId).toBe('xml');
            expect(preview.encodingId).toBe('ISO-8859-1');
            expect(preview.encodingConfidenceLevel).toBe(1);
            expect(preview.encodingSourceId).toBe('xmlDeclaration');
            expect(preview.encodingCandidates).toBeUndefined();
            expect(preview.replacementCharacterCount).toBe(0);
            expect(preview.text).toBe('<?xml version="1.0" encoding="ISO-8859-1"?>\n<name>Hélène</name>');
        });

        it('reads an encoding declared in single quotes', async () => {
            stubFetchBytes(encodeSingleByte("<?xml version='1.0' encoding='windows-1252'?>\n<name>Hélène</name>\n"));

            const preview = await previewFile();

            expect(preview.encodingId).toBe('windows-1252');
            expect(preview.text).toBe("<?xml version='1.0' encoding='windows-1252'?>\n<name>Hélène</name>");
        });

        it('decodes XML without an encoding declaration as UTF-8', async () => {
            stubFetchBytes('<?xml version="1.0"?>\n<name>Hélène</name>\n');

            const preview = await previewFile();

            expect(preview.encodingId).toBe('utf-8');
            expect(preview.encodingConfidenceLevel).toBe(1);
            expect(preview.encodingSourceId).toBe('xmlDefault');
            expect(preview.text).toBe('<?xml version="1.0"?>\n<name>Hélène</name>');
        });

        it('decodes XML by its UTF-16 byte order mark', async () => {
            stubFetchBytes(encodeUTF16('<?xml version="1.0" encoding="UTF-16"?>\n<name>Hélène</name>\n', false));

            const preview = await previewFile();

            expect(preview.fileTypeConfig?.ext).toBe('xml');
            expect(preview.encodingId).toBe('utf-16-le');
            expect(preview.encodingSourceId).toBe('byteOrderMark');
            expect(preview.text).toBe('<?xml version="1.0" encoding="UTF-16"?>\n<name>Hélène</name>');
        });

        it('decodes XML by its UTF-8 byte order mark, ahead of its declaration', async () => {
            stubFetchBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?>\n<name>Hélène</name>\n')]));

            const preview = await previewFile();

            expect(preview.encodingId).toBe('utf-8-sig');
            expect(preview.text).toBe('<?xml version="1.0" encoding="ISO-8859-1"?>\n<name>Hélène</name>');
        });

        it('decodes as UTF-8 when the declared encoding cannot be decoded, and still reports the declared encoding', async () => {
            stubFetchBytes('<?xml version="1.0" encoding="x-made-up"?>\n<name>Hélène</name>\n');

            const preview = await previewFile();

            expect(preview.encodingId).toBe('x-made-up');
            expect(preview.encodingSourceId).toBe('xmlDeclaration');
            expect(preview.decodedEncodingId).toBe('utf-8');
            expect(preview.text).toBe('<?xml version="1.0" encoding="x-made-up"?>\n<name>Hélène</name>');
        });
    });

    // A chosen encoding is used to decode the text. Detection still runs and is reported unchanged.
    describe('with a chosen encoding', () => {
        it('decodes text in the encoding chosen, and still reports the encoding detected', async () => {
            stubFetchBytes(encodeMacRomanCSV());

            const preview = await previewFile({ encodingId: 'macroman' });

            expect(preview.decodedEncodingId).toBe('macroman');
            expect(preview.encodingId).toBe('macroman');
            expect(preview.encodingSourceId).toBe('detection');
            expect(preview.text).toContain('Hélène Dubois,Orléans');
        });

        it('reports the detected encoding, not the chosen one, when they differ', async () => {
            stubFetchBytes(encodeSingleByte('Tous les êtres humains naissent libres et égaux en dignité et en droits.\n'));

            const preview = await previewFile({ encodingId: 'utf-8' });

            expect(preview.encodingId).toBe('windows-1252');
            expect(preview.encodingSourceId).toBe('detection');
            expect(preview.decodedEncodingId).toBe('utf-8');
        });

        it('still lists the candidates detected', async () => {
            stubFetchBytes(encodeMacRomanCSV());

            const preview = await previewFile({ encodingId: 'macroman' });

            expect(preview.encodingCandidates?.[0]?.id).toBe('maclatin2');
            expect(preview.encodingCandidates?.map(({ id }) => id)).toContain('macroman');
        });

        it('decodes as UTF-8 when the encoding chosen cannot be decoded', async () => {
            stubFetchBytes('name,age\nAda,36\n');

            const preview = await previewFile({ encodingId: 'maclatin2' });

            expect(preview.decodedEncodingId).toBe('utf-8');
            expect(preview.encodingSourceId).toBe('asciiAssumption');
            expect(preview.text).toBe('name,age\nAda,36');
        });

        it('leaves the format to detection', async () => {
            stubFetchBytes('{"name": "Ada"}\n');

            const preview = await previewFile({ encodingId: 'utf-8' });

            expect(preview.dataFormatId).toBe('json');
            expect(preview.dataFormatSourceId).toBe('jsonSyntax');
        });

        it('decodes XML in the encoding chosen, and still reports the encoding its declaration names', async () => {
            stubFetchBytes(encodeSingleByte('<?xml version="1.0" encoding="utf-8"?>\n<name>Hélène</name>\n'));

            const preview = await previewFile({ encodingId: 'iso-8859-1' });

            expect(preview.decodedEncodingId).toBe('iso-8859-1');
            expect(preview.encodingId).toBe('utf-8');
            expect(preview.encodingSourceId).toBe('xmlDeclaration');
            expect(preview.text).toBe('<?xml version="1.0" encoding="utf-8"?>\n<name>Hélène</name>');
        });

        it('leaves a binary file one character per byte, whatever encoding is chosen', async () => {
            stubFetchBytes(PDF_BYTES);

            const preview = await previewFile({ encodingId: 'utf-8' });

            expect(preview.decodedEncodingId).toBeUndefined();
            expect(preview.encodingId).toBeUndefined();
            expect(preview.text).toBe('%PDF-1.7\n');
        });
    });
});

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function previewFile({ chunkSize, encodingId, mimeType, signal, url }: PreviewArguments = {}): Promise<FilePreviewResult> {
    return new Tool().previewFile(url ?? CSV_URL, signal ?? new AbortController().signal, chunkSize, mimeType, encodingId);
}

// Answers as the file store does for the start of a larger file: a partial range of a whole file 100 bytes longer. A
// whole file, or an empty one, comes back in full.
function stubFetchBytes(bytes: Uint8Array<ArrayBuffer> | string, isWholeFile = false): ReturnType<typeof vi.fn> {
    const body = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    const init = isWholeFile || body.length === 0 ? {} : { status: 206, headers: { 'Content-Range': `bytes 0-${String(body.length - 1)}/${String(body.length + 100)}` } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob([body]), init));
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

// Each character in two bytes, after the byte order mark. Only for text without characters beyond U+FFFF.
function encodeUTF16(text: string, isBigEndian: boolean): Uint8Array<ArrayBuffer> {
    const bytes = isBigEndian ? [0xfe, 0xff] : [0xff, 0xfe];
    for (const character of text) {
        const codeUnit = character.codePointAt(0) ?? 0;
        bytes.push(...(isBigEndian ? [codeUnit >> 8, codeUnit & 0xff] : [codeUnit & 0xff, codeUnit >> 8]));
    }
    return Uint8Array.from(bytes);
}

// A ZIP holding one file, which is all 'file-type' reads to tell an OpenDocument or Office file apart. Stored, not
// compressed, and with no checksum, which 'file-type' does not check.
function encodeZIPBytes(fileName: string, content: string): Uint8Array<ArrayBuffer> {
    const nameBytes = new TextEncoder().encode(fileName);
    const contentBytes = new TextEncoder().encode(content);
    const header = new Uint8Array(30);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x04_03_4b_50, true); // Local file header signature.
    headerView.setUint16(4, 20, true); // Version needed to extract.
    headerView.setUint32(18, contentBytes.length, true); // Compressed size.
    headerView.setUint32(22, contentBytes.length, true); // Uncompressed size.
    headerView.setUint16(26, nameBytes.length, true); // File name length.
    return Uint8Array.from([...header, ...nameBytes, ...contentBytes]);
}

function padBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    return Uint8Array.from([...bytes, ...new Uint8Array(64)]);
}
