import { RequestMetadata } from '../models/requestMetadata';

export interface PollOptions {
    /** JavaScript expression evaluated against the response, stops the polling when truthy. */
    readonly condition?: string;
    readonly intervalInMilliseconds: number;
    readonly timeoutInMilliseconds: number;
    readonly maxAttempts: number;
}

const minimumIntervalInMilliseconds = 50;

const pollMetadatas = [
    RequestMetadata.Poll,
    RequestMetadata.PollInterval,
    RequestMetadata.PollTimeout,
    RequestMetadata.PollAttempts,
];

export function parsePollOptions(
    metadatas: Map<RequestMetadata, string | undefined>,
    defaults: { intervalInMilliseconds: number; timeoutInMilliseconds: number }): PollOptions | undefined {
    if (!pollMetadatas.some(metadata => metadatas.has(metadata))) {
        return undefined;
    }

    const condition = metadatas.get(RequestMetadata.Poll)?.trim() || undefined;
    const interval = toPositiveNumber(metadatas.get(RequestMetadata.PollInterval)) ?? defaults.intervalInMilliseconds;
    const timeout = toPositiveNumber(metadatas.get(RequestMetadata.PollTimeout)) ?? defaults.timeoutInMilliseconds;
    const attempts = toPositiveNumber(metadatas.get(RequestMetadata.PollAttempts));

    return {
        condition,
        intervalInMilliseconds: Math.max(interval, minimumIntervalInMilliseconds),
        timeoutInMilliseconds: timeout,
        maxAttempts: attempts ?? Number.MAX_SAFE_INTEGER
    };
}

function toPositiveNumber(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    const parsed = +value.trim();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
