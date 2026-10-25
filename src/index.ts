// ── External Dependencies & Registrations
import { detectAll } from 'jschardet';
import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';

// ── DPUse Framework
import { buildFetchError, extractExtensionFromPath, isEncodingTypeId, resolveDecoderId } from '@dpuse/dpuse-shared';
import type { DataFormatId, EncodingDetectionConfig } from '@dpuse/dpuse-shared';

// ── Data

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FilePreviewResult {
    bytes: Uint8Array;
    dataFormatId: DataFormatId | undefined;
    encodingId: string | undefined;
    encodingConfidenceLevel: number | undefined;
    encodingCandidates: EncodingDetectionConfig[] | undefined; // Every encoding scoring at least the minimum confidence, best first.
    fileTypeConfig: FileTypeResult | undefined;
    isComplete: boolean; // Whether the preview holds the whole file rather than only its start.
    text: string | undefined;
}
// What the user chose in place of what detection found. Either can be left to detection.
export interface PreviewChoices {
    dataFormatId: DataFormatId | undefined;
    encodingId: string | undefined;
}
type PreviewContent = Omit<FilePreviewResult, 'isComplete'>;
type DataFileStructure =
    | 'table' // single native table
    | 'records' // schema'd records, may need flattening
    | 'database' // multiple tables/views
    | 'workbook' // sheets requiring header/range inference
    | 'tree'; // hierarchical, requires mapping

// What the next token in a JSON text must be, and where reading has got to.
type JSONExpectation = 'closeOrKey' | 'closeOrValue' | 'colon' | 'commaOrClose' | 'end' | 'key' | 'value';
interface JSONPosition {
    expectation: JSONExpectation;
    index: number;
}

type DecodingEncoding = Omit<EncodingDetectionConfig, 'id'> & { id: string }; // An XML file can name any encoding, not just the ids detection reports.

interface DataFileTypeConfig {
    label: string;
    structure: DataFileStructure;
    isAutoDetectable: boolean;
}
// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

const DEFAULT_MINIMUM_CONFIDENCE_LEVEL = 0.2; // jschardet's own default.
const DEFAULT_PREVIEW_CHUNK_SIZE = 4096;
const MARKDOWN_PREVIEW_CHUNK_SIZE = 65_536; // Markdown shows as a document, so enough to hold most READMEs and notes whole.

const FALLBACK_ENCODING: EncodingDetectionConfig = { id: 'utf-8', confidenceLevel: undefined };

