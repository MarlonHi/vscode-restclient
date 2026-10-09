import * as path from 'path';
import { CancellationToken, ExtensionContext, Progress, ProgressLocation, Range, TextDocument, ViewColumn, window, workspace } from 'vscode';
import * as Constants from '../common/constants';
import Logger from '../logger';
import { IRestClientSettings, RequestSettings, RestClientSettings, SystemSettings } from '../models/configurationSettings';
import { HistoricalHttpRequest, HttpRequest } from '../models/httpRequest';
import { HttpResponse } from '../models/httpResponse';
import { ScriptSource, ScriptType, TestResult } from '../models/httpScript';
import { RequestMetadata } from '../models/requestMetadata';
import { RequestParserFactory } from '../models/requestParserFactory';
import { SequenceRunSummary, SequenceStepResult } from '../models/requestSequence';
import { SelectedRequest } from '../models/SelectedRequest';
import { trace } from "../utils/decorator";
import { ExpectedStatus } from '../utils/expectedStatus';
import { HttpClient } from '../utils/httpClient';
import { parsePollOptions, PollOptions } from '../utils/pollOptions';
import { RequestState, RequestStatusEntry } from '../utils/requestStatusBarEntry';
import { RequestVariableCache } from "../utils/requestVariableCache";
import { ScriptReporter } from '../utils/scriptReporter';
import { ScriptRequestContext, ScriptRunner } from '../utils/scriptRunner';
import { Selector } from '../utils/selector';
import { SequenceParser } from '../utils/sequenceParser';
import { convertBufferToStream, convertStreamToBuffer } from '../utils/streamUtility';
import { UserDataManager } from '../utils/userDataManager';
import { VariableProcessor } from '../utils/variableProcessor';
import { getCurrentTextDocument } from '../utils/workspaceUtility';
import { HttpResponseTextDocumentView } from '../views/httpResponseTextDocumentView';
import { HttpResponseWebview } from '../views/httpResponseWebview';
import { SequenceReportWebview } from '../views/sequenceReportWebview';

interface ExecuteOptions {
    /** Whether the response is rendered in the response preview. */
    preview: boolean;
    postResponseScripts?: ScriptSource[];
    scriptContext?: ScriptRequestContext;
    expectedStatus?: string;
    poll?: PollOptions;
}

interface PollingOutcome {
    response: HttpResponse;
    logs: string[];
    failure?: string;
}

export interface RequestExecutionResult {
    succeeded: boolean;
    response?: HttpResponse;
    message?: string;
    tests: TestResult[];
}

interface SequenceStep {
    name: string;
    line: number;
}

export class RequestController {
    private _requestStatusEntry: RequestStatusEntry;
    private _httpClient: HttpClient;
    private _webview: HttpResponseWebview;
    private _textDocumentView: HttpResponseTextDocumentView;
    private _sequenceReportView: SequenceReportWebview;
    private _lastRequestSettingTuple: [HttpRequest, IRestClientSettings, ExecuteOptions];
    private _lastPendingRequest?: HttpRequest;

    public constructor(context: ExtensionContext) {
        this._requestStatusEntry = new RequestStatusEntry();
        this._httpClient = new HttpClient();
        this._webview = new HttpResponseWebview(context);
        this._webview.onDidCloseAllWebviewPanels(() => this._requestStatusEntry.update({ state: RequestState.Closed }));
        this._textDocumentView = new HttpResponseTextDocumentView();
        this._sequenceReportView = new SequenceReportWebview(context);
    }

    @trace('Request')
    public async run(range: Range) {
        const editor = window.activeTextEditor;
        const document = getCurrentTextDocument();
        if (!editor || !document) {
            return;
        }

        const selectedRequest = await Selector.getRequest(editor, range, { resolveVariables: false });
        if (!selectedRequest) {
            return;
        }

        await this.executeSelectedRequest(selectedRequest, document, true);
    }

    @trace('Rerun Request')
    public async rerun() {
        if (!this._lastRequestSettingTuple) {
            return;
        }

        const [request, settings, options] = this._lastRequestSettingTuple;

        // TODO: recover from last request settings
        await this.runCore(request, settings, undefined, options);
    }

    @trace('Cancel Request')
    public async cancel() {
        this._lastPendingRequest?.cancel();

        this._requestStatusEntry.update({ state: RequestState.Cancelled });
    }

