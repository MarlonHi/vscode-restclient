import { ExtensionContext, ViewColumn, WebviewPanel, window } from 'vscode';
import { SequenceRunSummary, SequenceStepResult } from '../models/requestSequence';
import { disposeAll } from '../utils/dispose';
import { BaseWebview } from './baseWebview';

export class SequenceReportWebview extends BaseWebview {

    protected get viewType(): string {
        return 'rest-sequence-report';
    }

    protected get previewActiveContextKey(): string {
        return 'sequenceReportFocus';
    }

    public constructor(context: ExtensionContext) {
        super(context);
    }

    public render(summary: SequenceRunSummary, column: ViewColumn = ViewColumn.Two) {
        const title = `Sequence: ${summary.title}`;
        let panel: WebviewPanel;
        if (this.panels.length === 0) {
            panel = window.createWebviewPanel(
                this.viewType,
                title,
                { viewColumn: column, preserveFocus: true },
                {
                    enableFindWidget: true,
                    retainContextWhenHidden: true
                });

            panel.onDidDispose(() => {
                this.setPreviewActiveContext(false);
                this.panels.pop();
                this._onDidCloseAllWebviewPanels.fire();
            });

            panel.onDidChangeViewState(({ webviewPanel }) => {
                this.setPreviewActiveContext(webviewPanel.active);
            });

            panel.iconPath = this.iconFilePath;

            this.panels.push(panel);
        } else {
            panel = this.panels[0];
            panel.title = title;
        }

        panel.webview.html = this.getHtmlForWebview(panel, summary);
        this.setPreviewActiveContext(true);
        panel.reveal(column, true);
    }

    public dispose() {
        disposeAll(this.panels);
    }

    private getHtmlForWebview(panel: WebviewPanel, summary: SequenceRunSummary): string {
        const executed = summary.steps.filter(s => !s.skipped);
        const failed = executed.filter(s => !s.succeeded).length;
        const passed = executed.length - failed;
        const skipped = summary.skipped + (summary.steps.length - executed.length);
        const totalTests = summary.steps.reduce((sum, s) => sum + s.tests.length, 0);
        const failedTests = summary.steps.reduce((sum, s) => sum + s.tests.filter(t => !t.passed).length, 0);
        const verdict = summary.cancelled ? 'CANCELLED' : failed > 0 ? 'FAILED' : 'PASSED';
        const verdictClass = summary.cancelled ? 'warn' : failed > 0 ? 'fail' : 'pass';

        return `<!DOCTYPE html>
<html>
    <head>
        <link rel="stylesheet" type="text/css" href="${panel.webview.asWebviewUri(this.baseFilePath)}">
        <link rel="stylesheet" type="text/css" href="${panel.webview.asWebviewUri(this.vscodeStyleFilePath)}">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' http: https: data: vscode-resource:; style-src 'self' 'unsafe-inline' http: https: data: vscode-resource:;">
        <style>
            body { padding: 12px 16px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
            h1 { font-size: 1.3em; margin: 0 0 4px 0; }
            .meta { color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
            .verdict { display: inline-block; padding: 2px 8px; border-radius: 3px; font-weight: bold; margin-right: 8px; }
            .verdict.pass { background-color: var(--vscode-testing-iconPassed, #388a34); color: #fff; }
            .verdict.fail { background-color: var(--vscode-testing-iconFailed, #be1100); color: #fff; }
            .verdict.warn { background-color: var(--vscode-testing-iconQueued, #cca700); color: #000; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
            th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.35)); vertical-align: top; }
            th { color: var(--vscode-descriptionForeground); font-weight: normal; }
            td.num { text-align: right; white-space: nowrap; }
            .pass-text { color: var(--vscode-testing-iconPassed, #388a34); font-weight: bold; }
            .fail-text { color: var(--vscode-testing-iconFailed, #be1100); font-weight: bold; }
            .skip-text { color: var(--vscode-descriptionForeground); font-weight: bold; }
            tr.skipped { opacity: .6; }
            .url { font-family: var(--vscode-editor-font-family); word-break: break-all; }
            .message { color: var(--vscode-testing-iconFailed, #be1100); }
            ul.tests { margin: 4px 0 0 0; padding-left: 16px; }
            li.test { font-family: var(--vscode-editor-font-family); }
            li.test .detail { color: var(--vscode-descriptionForeground); }
            h2 { font-size: 1.05em; margin: 16px 0 4px 0; }
        </style>
    </head>
    <body>
        <h1>${escapeHtml(summary.title)}</h1>
        <div class="meta">
            <span class="verdict ${verdictClass}">${verdict}</span>
            ${passed}/${executed.length} requests succeeded${skipped > 0 ? `, ${skipped} skipped` : ''}
            &middot; ${failedTests === 0 ? `${totalTests} test(s) passed` : `${failedTests} of ${totalTests} test(s) failed`}
            &middot; ${formatDuration(summary.durationInMilliseconds)}
            &middot; ${new Date(summary.startedAt).toLocaleString()}
        </div>
        <table>
            <thead>
                <tr><th>#</th><th>Request</th><th>Status</th><th>Tests</th><th class="num">Duration</th></tr>
            </thead>
            <tbody>
                ${summary.steps.map((step, index) => this.renderRow(step, index)).join('')}
            </tbody>
        </table>
        ${this.renderDetails(summary.steps)}
    </body>
</html>`;
    }

    private renderRow(step: SequenceStepResult, index: number): string {
        const failedTests = step.tests.filter(t => !t.passed).length;
        const status = step.statusCode !== undefined
            ? `${step.statusCode} ${escapeHtml(step.statusMessage ?? '')}`
            : '-';
        const tests = step.tests.length === 0 ? '-' : `${step.tests.length - failedTests}/${step.tests.length}`;
        const verdict = step.skipped
            ? '<span class="skip-text">SKIP</span>'
            : `<span class="${step.succeeded ? 'pass-text' : 'fail-text'}">${step.succeeded ? 'PASS' : 'FAIL'}</span>`;
        return `<tr${step.skipped ? ' class="skipped"' : ''}>
            <td class="num">${index + 1}</td>
            <td>
                ${verdict}
                ${escapeHtml(step.name)}
                ${step.url ? `<div class="url">${escapeHtml(step.method ?? '')} ${escapeHtml(step.url)}</div>` : ''}
                ${step.message ? `<div class="message">${escapeHtml(step.message)}</div>` : ''}
            </td>
            <td>${status}</td>
            <td>${tests}</td>
            <td class="num">${step.skipped ? '-' : formatDuration(step.durationInMilliseconds)}</td>
        </tr>`;
    }

    private renderDetails(steps: SequenceStepResult[]): string {
        const withTests = steps.filter(s => s.tests.length > 0);
        if (withTests.length === 0) {
            return '';
        }

        return `<h2>Tests</h2>` + withTests.map(step => `
            <div>
                <strong>${escapeHtml(step.name)}</strong>
                <ul class="tests">
                    ${step.tests.map(test => `<li class="test">
                        <span class="${test.passed ? 'pass-text' : 'fail-text'}">${test.passed ? 'PASS' : 'FAIL'}</span>
                        ${escapeHtml(test.name)}
                        <span class="detail">(${formatDuration(test.durationInMilliseconds)})</span>
                        ${test.message ? `<div class="message">${escapeHtml(test.message)}</div>` : ''}
                    </li>`).join('')}
                </ul>
            </div>`).join('');
    }
}

function formatDuration(milliseconds: number): string {
    return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(2)} s` : `${milliseconds} ms`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
