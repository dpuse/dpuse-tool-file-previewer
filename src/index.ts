// ── External Dependencies & Registrations
import { fileTypeFromBuffer, type FileTypeResult } from 'file-type';

// ── DPUse Framework
import { buildFetchError, extractExtensionFromPath } from '@dpuse/dpuse-shared';
import type { DataFormatId, DataFormatSourceId, EncodingSourceId, FilePreviewerInterface, FilePreviewResult } from '@dpuse/dpuse-shared';

// ── Local Framework
import { decodeBytesAsCharacters, type DecodedText, decodeFileBytes, type DecodingEncoding } from '@/encoding';
import { detectTextEncoding, detectXMLEncoding, type EncodingDetection } from '@/encoding';
import { isLikelyJSONFormat, isLikelyJSONLinesFormat } from '@/jsonDetection';

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

const DEFAULT_PREVIEW_CHUNK_SIZE = 65_536; // Large enough to show most markdown files in full and to give encoding detection a good sample.

// Maps each file type that 'file-type' can detect to its data format. Types that are not data, such as PDF or PNG, are
// not listed.
const FILE_TYPE_TO_DATA_FORMAT_MAP: Record<string, DataFormatId> = {
    arrow: 'arrow',
    avro: 'avro',
    ods: 'ods',
    parquet: 'parquet',
    sav: 'sav',
    sqlite: 'sqlite',
    xlsx: 'xlsx',
    xlsm: 'xlsx', // An XLSM file is an XLSX file with macros, so it is read the same way.
    xml: 'xml'
};

const MARKDOWN_EXTENSIONS = new Set(['markdown', 'md']);

// ── Tools ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export class Tool implements FilePreviewerInterface {
    async previewFile(url: string, signal: AbortSignal, chunkSize?: number, mimeType?: string, encodingId?: string): Promise<FilePreviewResult> {
        const markdownSourceId = determineMarkdownSourceId(mimeType, extractExtensionFromPath(new URL(url).pathname)?.toLowerCase());
        const requestedByteCount = chunkSize ?? DEFAULT_PREVIEW_CHUNK_SIZE;
        const response = await fetch(encodeURI(url), { headers: { Range: `bytes=0-${String(requestedByteCount - 1)}` }, signal }); // Range ends are inclusive.
        if (response.status === 416) {
            // An empty file has no bytes to send, so the server replies with 416 'Range Not Satisfiable'.
            return previewFileBytes(new Uint8Array(0), markdownSourceId, true);
        }

        if (!response.ok) throw await buildFetchError(response, `Failed to fetch '${url}' file.`, 'dpuse-tool-file-previewer.Tool.previewFile');

        const { fileBytes, isCutShort } = await readResponseBytes(response, requestedByteCount);
        const isComplete = !isCutShort && determineIsComplete(response, fileBytes.length, requestedByteCount);
        return previewFileBytes(fileBytes, markdownSourceId, isComplete, encodingId);
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// Reads the response body, but stops at the requested size, in case the server ignored the range and is sending the
// whole file. It reads one chunk past the requested size, so that it can tell a file that is exactly the requested size
// from a larger one.
async function readResponseBytes(response: Response, requestedByteCount: number): Promise<{ fileBytes: Uint8Array; isCutShort: boolean }> {
    const chunks: Uint8Array[] = [];
    let byteCount = 0;
    const reader = response.body?.getReader();
    while (reader != null && byteCount <= requestedByteCount) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        byteCount += value.length;
    }
    const isCutShort = byteCount > requestedByteCount;
    if (isCutShort) await reader?.cancel();

    const fileBytes = new Uint8Array(byteCount);
    let offset = 0;
    for (const chunk of chunks) {
        fileBytes.set(chunk, offset);
        offset += chunk.length;
    }
    return { fileBytes: isCutShort ? fileBytes.subarray(0, requestedByteCount) : fileBytes, isCutShort };
}

// Returns true if the preview holds the whole file. The 'Content-Range' header gives the file's full size. Without that
// header, a 200 response holds the whole file, and a 206 response with fewer bytes than requested has reached the end
// of the file.
function determineIsComplete(response: Response, byteCount: number, requestedByteCount: number): boolean {
    const totalByteCount = /\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1];
    return totalByteCount == null ? response.status !== 206 || byteCount < requestedByteCount : byteCount >= Number(totalByteCount);
}

async function previewFileBytes(
    fileBytes: Uint8Array,
    markdownSourceId: DataFormatSourceId | undefined,
    isComplete: boolean,
    chosenEncodingId?: string
): Promise<FilePreviewResult> {
    if (fileBytes.length === 0) {
        return {
            bytes: fileBytes,
            dataFormatId: undefined,
            dataFormatSourceId: undefined,
            decodedEncodingId: undefined,
            encodingId: undefined,
            encodingConfidenceLevel: undefined,
            encodingSourceId: undefined,
            encodingCandidates: undefined,
            replacementCharacterCount: undefined,
            fileTypeConfig: undefined,
            isComplete,
            text: undefined
        };
    }

    const fileTypeConfig = await fileTypeFromBuffer(fileBytes);
    if (fileTypeConfig != null) return previewDetectedFileType(fileBytes, fileTypeConfig, isComplete, chosenEncodingId);

    // 'file-type' did not recognise the file, so it is treated as text.
    const detectedEncoding = detectTextEncoding(fileBytes, isComplete);
    const decodedText = decodeFileBytes(fileBytes, constructChosenEncoding(chosenEncodingId) ?? detectedEncoding.encoding, isComplete);
    return {
        bytes: fileBytes,
        ...determineTextDataFormat(decodedText.text, markdownSourceId),
        ...constructEncodingResult(detectedEncoding, decodedText),
        encodingCandidates: detectedEncoding.candidates,
        fileTypeConfig,
        isComplete,
        text: decodedText.text
    };
}