    @trace('Run Sequence')
    public async runSequence(document?: TextDocument, sequenceName?: string) {
        document = document ?? getCurrentTextDocument();
        if (!document) {
            return;
        }

        const sequences = SequenceParser.parse(document);
        if (sequences.length === 0) {
            window.showInformationMessage('No sequence is defined in the current file. Define one with "# @sequence <name>" followed by "# @steps <request names>".');
            return;
        }

        let sequence = sequenceName ? sequences.find(s => s.name === sequenceName) : undefined;
        if (!sequence) {
            if (sequences.length === 1) {
                sequence = sequences[0];
            } else {
                const picked = await window.showQuickPick(
                    sequences.map(s => ({ label: s.name, description: `${s.steps.length} steps`, sequence: s })),
                    { placeHolder: 'Select the sequence to run' });
                if (!picked) {
                    return;
                }
                sequence = picked.sequence;
            }
        }

        const namedRequests = SequenceParser.getNamedRequestLines(document);
        const missing = sequence.steps.filter(step => !namedRequests.has(step));
        if (missing.length > 0) {
            window.showErrorMessage(`Sequence "${sequence.name}" refers to unknown request(s): ${missing.join(', ')}`);
            return;
        }

        const steps = sequence.steps.map(step => ({ name: step, line: namedRequests.get(step)! }));
        await this.runSteps(document, sequence.name, steps, {
            delayInMilliseconds: sequence.delayInMilliseconds,
            continueOnError: sequence.continueOnError,
            setupScripts: sequence.setupScripts
        });
    }

    @trace('Run All Requests')
    public async runAll(document?: TextDocument) {
        document = document ?? getCurrentTextDocument();
        if (!document) {
            return;
        }

        const nameByLine = new Map([...SequenceParser.getNamedRequestLines(document)].map(([name, line]) => [line, name]));
        const steps = SequenceParser.getRequestBlockLines(document)
            .map(line => ({ name: nameByLine.get(line) ?? `Request at line ${line + 1}`, line }));

        if (steps.length === 0) {
            window.showInformationMessage('The current file does not contain any request.');
            return;
        }

        await this.runSteps(document, 'All requests', steps);
    }

    public async clearCookies() {
        try {
            await this._httpClient.clearCookies();
        } catch (error) {
            window.showErrorMessage(`Error clearing cookies:${error?.message}`);
        }
    }

