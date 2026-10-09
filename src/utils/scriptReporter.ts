import { OutputChannel, window } from 'vscode';
import { ScriptExecutionResult } from '../models/httpScript';

/**
 * Renders script logs and test results into a dedicated output channel.
 */
export class ScriptReporter {
    private static channel: OutputChannel | undefined;

    public static report(title: string, result: ScriptExecutionResult): void {
        if (result.tests.length === 0 && result.logs.length === 0 && !result.error) {
            return;
        }

        const channel = this.getChannel();
        channel.appendLine(`[${new Date().toLocaleTimeString()}] ${title}`);

        for (const log of result.logs) {
            channel.appendLine(`  ${log}`);
        }

        for (const test of result.tests) {
            const status = test.passed ? 'PASS' : 'FAIL';
            channel.appendLine(`  ${status} ${test.name} (${test.durationInMilliseconds} ms)`);
            if (!test.passed && test.message) {
                channel.appendLine(`       ${test.message}`);
            }
        }

        if (result.error) {
            channel.appendLine(`  ERROR ${result.error}`);
        }
    }

    public static appendLine(message: string): void {
        this.getChannel().appendLine(message);
    }

    public static show(): void {
        this.getChannel().show(true);
    }

    public static dispose(): void {
        this.channel?.dispose();
        this.channel = undefined;
    }

    private static getChannel(): OutputChannel {
        if (!this.channel) {
            this.channel = window.createOutputChannel('REST Client Scripts');
        }

        return this.channel;
    }
}
