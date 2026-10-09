import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as vm from 'vm';
import { Uri } from 'vscode';
import { RequestHeaders } from '../models/base';
import { SystemSettings } from '../models/configurationSettings';
import { HttpRequest } from '../models/httpRequest';
import { HttpResponse } from '../models/httpResponse';
import { getScriptDisplayName, ScriptExecutionResult, ScriptSource, TestResult } from '../models/httpScript';
import { HttpClient } from './httpClient';
import { MimeUtility } from './mimeUtility';
import { getContentType } from './misc';
import { ScriptVariableStore } from './scriptVariableStore';
import { VariableProcessor } from './variableProcessor';

export interface ScriptRequestContext {
    /** Name of the request the script belongs to, if it is a named request. */
    readonly requestName?: string;
    /** Uri of the http file the script was defined in, used to resolve relative script paths. */
    readonly documentUri?: Uri;
    /** Variables set by the script, only valid for the current request. */
    readonly variables: Map<string, string>;
    /** Headers added (value) or removed (null) by a pre-request script. */
    readonly headers: Map<string, string | null>;
}

type SendRequestOptions = {
    method?: string;
    url?: string;
    headers?: RequestHeaders;
    body?: unknown;
};

export class ScriptRunner {
    private static readonly httpClient = new HttpClient();

    public static async runPreRequestScripts(sources: ScriptSource[], context: ScriptRequestContext): Promise<ScriptExecutionResult> {
        return this.run(sources, context, sandbox => {
            sandbox.request = {
                name: context.requestName,
                variables: {
                    set: (name: string, value: unknown) => context.variables.set(name, this.stringify(value)),
                    get: (name: string) => context.variables.get(name),
                    has: (name: string) => context.variables.has(name),
                },
                headers: {
                    set: (name: string, value: unknown) => context.headers.set(name, this.stringify(value)),
                    remove: (name: string) => context.headers.set(name, null),
                },
            };
        });
    }

    public static async runPostResponseScripts(
        sources: ScriptSource[],
        response: HttpResponse,
        context: ScriptRequestContext): Promise<ScriptExecutionResult> {
        return this.run(sources, context, sandbox => {
            sandbox.response = this.createResponseView(response);
            sandbox.request = this.createRequestView(response.request);
        });
    }

    /**
     * Evaluates a JavaScript expression against the response, used by the polling condition.
     */
    public static async evaluateResponseCondition(
        expression: string,
        response: HttpResponse,
        context: ScriptRequestContext): Promise<boolean> {
        const pending: Promise<void>[] = [];
        const sandbox = this.createSandbox(context, [], [], pending);
        sandbox.response = this.createResponseView(response);
        sandbox.request = this.createRequestView(response.request);

        const value = await this.execute(`return (${expression});`, 'poll condition', sandbox, pending);
        return !!value;
    }

    private static async run(
        sources: ScriptSource[],
        context: ScriptRequestContext,
        extend: (sandbox: any) => void): Promise<ScriptExecutionResult> {
        const tests: TestResult[] = [];
        const logs: string[] = [];

        for (const source of sources) {
            let code: string;
            try {
                code = await this.resolveCode(source, context);
            } catch (error) {
                return { tests, logs, error: `Unable to load ${getScriptDisplayName(source)}: ${error.message ?? error}` };
            }

            const pending: Promise<void>[] = [];
            const sandbox = this.createSandbox(context, tests, logs, pending);
            extend(sandbox);

            try {
                await this.execute(code, getScriptDisplayName(source), sandbox, pending);
            } catch (error) {
                logs.push(`Error in ${getScriptDisplayName(source)}: ${error.message ?? error}`);
                return { tests, logs, error: `${getScriptDisplayName(source)}: ${error.message ?? error}` };
            }
        }

        return { tests, logs };
    }