    private async runSteps(
        document: TextDocument,
        title: string,
        steps: SequenceStep[],
        sequence?: { delayInMilliseconds?: number; continueOnError?: boolean; setupScripts?: ScriptSource[] }) {
        const settings = SystemSettings.Instance;
        const stopOnError = sequence?.continueOnError ? false : settings.stopSequenceOnError;
        const previewMode = settings.previewSequenceResponses;
        const setupScripts = settings.enableScripts ? sequence?.setupScripts ?? [] : [];

        const results = await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Running "${title}"`,
                cancellable: true
            },
            (progress, token) => this.executeSteps(
                document,
                title,
                steps,
                { delayInMilliseconds: sequence?.delayInMilliseconds, stopOnError, previewMode, setupScripts },
                progress,
                token));

        this.reportSequenceResults(results);
    }

    private async executeSteps(
        document: TextDocument,
        title: string,
        steps: SequenceStep[],
        options: { delayInMilliseconds?: number; stopOnError: boolean; previewMode: string; setupScripts: ScriptSource[] },
        progress: Progress<{ message?: string; increment?: number }>,
        token: CancellationToken): Promise<SequenceRunSummary> {
        const results: SequenceStepResult[] = [];
        const startedAt = Date.now();
        let cancelled = false;
        let attempted = 0;

        // Variables and headers the setup script contributes to every step of the run.
        const seed = { variables: new Map<string, string>(), headers: new Map<string, string | null>() };

        if (options.setupScripts.length > 0) {
            progress.report({ message: 'setup script' });
            const start = Date.now();
            const result = await ScriptRunner.runPreRequestScripts(options.setupScripts, {
                documentUri: document.uri,
                variables: seed.variables,
                headers: seed.headers
            });
            ScriptReporter.report(`${title} (setup script)`, result);
            if (result.error) {
                results.push({
                    name: 'setup script',
                    succeeded: false,
                    message: result.error,
                    durationInMilliseconds: Date.now() - start,
                    tests: []
                });
                return {
                    title,
                    startedAt,
                    durationInMilliseconds: Date.now() - startedAt,
                    steps: results,
                    skipped: steps.length,
                    cancelled
                };
            }
        }

        for (const [index, step] of steps.entries()) {
            if (token.isCancellationRequested) {
                cancelled = true;
                break;
            }

            attempted++;
            progress.report({
                message: `${index + 1}/${steps.length} ${step.name}`,
                increment: index === 0 ? 0 : 100 / steps.length
            });

            if (SequenceParser.getBlockMetadatas(document, step.line).has(RequestMetadata.Skip)) {
                results.push({ name: step.name, succeeded: true, skipped: true, durationInMilliseconds: 0, tests: [] });
                continue;
            }

            if (index > 0 && options.delayInMilliseconds) {
                await delay(options.delayInMilliseconds);
            }

            const start = Date.now();
            const selectedRequest = await Selector.getRequestAtLine(document, step.line, { resolveVariables: false });
            if (!selectedRequest) {
                results.push({
                    name: step.name,
                    succeeded: false,
                    message: 'Unable to parse the request',
                    durationInMilliseconds: Date.now() - start,
                    tests: []
                });
                if (options.stopOnError) {
                    break;
                }
                continue;
            }

            const preview = options.previewMode === 'all' || (options.previewMode === 'last' && index === steps.length - 1);
            const result = await this.executeSelectedRequest(selectedRequest, document, preview, seed);
            results.push({
                name: step.name,
                succeeded: result.succeeded,
                message: result.message,
                durationInMilliseconds: Date.now() - start,
                method: result.response?.request.method,
                url: result.response?.request.url,
                statusCode: result.response?.statusCode,
                statusMessage: result.response?.statusMessage,
                tests: result.tests
            });

            if (!result.succeeded && options.stopOnError) {
                break;
            }
        }

        return {
            title,
            startedAt,
            durationInMilliseconds: Date.now() - startedAt,
            steps: results,
            skipped: steps.length - attempted,
            cancelled
        };
    }

    private reportSequenceResults(summary: SequenceRunSummary) {
        const { title, steps } = summary;
        const executed = steps.filter(s => !s.skipped);
        const failed = executed.filter(s => !s.succeeded);
        ScriptReporter.appendLine(`[${new Date(summary.startedAt).toLocaleTimeString()}] Sequence "${title}": ${executed.length - failed.length}/${executed.length} steps succeeded in ${summary.durationInMilliseconds} ms`);
        for (const step of steps) {
            if (step.skipped) {
                ScriptReporter.appendLine(`  SKIP ${step.name}`);
                continue;
            }

            const status = step.succeeded ? 'PASS' : 'FAIL';
            const failedTests = step.tests.filter(t => !t.passed).length;
            const tests = step.tests.length > 0 ? `, ${step.tests.length - failedTests}/${step.tests.length} tests passed` : '';
            ScriptReporter.appendLine(`  ${status} ${step.name} (${step.durationInMilliseconds} ms${tests})`);
            if (step.message) {
                ScriptReporter.appendLine(`       ${step.message}`);
            }
        }
        if (summary.skipped > 0) {
            ScriptReporter.appendLine(`  ${summary.skipped} step(s) were not run`);
        }

        this.showSequenceReport(summary);

        if (failed.length > 0) {
            window.showErrorMessage(`Sequence "${title}" failed at "${failed[0].name}": ${failed[0].message ?? 'see the sequence report for details'}`);
        } else if (executed.length > 0 && !summary.cancelled) {
            window.showInformationMessage(`Sequence "${title}" finished, ${executed.length} request(s) succeeded.`);
        }
    }

    private showSequenceReport(summary: SequenceRunSummary) {
        const mode = SystemSettings.Instance.showSequenceReport;
        const hasFailure = summary.steps.some(s => !s.succeeded);
        if (mode === 'never' || (mode === 'onFailure' && !hasFailure) || summary.steps.length === 0) {
            if (hasFailure) {
                ScriptReporter.show();
            }
            return;
        }

        const activeColumn = window.activeTextEditor?.viewColumn ?? ViewColumn.One;
        this._sequenceReportView.render(summary, ((activeColumn as number) + 1) as ViewColumn);
    }

    private getGlobalScripts(setting: string, type: ScriptType, document: TextDocument | undefined): ScriptSource[] {
        if (!setting) {
            return [];
        }

        const folder = document ? workspace.getWorkspaceFolder(document.uri)?.uri.fsPath : undefined;
        return setting
            .split(',')
            .map(p => p.trim())
            .filter(p => p !== '')
            .map<ScriptSource>(p => {
                const expanded = folder ? p.replace(/\$\{workspaceFolder\}/g, folder) : p;
                const resolved = !path.isAbsolute(expanded) && folder ? path.join(folder, expanded) : expanded;
                return { kind: 'file', type, path: resolved };
            });
    }

    /**
     * Scripts that apply to every request of a file, opted in with a `# @use-scripts` line.
     */
    private getFileLevelScripts(
        document: TextDocument | undefined,
        settings: IRestClientSettings): { pre: ScriptSource[]; post: ScriptSource[] } {
        const pre: ScriptSource[] = [];
        const post: ScriptSource[] = [];
        if (!document) {
            return { pre, post };
        }

        let useConfiguredScripts = false;
        for (const line of document.getText().split(Constants.LineSplitterRegex)) {
            const matched = line.match(Constants.UseScriptsRegex);
            if (!matched) {
                continue;
            }

            const paths = matched[1]?.trim();
            if (paths) {
                pre.push(...paths
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => p !== '')
                    .map<ScriptSource>(p => ({ kind: 'file', type: ScriptType.PreRequest, path: p })));
            } else {
                useConfiguredScripts = true;
            }
        }

        if (useConfiguredScripts) {
            pre.unshift(...this.getGlobalScripts(settings.globalPreRequestScript, ScriptType.PreRequest, document));
            post.push(...this.getGlobalScripts(settings.globalPostResponseScript, ScriptType.PostResponse, document));
        }

        return { pre, post };
    }

