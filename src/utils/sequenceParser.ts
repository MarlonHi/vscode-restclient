import { TextDocument } from 'vscode';
import * as Constants from '../common/constants';
import { ScriptSource, ScriptType } from '../models/httpScript';
import { RequestMetadata } from '../models/requestMetadata';
import { RequestSequence } from '../models/requestSequence';
import { ScriptBlockParser } from './scriptBlockParser';
import { Selector } from './selector';

const sequenceRegex = /^\s*(?:#|\/{2})\s*@sequence(?:\s+(.*?))?\s*$/i;
const stepsRegex = /^\s*(?:#|\/{2})\s*@steps?\s+(.*?)\s*$/i;
const delayRegex = /^\s*(?:#|\/{2})\s*@delay\s+(\d+)\s*$/i;
const continueOnErrorRegex = /^\s*(?:#|\/{2})\s*@continue-on-error\s*$/i;
const preScriptRegex = /^\s*(?:#|\/{2})\s*@(?:prescript|pre-request-script)\s+(.*?)\s*$/i;

/**
 * Parses `# @sequence` blocks, e.g.
 *
 * ```
 * ###
 * # @sequence Smoke test
 * # @steps login, createUser, deleteUser
 * # @delay 200
 * ```
 */
export class SequenceParser {
    public static parse(document: TextDocument): RequestSequence[] {
        const lines = document.getText().split(Constants.LineSplitterRegex);
        const sequences: RequestSequence[] = [];

        for (const [start, end] of Selector.getBlockRanges(lines)) {
            const extracted = ScriptBlockParser.extract(lines.slice(start, end + 1));
            let name: string | undefined;
            let line = start;
            const steps: string[] = [];
            const setupScripts: ScriptSource[] = [];
            let delayInMilliseconds: number | undefined;
            let continueOnError = false;

            for (let index = start; index <= end; index++) {
                const text = lines[index];
                const sequenceMatch = text.match(sequenceRegex);
                if (sequenceMatch) {
                    name = sequenceMatch[1]?.trim() || 'Unnamed sequence';
                    line = index;
                    continue;
                }

                const stepsMatch = text.match(stepsRegex);
                if (stepsMatch) {
                    steps.push(...stepsMatch[1].split(',').map(s => s.trim()).filter(s => s !== ''));
                    continue;
                }

                const delayMatch = text.match(delayRegex);
                if (delayMatch) {
                    delayInMilliseconds = +delayMatch[1];
                    continue;
                }

                const preScriptMatch = text.match(preScriptRegex);
                if (preScriptMatch) {
                    setupScripts.push(...preScriptMatch[1]
                        .split(',')
                        .map(p => p.trim())
                        .filter(p => p !== '')
                        .map<ScriptSource>(path => ({ kind: 'file', type: ScriptType.PreRequest, path })));
                    continue;
                }

                if (continueOnErrorRegex.test(text)) {
                    continueOnError = true;
                }
            }

            if (name !== undefined && steps.length > 0) {
                sequences.push({
                    name,
                    steps,
                    line,
                    delayInMilliseconds,
                    continueOnError,
                    setupScripts: [...setupScripts, ...extracted.preRequestScripts]
                });
            }
        }

        return sequences;
    }

    /**
     * Metadata of the block which contains the given line.
     */
    public static getBlockMetadatas(document: TextDocument, line: number): Map<RequestMetadata, string | undefined> {
        const lines = document.getText().split(Constants.LineSplitterRegex);
        const block = Selector.getBlockRanges(lines).find(([start, end]) => line >= start && line <= end);
        if (!block) {
            return new Map();
        }

        return Selector.parseReqMetadatas(ScriptBlockParser.extract(lines.slice(block[0], block[1] + 1)).lines);
    }

    /**
     * Maps the name of every named request of the document to a line inside its block.
     */
    public static getNamedRequestLines(document: TextDocument): Map<string, number> {
        const lines = document.getText().split(Constants.LineSplitterRegex);
        const namedRequests = new Map<string, number>();

        for (const [start, end] of Selector.getBlockRanges(lines)) {
            if (!this.containsRequest(lines, start, end)) {
                continue;
            }

            for (let index = start; index <= end; index++) {
                const name = Selector.getRequestVariableDefinitionName(lines[index]);
                if (name && !namedRequests.has(name)) {
                    namedRequests.set(name, start);
                    break;
                }
            }
        }

        return namedRequests;
    }

    /**
     * Start lines of every block of the document that contains an actual request, in file order.
     */
    public static getRequestBlockLines(document: TextDocument): number[] {
        const lines = document.getText().split(Constants.LineSplitterRegex);
        return Selector.getBlockRanges(lines)
            .filter(([start, end]) => this.containsRequest(lines, start, end))
            .map(([start]) => start);
    }

    private static containsRequest(lines: string[], start: number, end: number): boolean {
        const blockLines = ScriptBlockParser.extract(lines.slice(start, end + 1)).lines;
        return Selector.getRequestRanges(blockLines).length > 0;
    }
}
