import type { TelemetryClient } from 'applicationinsights';
import { extensions } from 'vscode';
import * as Constants from '../common/constants';
import { SystemSettings } from '../models/configurationSettings';

export class Telemetry {
    private static readonly restClientSettings: SystemSettings = SystemSettings.Instance;

    private static client: TelemetryClient | undefined;

    private static initialized = false;

    /**
     * Application Insights instruments the global http module and starts background workers,
     * so it is only loaded once telemetry is actually used.
     */
    private static getClient(): TelemetryClient | undefined {
        if (this.initialized) {
            return this.client;
        }

        this.initialized = true;
        const appInsights = require('applicationinsights');
        appInsights.setup(Constants.AiKey)
            .setAutoCollectConsole(false)
            .setAutoCollectDependencies(false)
            .setAutoCollectExceptions(false)
            .setAutoCollectPerformance(false)
            .setAutoCollectRequests(false)
            .setAutoDependencyCorrelation(false)
            .setUseDiskRetryCaching(true)
            .start();

        this.client = appInsights.defaultClient;
        const context = this.client!.context;
        const extension = extensions.getExtension(Constants.ExtensionId);
        context.tags[context.keys.applicationVersion] = extension?.packageJSON.version;

        return this.client;
    }

    public static sendEvent(eventName: string, properties?: { [key: string]: string }) {
        try {
            if (this.restClientSettings.enableTelemetry) {
                this.getClient()?.trackEvent({ name: eventName, properties });
            }
        } catch {
        }
    }
}