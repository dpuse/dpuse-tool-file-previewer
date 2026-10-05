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

    it('recognises JSON text', async () => {
        stubFetchBytes('[{"name": "Ada"}]\n');

        const preview = await previewFile();
        expect(preview.dataFormatId).toBe('json');
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
        expect(preview.text).toBeUndefined();
    });

    it('identifies a binary format it does not list', async () => {
        stubFetchBytes(PNG_BYTES);

        const preview = await previewFile();

        expect(preview.fileTypeConfig?.ext).toBe('png');
        expect(preview.dataFormatId).toBeUndefined();
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

    it('rejects when the file cannot be fetched', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404, statusText: 'Not Found' })));

        await expect(previewFile()).rejects.toThrow(`Failed to fetch '${URL}' file.`);
    });
});
