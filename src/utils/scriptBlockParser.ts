import { ScriptSource, ScriptType } from '../models/httpScript';

const blockStartRegex = /^\s*([<>])\s*\{%\s*$/;
const blockEndRegex = /^\s*%\}\s*$/;
const singleLineBlockRegex = /^\s*([<>])\s*\{%(.*)%\}\s*$/;

export interface ExtractedScripts {
    /** Lines of the request block with all inline script blocks removed. */
    lines: string[];
    preRequestScripts: ScriptSource[];
    postResponseScripts: ScriptSource[];
}

/**
 * Parses inline script blocks written as `< {% ... %}` (pre-request) and `> {% ... %}` (post-response).
 */
export class ScriptBlockParser {
    public static extract(lines: string[]): ExtractedScripts {
        const remaining: string[] = [];
        const preRequestScripts: ScriptSource[] = [];
        const postResponseScripts: ScriptSource[] = [];

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];

            const singleLineMatch = line.match(singleLineBlockRegex);
            if (singleLineMatch) {
                this.addScript(preRequestScripts, postResponseScripts, singleLineMatch[1], singleLineMatch[2], index);
                continue;
            }

            const startMatch = line.match(blockStartRegex);
            if (!startMatch) {
                remaining.push(line);
                continue;
            }

            const bodyLines: string[] = [];
            let cursor = index + 1;
            let closed = false;
            while (cursor < lines.length) {
                if (blockEndRegex.test(lines[cursor])) {
                    closed = true;
                    break;
                }
                bodyLines.push(lines[cursor]);
                cursor++;
            }

            if (!closed) {
                // Unterminated block: treat the opening line as regular content to avoid swallowing the request.
                remaining.push(line);
                continue;
            }

            this.addScript(preRequestScripts, postResponseScripts, startMatch[1], bodyLines.join('\n'), index + 1);
            index = cursor;
        }

        return { lines: remaining, preRequestScripts, postResponseScripts };
    }

    public static containsScriptBlock(lines: string[]): boolean {
        return lines.some(line => blockStartRegex.test(line) || singleLineBlockRegex.test(line));
    }

    private static addScript(
        preRequestScripts: ScriptSource[],
        postResponseScripts: ScriptSource[],
        marker: string,
        code: string,
        lineOffset: number): void {
        if (code.trim() === '') {
            return;
        }

        if (marker === '<') {
            preRequestScripts.push({ kind: 'inline', type: ScriptType.PreRequest, code, lineOffset });
        } else {
            postResponseScripts.push({ kind: 'inline', type: ScriptType.PostResponse, code, lineOffset });
        }
    }
}