// Builds the preview for a file that 'file-type' recognised. XML is text and names its own encoding. The other types
// are binary, so their bytes are shown one character per byte, with no encoding, even if the user chose one.
function previewDetectedFileType(fileBytes: Uint8Array, fileTypeConfig: FileTypeResult, isComplete: boolean, chosenEncodingId: string | undefined): FilePreviewResult {
    const dataFormatId = Object.hasOwn(FILE_TYPE_TO_DATA_FORMAT_MAP, fileTypeConfig.ext) ? FILE_TYPE_TO_DATA_FORMAT_MAP[fileTypeConfig.ext] : undefined;
    const dataFormat = { dataFormatId, dataFormatSourceId: dataFormatId == null ? undefined : ('fileContent' as const) };
    if (fileTypeConfig.ext === 'xml') {
        const detectedEncoding = detectXMLEncoding(fileBytes);
        const decodedText = decodeFileBytes(fileBytes, constructChosenEncoding(chosenEncodingId) ?? detectedEncoding.encoding, isComplete);
        return {
            bytes: fileBytes,
            ...dataFormat,
            ...constructEncodingResult(detectedEncoding, decodedText),
            encodingCandidates: undefined,
            fileTypeConfig,
            isComplete,
            text: decodedText.text
        };
    }

    return {
        bytes: fileBytes,
        ...dataFormat,
        decodedEncodingId: undefined,
        encodingId: undefined,
        encodingConfidenceLevel: undefined,
        encodingSourceId: undefined,
        encodingCandidates: undefined,
        replacementCharacterCount: undefined,
        fileTypeConfig,
        isComplete,
        text: decodeBytesAsCharacters(fileBytes)
    };
}

// Returns the encoding the user chose, if any, with full confidence.
function constructChosenEncoding(encodingId: string | undefined): DecodingEncoding | undefined {
    return encodingId == null ? undefined : { id: encodingId, confidenceLevel: 1 };
}

// Reports the encoding that was detected, whatever was chosen, beside the encoding the text was actually decoded with.
function constructEncodingResult(
    detectedEncoding: EncodingDetection,
    decodedText: DecodedText
): { decodedEncodingId: string; encodingConfidenceLevel: number | undefined; encodingId: string; encodingSourceId: EncodingSourceId; replacementCharacterCount: number } {
    return {
        decodedEncodingId: decodedText.encoding.id,
        encodingId: detectedEncoding.encoding.id,
        encodingConfidenceLevel: detectedEncoding.encoding.confidenceLevel,
        encodingSourceId: detectedEncoding.sourceId,
        replacementCharacterCount: decodedText.replacementCharacterCount
    };
}

// Returns how the file was recognised as markdown, or undefined if it is not markdown. A file is markdown if its MIME
// type is 'text/markdown', or if it has no MIME type and its extension is '.md' or '.markdown'.
// 'application/octet-stream' is treated as no MIME type, because it only means "binary data".
function determineMarkdownSourceId(mimeType: string | undefined, extension: string | undefined): DataFormatSourceId | undefined {
    const mediaType = mimeType?.split(';', 1)[0]?.trim().toLowerCase(); // A type can carry parameters, e.g. 'text/markdown; charset=UTF-8'.
    const isTypeKnown = mediaType != null && mediaType !== '' && mediaType !== 'application/octet-stream';
    if (isTypeKnown) return mediaType === 'text/markdown' ? 'mimeType' : undefined;
    return extension != null && MARKDOWN_EXTENSIONS.has(extension) ? 'extension' : undefined;
}

// Works out the data format of a text file. JSON and JSON Lines are checked first, because their strict syntax makes
// them safe to recognise from the content alone. Markdown can only be recognised from its MIME type or extension.
// Anything else is treated as delimited text.
function determineTextDataFormat(text: string, markdownSourceId: DataFormatSourceId | undefined): { dataFormatId: DataFormatId; dataFormatSourceId: DataFormatSourceId } {
    if (isLikelyJSONFormat(text)) return { dataFormatId: 'json', dataFormatSourceId: 'jsonSyntax' };
    if (isLikelyJSONLinesFormat(text)) return { dataFormatId: 'jsonl', dataFormatSourceId: 'jsonSyntax' };
    if (markdownSourceId != null) return { dataFormatId: 'markdown', dataFormatSourceId: markdownSourceId };
    return { dataFormatId: 'dtv', dataFormatSourceId: 'default' };
}
