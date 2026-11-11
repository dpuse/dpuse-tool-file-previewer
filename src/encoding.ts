// ── External Dependencies & Registrations
import { detectAll } from 'jschardet';

// ── DPUse Framework
import type { EncodingDetectionConfig, EncodingSourceId } from '@dpuse/dpuse-shared';
import { isEncodingTypeId, resolveDecoderId } from '@dpuse/dpuse-shared';

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DecodingEncoding {
    confidenceLevel: number | undefined;
    id: string; // Any encoding name, not just the ids detection reports, because an XML file can name any encoding.
}

// The encoding to decode a file with, and how it was found.
export interface EncodingDetection {
    encoding: DecodingEncoding;
    sourceId: EncodingSourceId;
}

export interface DecodedText {
    encoding: DecodingEncoding; // The encoding actually used, which is UTF-8 when the one asked for cannot be decoded.
    replacementCharacterCount: number;
    text: string;
}

// ── Constants ────────────────────────────────────────────────────────────────────────────────────────────────────────

const FALLBACK_ENCODING: EncodingDetectionConfig = { id: 'utf-8', confidenceLevel: undefined };

// The encoding named in an XML declaration, which is always at the start of the file.
const XML_DECLARATION_ENCODING_PATTERN = /^<\?xml\s[^?]*?\bencoding\s*=\s*(["'])([A-Za-z][\w.:-]*)\1/;

// ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// Works out the encoding of a text file, and lists every candidate, best first. A byte order mark is certain. Text that
// is all ASCII gives no evidence, because other characters may come later in the file, so no candidates are listed and
// UTF-8 is assumed. Text that is valid UTF-8 and has other characters is almost certainly UTF-8. Only the rest goes to
// jschardet. jschardet reports many encodings that the browser cannot decode, so the first candidate that the browser
// can decode is used.
export function detectTextEncoding(fileBytes: Uint8Array, isComplete: boolean): EncodingDetection & { candidates: EncodingDetectionConfig[] } {
    const byteOrderMarkEncoding = determineByteOrderMarkEncoding(fileBytes);
    if (byteOrderMarkEncoding != null) return { candidates: [byteOrderMarkEncoding], encoding: byteOrderMarkEncoding, sourceId: 'byteOrderMark' };
    if (fileBytes.every((byte) => byte < 0x80)) return { candidates: [], encoding: FALLBACK_ENCODING, sourceId: 'asciiAssumption' };
    if (isValidUTF8(fileBytes, isComplete)) {
        const utf8Encoding: EncodingDetectionConfig = { confidenceLevel: 1, id: 'utf-8' };
        return { candidates: [utf8Encoding], encoding: utf8Encoding, sourceId: 'utf8Validation' };
    }

    const candidates = listDetectedEncodings(fileBytes);
    const decodableEncoding = candidates.find(({ id }) => isEncodingDecodable(id));
    return decodableEncoding == null ? { candidates, encoding: FALLBACK_ENCODING, sourceId: 'fallback' } : { candidates, encoding: decodableEncoding, sourceId: 'detection' };
}

// Works out the encoding of an XML file by XML's own rules (XML 1.0, Appendix F). A byte order mark decides first, then
// the encoding that the XML declaration names, and otherwise UTF-8. Without a byte order mark, the declaration can be
// read as ASCII in every encoding that XML allows.
export function detectXMLEncoding(fileBytes: Uint8Array): EncodingDetection {
    const byteOrderMarkEncoding = determineByteOrderMarkEncoding(fileBytes);
    if (byteOrderMarkEncoding != null) return { encoding: byteOrderMarkEncoding, sourceId: 'byteOrderMark' };
    const declaration = new TextDecoder('ascii').decode(fileBytes.subarray(0, 256)); // The declaration always sits in the first bytes.
    const declaredEncodingId = XML_DECLARATION_ENCODING_PATTERN.exec(declaration)?.[2];
    return declaredEncodingId == null
        ? { encoding: { confidenceLevel: 1, id: 'utf-8' }, sourceId: 'xmlDefault' }
        : { encoding: { confidenceLevel: 1, id: declaredEncodingId }, sourceId: 'xmlDeclaration' };
}

// TODO: Decode the 43 encodings jschardet detects that 'TextDecoder' cannot. iconv-lite decodes 31 of them but adds
// about 200 KB gzipped. Lookup tables built from its data would cost an estimated 10–20 KB. Low priority: these
// encodings are rare, and Power Query and Google Sheets do not decode them either.

// Decodes a file's bytes to text, using UTF-8 when the browser cannot decode the encoding asked for. A preview cut short
// drops its unfinished last line. The line is found in the decoded text, not the bytes, because a UTF-16 line break is
// two bytes. Streaming holds back a character cut in two at the end. The browser puts a '�' in place of every byte
// that the encoding cannot read, so counting them shows how badly the encoding fits the text.
export function decodeFileBytes(fileBytes: Uint8Array, encoding: DecodingEncoding, isComplete: boolean): DecodedText {
    const isFallback = !isEncodingDecodable(encoding.id);
    const decodingEncoding = isFallback ? FALLBACK_ENCODING : encoding;
    const decodedText = new TextDecoder(resolveDecoderId(decodingEncoding.id)).decode(fileBytes, { stream: !isComplete });
    const text = isComplete ? decodedText : dropPartialLastLine(decodedText);
    return { encoding: decodingEncoding, replacementCharacterCount: countReplacementCharacters(text), text };
}

// UTF-8 would turn most binary bytes into replacement characters. Windows-1252 maps every byte to a character, so
// readable parts such as 'PAR1' or column names still show. Control characters become a middle dot.
export function decodeBytesAsCharacters(fileBytes: Uint8Array): string {
    return new TextDecoder('windows-1252').decode(fileBytes).replaceAll(/(?![\t\n\r])\p{Cc}/gu, '·'); // Every control character except tab, LF and CR.
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function determineByteOrderMarkEncoding(fileBytes: Uint8Array): EncodingDetectionConfig | undefined {
    if (fileBytes[0] === 239 && fileBytes[1] === 187 && fileBytes[2] === 191) return { confidenceLevel: 1, id: 'utf-8-sig' };
    if (fileBytes[0] === 254 && fileBytes[1] === 255) return { confidenceLevel: 1, id: 'utf-16-be' };
    return fileBytes[0] === 255 && fileBytes[1] === 254 ? { confidenceLevel: 1, id: 'utf-16-le' } : undefined;
}

// Streaming lets a preview end part-way through a character without failing.
function isValidUTF8(fileBytes: Uint8Array, isComplete: boolean): boolean {
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(fileBytes, { stream: !isComplete });
        return true;
    } catch {
        return false;
    }
}

// Every encoding jschardet detects that is a DPUse encoding id, best first.
function listDetectedEncodings(fileBytes: Uint8Array): EncodingDetectionConfig[] {
    const candidates: EncodingDetectionConfig[] = [];
    const detections = detectAll(fileBytes, { minimumThreshold: 0 });
    for (const { confidence, encoding } of detections) {
        const encodingId = encoding?.toLowerCase(); // jschardet mixes cases, e.g. 'Windows-1251'; encoding ids are lower case.
        if (encodingId != null && isEncodingTypeId(encodingId)) candidates.push({ confidenceLevel: confidence, id: encodingId });
    }
    return candidates;
}

function isEncodingDecodable(encodingId: string): boolean {
    try {
        new TextDecoder(resolveDecoderId(encodingId));
        return true;
    } catch {
        return false;
    }
}

// Cuts before the last CRLF, CR or LF. Text with no line break is kept whole.
function dropPartialLastLine(text: string): string {
    const lineBreakIndex = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'));
    if (lineBreakIndex === -1) return text;
    return text.slice(0, text.charAt(lineBreakIndex) === '\n' && text.charAt(lineBreakIndex - 1) === '\r' ? lineBreakIndex - 1 : lineBreakIndex);
}

function countReplacementCharacters(text: string): number {
    return text.split('�').length - 1;
}
