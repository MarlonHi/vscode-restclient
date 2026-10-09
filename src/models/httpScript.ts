export enum ScriptType {
    PreRequest = 'pre-request',
    PostResponse = 'post-response',
}

export type ScriptSource =
    | { readonly kind: 'inline'; readonly type: ScriptType; readonly code: string; readonly lineOffset: number }
    | { readonly kind: 'file'; readonly type: ScriptType; readonly path: string };

export interface TestResult {
    readonly name: string;
    readonly passed: boolean;
    readonly message?: string;
    readonly durationInMilliseconds: number;
}

export interface ScriptExecutionResult {
    readonly tests: TestResult[];
    readonly logs: string[];
    readonly error?: string;
}

export function getScriptDisplayName(source: ScriptSource): string {
    return source.kind === 'file' ? source.path : `inline ${source.type} script`;
}