    private async executeSelectedRequest(
        selectedRequest: SelectedRequest,
        document: TextDocument | undefined,
        preview: boolean,
        seed?: { variables: Map<string, string>; headers: Map<string, string | null> }): Promise<RequestExecutionResult> {
        const { metadatas } = selectedRequest;
        const name = metadatas.get(RequestMetadata.Name);

        if (metadatas.has(RequestMetadata.Note)) {
            const note = name ? `Are you sure you want to send the request "${name}"?` : 'Are you sure you want to send this request?';
            const userConfirmed = await window.showWarningMessage(note, 'Yes', 'No');
            if (userConfirmed !== 'Yes') {
                return { succeeded: false, message: 'Cancelled by the user', tests: [] };
            }
        }

        const requestSettings = new RequestSettings(metadatas);
        const settings: IRestClientSettings = new RestClientSettings(requestSettings);

        const scriptsEnabled = SystemSettings.Instance.enableScripts;
        const fileScripts = scriptsEnabled ? this.getFileLevelScripts(document, settings) : { pre: [], post: [] };
        const preRequestScripts = scriptsEnabled
            ? [...fileScripts.pre, ...selectedRequest.preRequestScripts ?? []]
            : [];
        const postResponseScripts = scriptsEnabled
            ? [...selectedRequest.postResponseScripts ?? [], ...fileScripts.post]
            : [];

        const scriptContext: ScriptRequestContext = {
            requestName: name,
            documentUri: document?.uri,
            variables: new Map([...(seed?.variables ?? []), ...(selectedRequest.promptVariables ?? [])]),
            headers: new Map(seed?.headers ?? [])
        };

        if (preRequestScripts.length > 0) {
            this._requestStatusEntry.update({ state: RequestState.Pending });
            const result = await ScriptRunner.runPreRequestScripts(preRequestScripts, scriptContext);
            ScriptReporter.report(`${name ?? 'request'} (pre-request script)`, result);
            if (result.error) {
                this._requestStatusEntry.update({ state: RequestState.Error });
                window.showErrorMessage(`Pre-request script failed: ${result.error}`);
                return { succeeded: false, message: result.error, tests: [] };
            }
        }

        let httpRequest: HttpRequest;
        try {
            const text = await VariableProcessor.processRawRequest(selectedRequest.text, new Map(scriptContext.variables));
            httpRequest = await RequestParserFactory.createRequestParser(text, settings).parseHttpRequest(name);
        } catch (error) {
            const message = error?.message ?? String(error);
            this._requestStatusEntry.update({ state: RequestState.Error });
            window.showErrorMessage(message);
            return { succeeded: false, message, tests: [] };
        }

        for (const [header, value] of scriptContext.headers) {
            if (value === null) {
                delete httpRequest.headers[header];
            } else {
                httpRequest.headers[header] = value;
            }
        }

        const delayInMilliseconds = +(metadatas.get(RequestMetadata.Delay) ?? 0);
        if (delayInMilliseconds > 0) {
            await delay(delayInMilliseconds);
        }

        return await this.runCore(httpRequest, settings, document, {
            preview,
            postResponseScripts,
            scriptContext,
            expectedStatus: metadatas.get(RequestMetadata.Expect),
            poll: parsePollOptions(metadatas, {
                intervalInMilliseconds: SystemSettings.Instance.pollIntervalInMilliseconds,
                timeoutInMilliseconds: SystemSettings.Instance.pollTimeoutInMilliseconds
            })
        });
    }

