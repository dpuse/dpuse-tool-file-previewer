// ── External Dependencies & Registrations
import { detectAll } from 'jschardet';
import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';

// ── DPUse Framework
import { buildFetchError, isEncodingTypeId, resolveDecoderId } from '@dpuse/dpuse-shared';
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
    text: string | undefined;
}

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

const DEFAULT_MINIMUM_CONFIDENCE_LEVEL = 0.2; // jschardet's own default.
const DEFAULT_PREVIEW_CHUNK_SIZE = 4096;

const FALLBACK_ENCODING: EncodingDetectionConfig = { id: 'utf-8', confidenceLevel: undefined };

const FILE_TYPE_MAP: Record<string, { label: string; isAutoDetectable: boolean; isSupported: boolean; magicBytes?: number[]; notes: string }> = {
    arrow: { label: 'Columnar format for tables of data.', isAutoDetectable: true, isSupported: false, notes: '' },
    avro: { label: 'Object container file developed by Apache Avro.', isAutoDetectable: true, isSupported: false, notes: '' },
    docx: { label: 'Microsoft Word document.', isAutoDetectable: true, isSupported: false, notes: '' },
    ics: { label: 'iCalendar.', isAutoDetectable: true, isSupported: false, notes: '' },
    jmp: { label: 'JMP data file format by SAS Institute.', isAutoDetectable: true, isSupported: false, notes: '' },
    ods: { label: 'OpenDocument for spreadsheets.', isAutoDetectable: true, isSupported: false, notes: '' },
    ots: { label: 'OpenDocument for word processing.', isAutoDetectable: true, isSupported: false, notes: '' },
    parquet: { label: 'Apache Parquet.', isAutoDetectable: true, isSupported: false, notes: '' },
    pcap: { label: 'Libpcap file format.', isAutoDetectable: true, isSupported: false, notes: '' },
    pdf: { label: 'Portable document format.', isAutoDetectable: true, isSupported: false, notes: '' },
    por: { label: 'SPSS portable file.', isAutoDetectable: false, isSupported: false, magicBytes: [0x53, 0x50, 0x53, 0x53, 0x50, 0x4f, 0x52, 0x54], notes: '' },
    sav: { label: 'SPSS statistical data file.', isAutoDetectable: true, isSupported: false, magicBytes: [0x24, 0x46, 0x4c, 0x32], notes: '' },
    shp: { label: 'Geospatial vector data format.', isAutoDetectable: true, isSupported: false, notes: '' },
    sqlite: { label: 'SQLite file.', isAutoDetectable: true, isSupported: false, notes: '' },
    vcf: { label: 'vCard.', isAutoDetectable: true, isSupported: false, notes: '' },
    vtt: { label: 'WebVTT File (for video captions).', isAutoDetectable: true, isSupported: false, notes: '' },
    xls: { label: 'Microsoft Excel legacy document.', isAutoDetectable: false, isSupported: false, magicBytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], notes: '' },
    xlsx: { label: 'Microsoft Excel document.', isAutoDetectable: true, isSupported: false, magicBytes: [0x50, 0x4b, 0x03, 0x04], notes: '' },
    xlsm: { label: 'Microsoft Excel macro-enabled document.', isAutoDetectable: true, isSupported: false, notes: '' },
    xltx: { label: 'Microsoft Excel template.', isAutoDetectable: true, isSupported: false, notes: '' },
    xltm: { label: 'Microsoft Excel macro-enabled template.', isAutoDetectable: true, isSupported: false, notes: '' },
    xml: { label: 'eXtensible markup language.', isAutoDetectable: true, isSupported: false, notes: '' }
};

