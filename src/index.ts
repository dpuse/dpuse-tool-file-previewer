// ── External Dependencies & Registrations
import chardet from 'chardet';
import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';

// ── DPUse Framework
import { buildFetchError } from '@dpuse/dpuse-shared/errors';
import type { DataFormatId } from '@dpuse/dpuse-shared/component/dataView';
import type { EncodingDetectionConfig } from '@dpuse/dpuse-shared/encoding';

// ── Data
import { isEncodingTypeId } from '@dpuse/dpuse-shared/encoding';

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FilePreviewResult {
    bytes: Uint8Array;
    dataFormatId: DataFormatId | undefined;
    encodingId: string | undefined;
    encodingConfidenceLevel: number | undefined;
    fileTypeConfig: FileTypeResult | undefined;
    text: string | undefined;
}

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

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
    async previewFile(url: string, signal: AbortSignal, chunkSize?: number): Promise<FilePreviewResult> {
        const response = await fetch(encodeURI(url), { headers: { Range: `bytes=0-${String(chunkSize ?? DEFAULT_PREVIEW_CHUNK_SIZE - 1)}` }, signal });
        if (!response.ok) throw await buildFetchError(response, `Failed to fetch '${url}' file.`, 'dpuse-tool-file-previewer.previewRemoteFile');

        const fileBytes = new Uint8Array(await response.arrayBuffer());
        return await previewFileBytes(fileBytes);
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

async function previewFileBytes(fileBytes: Uint8Array): Promise<FilePreviewResult> {
    if (fileBytes.length === 0) {
        return {
            bytes: fileBytes,
            dataFormatId: undefined,
            encodingId: undefined,
            encodingConfidenceLevel: undefined,
            fileTypeConfig: undefined,
            text: undefined
        };
    }

    const fileTypeConfig = await fileTypeFromBuffer(fileBytes);

    if (fileTypeConfig == null) {
        // We were not able to determine a type by analysing the file content.
        // Assume it is a text file testing for 'json' and defaulting to 'dtv'.
        const fileEncoding = determineEncoding(fileBytes);
        const decodedResult = decodeFileBytes(fileBytes, fileEncoding);
        return {
            bytes: fileBytes,
            dataFormatId: isLikelyJSONFormat(decodedResult.text) ? 'json' : 'dtv',
            encodingId: decodedResult.encoding.id,
            encodingConfidenceLevel: decodedResult.encoding.confidenceLevel,
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
            fileTypeConfig,
            text: undefined
        };
    }

    return {
        bytes: fileBytes,
        dataFormatId: undefined,
        encodingId: undefined,
        encodingConfidenceLevel: undefined,
        fileTypeConfig,
        text: undefined
    };
}

/**
 * Determine encoding from file bytes.
 */
function determineEncoding(fileBytes: Uint8Array): EncodingDetectionConfig {
    if (fileBytes[0] === 239 && fileBytes[1] === 187 && fileBytes[2] === 191) return { confidenceLevel: 100, id: 'utf-8' };
    if (fileBytes[0] === 254 && fileBytes[1] === 255) return { confidenceLevel: 100, id: 'utf-16be' };
    if (fileBytes[0] === 255 && fileBytes[1] === 254) return { confidenceLevel: 100, id: 'utf-16le' };
    const detectedEncodings = chardet.analyse(fileBytes);
    const detectedEncoding = detectedEncodings[0] ?? { confidence: undefined, name: 'utf-8' };
    const detectedName = detectedEncoding.name.toLowerCase();
    return { confidenceLevel: detectedEncoding.confidence, id: isEncodingTypeId(detectedName) ? detectedName : 'utf-8' };
}

/**
 * Decode file bytes to text.
 */
function decodeFileBytes(fileBytes: Uint8Array, encoding: EncodingDetectionConfig): { encoding: EncodingDetectionConfig; text: string } {
    try {
        const text = new TextDecoder(encoding.id).decode(truncateData(fileBytes));
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