    private async runCore(
        httpRequest: HttpRequest,
        settings: IRestClientSettings,
        document?: TextDocument,
        options: ExecuteOptions = { preview: true }): Promise<RequestExecutionResult> {
        // clear status bar
        this._requestStatusEntry.update({ state: RequestState.Pending });

        // set last request and last pending request
        this._lastPendingRequest = httpRequest;
        this._lastRequestSettingTuple = [httpRequest, settings, options];

        // set http request
        try {
            const { response, logs: pollLogs, failure: pollFailure } = await this.sendWithPolling(httpRequest, settings, options);

            // check cancel
            if (httpRequest.isCancelled) {
                return { succeeded: false, message: 'Request cancelled', tests: [] };
            }

            this._requestStatusEntry.update({ state: RequestState.Received, response });

            if (httpRequest.name && document) {
                RequestVariableCache.add(document, httpRequest.name, response);
            }

            const { tests, error: scriptError } = await this.validateResponse(httpRequest, response, document, options, { logs: pollLogs, failure: pollFailure });
            const failedTests = tests.filter(t => !t.passed).length;

            if (options.preview) {
                try {
                    const activeColumn = window.activeTextEditor!.viewColumn;
                    const previewColumn = settings.previewColumn === ViewColumn.Active
                        ? activeColumn
                        : ((activeColumn as number) + 1) as ViewColumn;
                    if (settings.previewResponseInUntitledDocument) {
                        this._textDocumentView.render(response, previewColumn);
                    } else if (previewColumn) {
                        this._webview.render(response, previewColumn);
                    }
                } catch (reason) {
                    Logger.error('Unable to preview response:', reason);
                    window.showErrorMessage(reason);
                }
            }

            // persist to history json file
            await UserDataManager.addToRequestHistory(HistoricalHttpRequest.convertFromHttpRequest(httpRequest));

            return {
                succeeded: !scriptError && failedTests === 0,
                response,
                message: scriptError ?? (failedTests > 0 ? `${failedTests} of ${tests.length} test(s) failed` : undefined),
                tests
            };
        } catch (error) {
            // check cancel
            if (httpRequest.isCancelled) {
                return { succeeded: false, message: 'Request cancelled', tests: [] };
            }

            if (error.code === 'ETIMEDOUT') {
                error.message = `Request timed out. Double-check your network connection and/or raise the timeout duration (currently set to ${settings.timeoutInMilliseconds}ms) as needed: 'rest-client.timeoutinmilliseconds'. Details: ${error}.`;
            } else if (error.code === 'ECONNREFUSED') {
                error.message = `The connection was rejected. Either the requested service isn’t running on the requested server/port, the proxy settings in vscode are misconfigured, or a firewall is blocking requests. Details: ${error}.`;
            } else if (error.code === 'ENETUNREACH') {
                error.message = `You don't seem to be connected to a network. Details: ${error}`;
            }
            this._requestStatusEntry.update({ state: RequestState.Error });
            Logger.error('Failed to send request:', error);
            if (options.preview) {
                window.showErrorMessage(error.message);
            }
            return { succeeded: false, message: error.message, tests: [] };
        } finally {
            if (this._lastPendingRequest === httpRequest) {
                this._lastPendingRequest = undefined;
            }
        }
    }