// The 'encoding' in an XML declaration, e.g. '<?xml version="1.0" encoding="ISO-8859-1"?>'. The declaration is short,
// so the first bytes always hold it.
const XML_DECLARATION_BYTE_COUNT = 256;
const XML_DECLARATION_ENCODING_PATTERN = /^<\?xml\s[^?]*?\bencoding\s*=\s*(["'])([A-Za-z][\w.:-]*)\1/;

const JSON_LITERALS = ['false', 'null', 'true'];
const JSON_WHITESPACE_CHARACTERS = new Set([' ', '\t', '\n', '\r']);

// Markdown cannot be told apart from plain or delimited text by its content, so the item's MIME type decides, or its
// extension when there is no type. 'application/octet-stream' says nothing about the content, so it counts as no type.
// Plain text is told apart from delimited text by parsing it, so '.txt' files, often tab-delimited exports, are not
// listed.
const MARKDOWN_EXTENSIONS = new Set(['markdown', 'md']);
const MARKDOWN_MIME_TYPE = 'text/markdown';
const UNKNOWN_MIME_TYPE = 'application/octet-stream';

// Keyed by the extension 'file-type' reports, which is also the format's id. Whether a format can be read is up to the
// app and the connectors, which have the readers, so every one listed here is reported as itself.
const AUTO_DETECTABLE_DATA_FILE_TYPE_MAP: Partial<Record<DataFormatId, DataFileTypeConfig>> = {
    arrow: { label: 'Columnar format for tables of data.', structure: 'table', isAutoDetectable: true },
    avro: { label: 'Object container file developed by Apache Avro.', structure: 'records', isAutoDetectable: true },
    ods: { label: 'OpenDocument for spreadsheets.', structure: 'workbook', isAutoDetectable: true },
    parquet: { label: 'Apache Parquet.', structure: 'table', isAutoDetectable: true },
    sav: { label: 'SPSS statistical data file.', structure: 'table', isAutoDetectable: true },
    sqlite: { label: 'SQLite file.', structure: 'database', isAutoDetectable: true },
    xlsx: { label: 'Microsoft Excel document.', structure: 'workbook', isAutoDetectable: true },
    xlsm: { label: 'Microsoft Excel macro-enabled document.', structure: 'workbook', isAutoDetectable: true },
    xml: { label: 'eXtensible markup language.', structure: 'tree', isAutoDetectable: true }
};

// ── Tools ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export class Tool {
    // 'minimumConfidenceLevel' (0 to 1) sets which encodings the candidate list includes. The best is always included.
    async previewFile(
        url: string,
        signal: AbortSignal,
        chunkSize?: number,
        mimeType?: string,
        minimumConfidenceLevel = DEFAULT_MINIMUM_CONFIDENCE_LEVEL,
        choices?: PreviewChoices
    ): Promise<FilePreviewResult> {
        const isMarkdown = determineIsMarkdown(mimeType, extractExtensionFromPath(new URL(url).pathname)?.toLowerCase());
        const requestedByteCount = chunkSize ?? (isMarkdown ? MARKDOWN_PREVIEW_CHUNK_SIZE : DEFAULT_PREVIEW_CHUNK_SIZE);
        const response = await fetch(encodeURI(url), { headers: { Range: `bytes=0-${String(requestedByteCount - 1)}` }, signal }); // Range ends are inclusive.
        // A file with no bytes has no first byte to send, so the store answers 'Range Not Satisfiable' (416).
        if (response.status === 416) return { ...(await previewFileBytes(new Uint8Array(0), isMarkdown, minimumConfidenceLevel, true)), isComplete: true };
        if (!response.ok) throw await buildFetchError(response, `Failed to fetch '${url}' file.`, 'dpuse-tool-file-previewer.previewRemoteFile');

        const fileBytes = new Uint8Array(await response.arrayBuffer());
        const isComplete = determineIsComplete(response, fileBytes.length, requestedByteCount);
        return { ...(await previewFileBytes(fileBytes, isMarkdown, minimumConfidenceLevel, isComplete, choices)), isComplete };
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// The store reports the whole file's size in 'Content-Range'. Without it, a store that ignored the range sent the whole
// file, and one that sent fewer bytes than asked for reached the end.
function determineIsComplete(response: Response, byteCount: number, requestedByteCount: number): boolean {
    const totalByteCount = /\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1];
    return totalByteCount == null ? response.status !== 206 || byteCount < requestedByteCount : byteCount >= Number(totalByteCount);
}

async function previewFileBytes(
    fileBytes: Uint8Array,
    isMarkdown: boolean,
    minimumConfidenceLevel: number,
    isComplete: boolean,
    choices?: PreviewChoices
): Promise<PreviewContent> {
    if (fileBytes.length === 0) {
        return {
            bytes: fileBytes,
            dataFormatId: undefined,
            encodingId: undefined,
            encodingConfidenceLevel: undefined,
            encodingCandidates: undefined,
            fileTypeConfig: undefined,
            text: undefined
        };
    }

    const fileTypeConfig = await fileTypeFromBuffer(fileBytes);
    if (fileTypeConfig != null) return previewDetectedFileType(fileBytes, fileTypeConfig, isComplete, choices);

    // Not identified by its content, so assumed to be text. JSON and JSON Lines are checked first, because their strict
    // syntax makes the check reliable whatever the extension. Otherwise the MIME type or extension tells markdown apart,
    // which content cannot, and the rest is taken as delimited text until parsing it shows otherwise.
    const encodingCandidates = determineEncodings(fileBytes, minimumConfidenceLevel);
    // TODO: Decode with the first candidate the browser can decode, rather than falling back to UTF-8 when the best
    // candidate cannot be decoded. Today the best candidate always goes to 'decodeFileBytes', and if 'TextDecoder'
    // rejects it (one of the 43 encodings jschardet detects that browsers cannot decode, e.g. 'MacLatin2' or
    // 'cp437'), the file is decoded and reported as UTF-8, with no confidence. Found in October 2026 with the small
    // mostly-ASCII Mac Roman CSV in this project's tests: jschardet's best guess was 'MacLatin2' (undecodable) and
    // its second, at the same 0.04 confidence, the correct 'MacRoman' (decodable as 'macintosh'). Taking the first
    // candidate whose 'resolveDecoderId' is a name 'TextDecoder' accepts would have decoded it correctly. It would
    // not help where the best guess is decodable but wrong, e.g. dpuse-shared's 'MacRoman.csv' sample, read as
    // 'ISO-8859-1'. Points to settle first: whether to look only at candidates above 'minimumConfidenceLevel' or
    // at the full list jschardet returns (in the test, the best was the only one above the default 0.2), and
    // whether 'encodingId' should report the candidate actually used, which may then differ from the first entry
    // in 'encodingCandidates'.
    const decodedResult = decodeFileBytes(fileBytes, constructChosenEncoding(choices) ?? encodingCandidates[0] ?? FALLBACK_ENCODING, isComplete);
    return {
        bytes: fileBytes,
        dataFormatId: choices?.dataFormatId ?? determineTextDataFormatId(decodedResult.text, isMarkdown),
        encodingId: decodedResult.encoding.id,
        encodingConfidenceLevel: decodedResult.encoding.confidenceLevel,
        encodingCandidates,
        fileTypeConfig,
        text: decodedResult.text
    };
}

// A type 'file-type' identified. XML is text and states its own encoding. The other types are mostly binary, so until
// each has its own reader their bytes are shown as text one character per byte, with no encoding reported, even one the
// user chose.
function previewDetectedFileType(fileBytes: Uint8Array, fileTypeConfig: FileTypeResult, isComplete: boolean, choices?: PreviewChoices): PreviewContent {
    const detectedDataFormatId = Object.hasOwn(AUTO_DETECTABLE_DATA_FILE_TYPE_MAP, fileTypeConfig.ext) ? (fileTypeConfig.ext as DataFormatId) : undefined; // A type that is not data, such as a PDF or an image, has no format.
    const dataFormatId = choices?.dataFormatId ?? detectedDataFormatId;
    if (fileTypeConfig.ext === 'xml') {
        const encoding = constructChosenEncoding(choices) ?? { id: determineXMLEncodingId(fileBytes), confidenceLevel: 1 };
        const decodedResult = decodeFileBytes(fileBytes, encoding, isComplete);
        return {
            bytes: fileBytes,
            dataFormatId,
            encodingId: decodedResult.encoding.id,
            encodingConfidenceLevel: decodedResult.encoding.confidenceLevel,
            encodingCandidates: undefined,
            fileTypeConfig,
            text: decodedResult.text
        };
    }

    return {
        bytes: fileBytes,
        dataFormatId,
        encodingId: undefined,
        encodingConfidenceLevel: undefined,
        encodingCandidates: undefined,
        fileTypeConfig,
        text: decodeBytesAsCharacters(fileBytes)
    };
}

// Binary bytes are not valid UTF-8, which would show most of them as replacement characters. Windows-1252 gives every
// byte a character, so readable parts such as 'PAR1' or a column name still show. Control characters, which would
// disturb the display, are shown as a middle dot, apart from the tab and the line breaks.
function decodeBytesAsCharacters(fileBytes: Uint8Array): string {
    const characters = Array.from(new TextDecoder('windows-1252').decode(fileBytes), (character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        const isControl = (codePoint < 0x20 && character !== '\t' && character !== '\n' && character !== '\r') || (codePoint >= 0x7f && codePoint <= 0x9f);
        return isControl ? '·' : character;
    });
    return characters.join('');
}

/**
 * Determine the likely encodings from file bytes, best first, keeping those scoring at least the minimum confidence and
 * always the best. Confidence runs from 0 to 1, as jschardet reports it. A byte order mark settles it outright.
 */
function determineEncodings(fileBytes: Uint8Array, minimumConfidenceLevel: number): EncodingDetectionConfig[] {
    const byteOrderMarkEncoding = determineByteOrderMarkEncoding(fileBytes);
    if (byteOrderMarkEncoding != null) return [byteOrderMarkEncoding];
    const detections = detectAll(fileBytes, { minimumThreshold: 0 });
    const candidates: EncodingDetectionConfig[] = [];
    for (const { confidence, encoding } of detections) {
        if (encoding != null && isEncodingTypeId(encoding)) candidates.push({ confidenceLevel: confidence, id: encoding });
    }
    return candidates.filter(({ confidenceLevel = 0 }, index) => index === 0 || confidenceLevel >= minimumConfidenceLevel);
}

function determineByteOrderMarkEncoding(fileBytes: Uint8Array): EncodingDetectionConfig | undefined {
    if (fileBytes[0] === 239 && fileBytes[1] === 187 && fileBytes[2] === 191) return { confidenceLevel: 1, id: 'UTF-8-SIG' };
    if (fileBytes[0] === 254 && fileBytes[1] === 255) return { confidenceLevel: 1, id: 'utf-16-be' };
    return fileBytes[0] === 255 && fileBytes[1] === 254 ? { confidenceLevel: 1, id: 'utf-16-le' } : undefined;
}

// XML's own rules (XML 1.0, Appendix F): a byte order mark settles it, then the 'encoding' in the XML declaration, and
// otherwise UTF-8. Without a byte order mark, the declaration reads the same as ASCII in every encoding XML allows.
function determineXMLEncodingId(fileBytes: Uint8Array): string {
    const declaration = new TextDecoder('ascii').decode(fileBytes.subarray(0, XML_DECLARATION_BYTE_COUNT));
    return determineByteOrderMarkEncoding(fileBytes)?.id ?? XML_DECLARATION_ENCODING_PATTERN.exec(declaration)?.[2] ?? 'utf-8';
}

// TODO: Consider decoding the encodings browsers cannot. jschardet detects 86 encodings, but the browser's
// 'TextDecoder' decodes only 43 of them, so a file in one of the other 43 falls back to UTF-8 and comes out garbled.
// Findings from October 2026, tested on dpuse-shared's encoding samples:
// - iconv-lite 0.7.3 decodes 31 of the 43 exactly: UTF-16 with a byte-order mark, UTF-32, UTF-7, the DOS code pages
//   (cp437, cp850, cp852 and others), MacGreek, MacIceland, MacLatin2, MacTurkish, koi8-t, KZ1048, ptcp154 and
//   hp-roman8. It cannot decode the mainframe (EBCDIC) encodings, HZ-GB-2312, ISO-2022-KR, the newer ISO-2022-JP
//   variants, Johab or cp1006.
// - In the browser, iconv-lite adds about 200 KB gzipped, and needs stand-ins for Node's 'Buffer' and 'string_decoder'.
// - A cheaper way to the same 31: 26 of them are single-byte, i.e. a 256-entry lookup table each. Generate the tables
//   once from iconv-lite's data, ship them in dpuse-shared with a small decoder, and decode UTF-16, UTF-32 and UTF-7 by
//   hand. An estimated 10-20 KB, no stand-ins, and iconv-lite is needed only to build the tables.
// Not done yet because these encodings are rare, and comparable tools (Power Query, Google Sheets) do not decode them
// either: they assume UTF-8 and let the user choose from common code pages. A manual encoding override in the app,
// prompted when jschardet's confidence is low, is the better next step.
/**
 * Decode file bytes to text. A preview cut short ends part-way through a line, which is dropped. A whole file keeps its
 * last line.
 */
// An encoding the user chose is certain, as one an XML declaration states is.
function constructChosenEncoding(choices: PreviewChoices | undefined): DecodingEncoding | undefined {
    return choices?.encodingId == null ? undefined : { id: choices.encodingId, confidenceLevel: 1 };
}

function decodeFileBytes(fileBytes: Uint8Array, encoding: DecodingEncoding, isComplete: boolean): { encoding: DecodingEncoding; text: string } {
    const textBytes = isComplete ? fileBytes : truncateData(fileBytes);
    try {
        const text = new TextDecoder(resolveDecoderId(encoding.id)).decode(textBytes);
        return { encoding, text };
    } catch {
        const text = new TextDecoder(FALLBACK_ENCODING.id, { fatal: false }).decode(textBytes);
        return { encoding: FALLBACK_ENCODING, text };
    }
}

function determineIsMarkdown(mimeType: string | undefined, extension: string | undefined): boolean {
    const mediaType = mimeType?.split(';', 1)[0]?.trim().toLowerCase(); // A type can carry parameters, e.g. 'text/markdown; charset=UTF-8'.
    const isTypeKnown = mediaType != null && mediaType !== '' && mediaType !== UNKNOWN_MIME_TYPE;
    return isTypeKnown ? mediaType === MARKDOWN_MIME_TYPE : extension != null && MARKDOWN_EXTENSIONS.has(extension);
}

function determineTextDataFormatId(text: string, isMarkdown: boolean): DataFormatId {
    if (isLikelyJSONFormat(text)) return 'json';
    if (isLikelyJSONLinesFormat(text)) return 'jsonl';
    return isMarkdown ? 'markdown' : 'dtv';
}

// Whether the text is JSON, or JSON cut off where the preview ends: one object or array whose every token is valid as
// far as the text goes. One wrong token rules it out, so a bracketed CSV header ('[Id],[Name]'), an INI section or a
// log line starting with '[' is not taken for JSON. So does a second value after the first ends, as in JSON Lines.
function isLikelyJSONFormat(text: string): boolean {
    const openBrackets: string[] = [];
    const firstIndex = text.search(/\S/);
    if (text[firstIndex] !== '{' && text[firstIndex] !== '[') return false;
    let position: JSONPosition | undefined = { expectation: 'value', index: firstIndex };
    while (position != null && position.index < text.length) position = readJSONToken(text, position, openBrackets);
    return position != null;
}

// Whether every line holds one whole JSON object or array, as JSON Lines does. A single line of JSON is just JSON, so
// at least two are needed. The preview ends at a line break, so its last line is whole.
function isLikelyJSONLinesFormat(text: string): boolean {
    const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '');
    return lines.length > 1 && lines.every((line) => isJSONObjectOrArray(line));
}

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

// The index after a string's closing quote. A string the text ends inside counts as cut off, not wrong.
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

// The index after a number, 'true', 'false' or 'null'. One the text ends inside counts as cut off, not wrong.
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

/**
 * Returns the leading bytes up to (but not including) the last CRLF (13,10),
 * CR (13), or LF (10) byte sequence. Returns all bytes if no end-of-line
 * sequence is found.
 */
function truncateData(fileBytes: Uint8Array): Uint8Array {
    let transformedData = fileBytes;
    const characterCount = transformedData.length;
    for (let characterIndex = characterCount - 1; characterIndex >= 0; characterIndex--) {
        const character = transformedData[characterIndex];
        if (character === 10 && characterIndex > 0 && transformedData[characterIndex - 1] === 13) {
            transformedData = transformedData.slice(0, characterIndex - 1);
            break;
        }
        if (character === 10 || character === 13) {
            transformedData = transformedData.slice(0, characterIndex);
            break;
        }
    }
    return transformedData;
}