    private static async execute(code: string, filename: string, sandbox: any, pending: Promise<void>[]): Promise<unknown> {
        const context = vm.createContext(sandbox);
        // Wrapped in an async IIFE so that scripts can use top level await.
        const script = new vm.Script(`(async () => {\n${code}\n})()`, { filename });
        const timeout = SystemSettings.Instance.scriptTimeoutInMilliseconds;
        const completion = Promise.resolve(script.runInContext(context)).then(async value => {
            await Promise.all(pending);
            return value;
        });

        if (timeout <= 0) {
            return await completion;
        }

        let timer: NodeJS.Timeout;
        try {
            return await Promise.race([
                completion,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Script execution timed out after ${timeout}ms`)), timeout);
                })
            ]);
        } finally {
            clearTimeout(timer!);
        }
    }

    private static createSandbox(
        context: ScriptRequestContext,
        tests: TestResult[],
        logs: string[],
        pending: Promise<void>[]): any {
        const log = (...args: unknown[]) => logs.push(args.map(a => this.stringify(a)).join(' '));

        const assert = (condition: unknown, message?: string) => {
            if (!condition) {
                throw new Error(message || 'Assertion failed');
            }
        };

        const test = (name: string, fn: () => unknown | Promise<unknown>): Promise<void> => {
            const start = Date.now();
            const promise = (async () => {
                try {
                    await fn();
                    tests.push({ name, passed: true, durationInMilliseconds: Date.now() - start });
                } catch (error) {
                    tests.push({
                        name,
                        passed: false,
                        message: error?.message ?? String(error),
                        durationInMilliseconds: Date.now() - start
                    });
                }
            })();
            pending.push(promise);
            return promise;
        };

        const sandbox: any = {
            console: { log, info: log, warn: log, error: log, debug: log },
            client: {
                log,
                test,
                assert,
                resolve: (text: string) => VariableProcessor.processRawRequest(String(text), new Map(context.variables)),
                global: {
                    set: (name: string, value: unknown) => ScriptVariableStore.set(name, value),
                    get: (name: string) => ScriptVariableStore.get(name),
                    has: (name: string) => ScriptVariableStore.has(name),
                    clear: (name: string) => ScriptVariableStore.clear(name),
                    clearAll: () => ScriptVariableStore.clearAll(),
                    get isEmpty() { return ScriptVariableStore.isEmpty; },
                },
            },
            assert,
            sendRequest: (options: SendRequestOptions | string) => this.sendRequest(options, context),
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            Buffer,
            crypto,
            URL,
            URLSearchParams,
            TextEncoder,
            TextDecoder,
        };
        sandbox.client.sendRequest = sandbox.sendRequest;
        return sandbox;
    }

    private static async sendRequest(options: SendRequestOptions | string, context: ScriptRequestContext) {
        const normalized: SendRequestOptions = typeof options === 'string' ? { url: options } : { ...options };
        if (!normalized.url) {
            throw new Error('sendRequest requires a url');
        }

        const resolve = (value: string) => VariableProcessor.processRawRequest(value, new Map(context.variables));
        const url = await resolve(normalized.url);
        const headers: RequestHeaders = {};
        for (const [name, value] of Object.entries(normalized.headers ?? {})) {
            headers[name] = typeof value === 'string' ? await resolve(value) : value;
        }

        let body: string | undefined;
        if (normalized.body !== undefined && normalized.body !== null) {
            if (typeof normalized.body === 'string') {
                body = await resolve(normalized.body);
            } else {
                body = JSON.stringify(normalized.body);
                if (getContentType(headers) === undefined) {
                    headers['Content-Type'] = 'application/json';
                }
            }
        }

        const request = new HttpRequest(normalized.method ?? 'GET', url, headers, body, body);
        const response = await this.httpClient.send(request);
        return this.createResponseView(response);
    }

    private static createResponseView(response: HttpResponse) {
        const contentType = response.contentType;
        let body: unknown = response.body;
        if (contentType && MimeUtility.isJSON(contentType)) {
            try {
                body = JSON.parse(response.body);
            } catch {
                // keep the raw body when it is not valid json
            }
        }

        return {
            status: response.statusCode,
            statusText: response.statusMessage,
            httpVersion: response.httpVersion,
            headers: response.headers,
            contentType,
            body,
            rawBody: response.body,
            timings: response.timingPhases,
            header: (name: string) => response.headers[name.toLowerCase()],
        };
    }

    private static createRequestView(request: HttpRequest) {
        return {
            name: request.name,
            method: request.method,
            url: request.url,
            headers: request.headers,
            body: request.rawBody,
        };
    }

    private static async resolveCode(source: ScriptSource, context: ScriptRequestContext): Promise<string> {
        if (source.kind === 'inline') {
            return source.code;
        }

        const filePath = this.resolvePath(source.path, context.documentUri);
        return await fs.readFile(filePath, 'utf8');
    }

    private static resolvePath(scriptPath: string, documentUri?: Uri): string {
        if (path.isAbsolute(scriptPath)) {
            return scriptPath;
        }

        const documentPath = documentUri?.scheme === 'file' ? documentUri.fsPath : undefined;
        return documentPath ? path.resolve(path.dirname(documentPath), scriptPath) : path.resolve(scriptPath);
    }

    private static stringify(value: unknown): string {
        if (typeof value === 'string') {
            return value;
        }

        if (value === null || value === undefined) {
            return '';
        }

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
}