    private async sendWithPolling(
        httpRequest: HttpRequest,
        settings: IRestClientSettings,
        options: ExecuteOptions): Promise<PollingOutcome> {
        const poll = options.poll;
        if (!poll) {
            return { response: await this._httpClient.send(httpRequest, settings), logs: [] };
        }

        // The body stream is consumed by the first attempt, so it has to be replayed for every retry.
        const bufferedBody = httpRequest.body && typeof httpRequest.body !== 'string'
            ? await convertStreamToBuffer(httpRequest.body)
            : undefined;

        const logs: string[] = [];
        const start = Date.now();
        let attempt = 0;
        let lastConditionError: string | undefined;

        while (true) {
            if (bufferedBody && attempt > 0) {
                httpRequest.body = convertBufferToStream(bufferedBody);
            }

            attempt++;
            const response = await this._httpClient.send(httpRequest, settings);

            // An early response may not contain the polled fields yet, so a failing condition just retries.
            let satisfied = false;
            try {
                satisfied = await this.isPollConditionSatisfied(poll, options, response);
                lastConditionError = undefined;
            } catch (error) {
                lastConditionError = error?.message ?? String(error);
            }

            const elapsed = Date.now() - start;
            const outcome = satisfied ? ', condition met' : lastConditionError ? `, condition error: ${lastConditionError}` : '';
            logs.push(`poll attempt ${attempt}: ${response.statusCode} ${response.statusMessage} after ${elapsed} ms${outcome}`);

            if (satisfied) {
                return { response, logs };
            }

            if (httpRequest.isCancelled) {
                return { response, logs, failure: 'polling was cancelled' };
            }

            if (attempt >= poll.maxAttempts || elapsed + poll.intervalInMilliseconds >= poll.timeoutInMilliseconds) {
                const reason = lastConditionError ? ` (last condition error: ${lastConditionError})` : '';
                return {
                    response,
                    logs,
                    failure: `poll condition was not satisfied after ${attempt} attempt(s) in ${elapsed} ms${reason}`
                };
            }

            this._requestStatusEntry.update({ state: RequestState.Pending });
            await delay(poll.intervalInMilliseconds);

            if (httpRequest.isCancelled) {
                return { response, logs, failure: 'polling was cancelled' };
            }
        }
    }

    private async isPollConditionSatisfied(poll: PollOptions, options: ExecuteOptions, response: HttpResponse): Promise<boolean> {
        if (poll.condition) {
            const context = options.scriptContext ?? {
                variables: new Map<string, string>(),
                headers: new Map<string, string | null>()
            };
            return await ScriptRunner.evaluateResponseCondition(poll.condition, response, context);
        }

        if (options.expectedStatus) {
            return ExpectedStatus.matches(options.expectedStatus, response.statusCode);
        }

        return response.statusCode >= 200 && response.statusCode < 300;
    }

    private async validateResponse(
        httpRequest: HttpRequest,
        response: HttpResponse,
        document: TextDocument | undefined,
        options: ExecuteOptions,
        polling: { logs: string[]; failure?: string }): Promise<{ tests: TestResult[]; error?: string }> {
        const tests: TestResult[] = [];
        const expectation = this.checkExpectedStatus(options.expectedStatus, response);
        if (expectation) {
            tests.push(expectation);
        }

        const logs: string[] = [...polling.logs];
        let error: string | undefined = polling.failure;

        if (options.postResponseScripts && options.postResponseScripts.length > 0) {
            const context = options.scriptContext ?? {
                requestName: httpRequest.name,
                documentUri: document?.uri,
                variables: new Map<string, string>(),
                headers: new Map<string, string | null>()
            };

            const result = await ScriptRunner.runPostResponseScripts(options.postResponseScripts, response, context);
            tests.push(...result.tests);
            logs.push(...result.logs);
            error = error ?? result.error;
        }

        ScriptReporter.report(`${httpRequest.name ?? httpRequest.url}`, { tests, logs, error });

        // A failed assertion still produced a response, only a broken script or poll is a request error.
        if (error) {
            this._requestStatusEntry.update({ state: RequestState.Error });
        }

        return { tests, error };
    }

    private checkExpectedStatus(expectedStatus: string | undefined, response: HttpResponse): TestResult | undefined {
        if (!expectedStatus) {
            return undefined;
        }

        const name = `status is ${expectedStatus}`;
        try {
            const passed = ExpectedStatus.matches(expectedStatus, response.statusCode);
            return {
                name,
                passed,
                message: passed ? undefined : `expected ${expectedStatus} but got ${response.statusCode} ${response.statusMessage}`,
                durationInMilliseconds: 0
            };
        } catch (error) {
            return { name, passed: false, message: error?.message ?? String(error), durationInMilliseconds: 0 };
        }
    }

    public dispose() {
        this._requestStatusEntry.dispose();
        this._webview.dispose();
        this._sequenceReportView.dispose();
        ScriptReporter.dispose();
    }
}

function delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}