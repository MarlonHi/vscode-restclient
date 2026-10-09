import { ScriptSource, TestResult } from './httpScript';

export interface RequestSequence {
    readonly name: string;
    readonly steps: string[];
    /** Line of the `# @sequence` definition, used to anchor the code lens. */
    readonly line: number;
    readonly delayInMilliseconds?: number;
    readonly continueOnError?: boolean;
    /** Scripts of the sequence block, executed once before the first step. */
    readonly setupScripts: ScriptSource[];
}

export interface SequenceStepResult {
    readonly name: string;
    readonly succeeded: boolean;
    readonly skipped?: boolean;
    readonly message?: string;
    readonly durationInMilliseconds: number;
    readonly method?: string;
    readonly url?: string;
    readonly statusCode?: number;
    readonly statusMessage?: string;
    readonly tests: TestResult[];
}

export interface SequenceRunSummary {
    readonly title: string;
    readonly startedAt: number;
    readonly durationInMilliseconds: number;
    readonly steps: SequenceStepResult[];
    /** Steps that were never started because the run stopped early. */
    readonly skipped: number;
    readonly cancelled: boolean;
}