// ── Tools ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export class Tool {
    // 'minimumConfidenceLevel' (0 to 1) sets which encodings the candidate list includes. The best is always included.
    async previewFile(url: string, signal: AbortSignal, chunkSize?: number, minimumConfidenceLevel = DEFAULT_MINIMUM_CONFIDENCE_LEVEL): Promise<FilePreviewResult> {
        // TODO: Asks for one byte too many when 'chunkSize' is given: the '- 1' applies only to the default, as '??'
        // binds more loosely than '-'. Range ends are inclusive, so write '(chunkSize ?? DEFAULT_PREVIEW_CHUNK_SIZE) - 1'.
        const response = await fetch(encodeURI(url), { headers: { Range: `bytes=0-${String(chunkSize ?? DEFAULT_PREVIEW_CHUNK_SIZE - 1)}` }, signal });
        if (!response.ok) throw await buildFetchError(response, `Failed to fetch '${url}' file.`, 'dpuse-tool-file-previewer.previewRemoteFile');

        const fileBytes = new Uint8Array(await response.arrayBuffer());
        return await previewFileBytes(fileBytes, minimumConfidenceLevel);
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

async function previewFileBytes(fileBytes: Uint8Array, minimumConfidenceLevel: number): Promise<FilePreviewResult> {
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

    if (fileTypeConfig == null) {
        // We were not able to determine a type by analysing the file content.
        // Assume it is a text file testing for 'json' and defaulting to 'dtv'.
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
        const decodedResult = decodeFileBytes(fileBytes, encodingCandidates[0] ?? FALLBACK_ENCODING);
        return {
            bytes: fileBytes,
            dataFormatId: isLikelyJSONFormat(decodedResult.text) ? 'json' : 'dtv',
            encodingId: decodedResult.encoding.id,
            encodingConfidenceLevel: decodedResult.encoding.confidenceLevel,
            encodingCandidates,
            fileTypeConfig,
            text: decodedResult.text
        };
    }

    const lookupFileTypeConfig = FILE_TYPE_MAP[fileTypeConfig.ext];
    if (lookupFileTypeConfig != null) {
        // We have a type.
        return {
            bytes: fileBytes,
            dataFormatId: lookupFileTypeConfig.isSupported ? (fileTypeConfig.ext as DataFormatId) : undefined,
            encodingId: undefined,
            encodingConfidenceLevel: undefined,
            encodingCandidates: undefined,
            fileTypeConfig,
            text: undefined
        };
    }

    return {
        bytes: fileBytes,
        dataFormatId: undefined,
        encodingId: undefined,
        encodingConfidenceLevel: undefined,
        encodingCandidates: undefined,
        fileTypeConfig,
        text: undefined
    };
}

/**
 * Determine the likely encodings from file bytes, best first, keeping those scoring at least the minimum confidence and
 * always the best. Confidence runs from 0 to 1, as jschardet reports it. A byte order mark settles it outright.
 */
function determineEncodings(fileBytes: Uint8Array, minimumConfidenceLevel: number): EncodingDetectionConfig[] {
    if (fileBytes[0] === 239 && fileBytes[1] === 187 && fileBytes[2] === 191) return [{ confidenceLevel: 1, id: 'UTF-8-SIG' }];
    if (fileBytes[0] === 254 && fileBytes[1] === 255) return [{ confidenceLevel: 1, id: 'utf-16-be' }];
    if (fileBytes[0] === 255 && fileBytes[1] === 254) return [{ confidenceLevel: 1, id: 'utf-16-le' }];
    const detections = detectAll(fileBytes, { minimumThreshold: 0 });
    const candidates: EncodingDetectionConfig[] = [];
    for (const { confidence, encoding } of detections) {
        if (encoding != null && isEncodingTypeId(encoding)) candidates.push({ confidenceLevel: confidence, id: encoding });
    }
    return candidates.filter(({ confidenceLevel = 0 }, index) => index === 0 || confidenceLevel >= minimumConfidenceLevel);
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
 * Decode file bytes to text.
 */
function decodeFileBytes(fileBytes: Uint8Array, encoding: EncodingDetectionConfig): { encoding: EncodingDetectionConfig; text: string } {
    try {
        const text = new TextDecoder(resolveDecoderId(encoding.id)).decode(truncateData(fileBytes));
        return { encoding, text };
    } catch {
        const text = new TextDecoder(FALLBACK_ENCODING.id, { fatal: false }).decode(truncateData(fileBytes));
        return { encoding: FALLBACK_ENCODING, text };
    }
}

function isLikelyJSONFormat(text: string): boolean {
    const trimmedText = text.trimStart();
    if (trimmedText.length > 2) {
        const firstChar = trimmedText[0];
        const isObjectStart = firstChar === '{';
        const isArrayStart = firstChar === '[';
        const hasKeyValue = /"\s*:\s*/.test(trimmedText); // "key": something
        const hasJSONLiterals = /\b(?:true|false|null)\b/.test(trimmedText);
        const hasQuotes = trimmedText.includes('"');
        return (isObjectStart || isArrayStart) && (hasKeyValue || hasJSONLiterals || hasQuotes);
    }
    return false;
}

/**
 * Is likely XML format. This is an alternative xml file identifier if 'file-type' xml identification proves unsatisfactory.
 */
function isLikelyXMLFormat(text: string): boolean {
    const trimmedText = text.trimStart();
    return trimmedText.startsWith('<?xml') || /^<[a-z_][\w\-.:]*[\s>]/i.test(trimmedText);
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
