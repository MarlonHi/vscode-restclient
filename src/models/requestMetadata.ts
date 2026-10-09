export enum RequestMetadata {
    /**
     * Represents a request name and used to indicate that the request is a named request
     */
    Name = 'name',
    /**
     * Used for request confirmation, especially for critical request
     */
    Note = 'note',
    /**
     * Represents don't follow the 3XX response as redirects
     */
    NoRedirect = 'no-redirect',

    /**
     * Represents the cookie jar is disabled for this request
     */
    NoCookieJar = 'no-cookie-jar',

    /**
     * Used to allow user to interactively input variables for this request
     */
    Prompt = 'prompt',

    /**
     * Path of a JavaScript file executed before the request is sent
     */
    PreRequestScript = 'prescript',

    /**
     * Path of a JavaScript file executed after the response is received
     */
    PostResponseScript = 'postscript',

    /**
     * Number of milliseconds to wait before the request is sent
     */
    Delay = 'delay',

    /**
     * Exclude the request when a sequence or the whole file is run
     */
    Skip = 'skip',

    /**
     * Status code(s) the response is expected to have, e.g. `201`, `2xx` or `400-404`
     */
    Expect = 'expect',

    /**
     * Repeat the request until the optional JavaScript condition or the expected status is satisfied
     */
    Poll = 'poll',

    /**
     * Number of milliseconds to wait between two polling attempts
     */
    PollInterval = 'poll-interval',

    /**
     * Maximum number of milliseconds to keep polling
     */
    PollTimeout = 'poll-timeout',

    /**
     * Maximum number of polling attempts
     */
    PollAttempts = 'poll-attempts',
}

const metadataAliases: ReadonlyMap<string, RequestMetadata> = new Map([
    ['pre-request-script', RequestMetadata.PreRequestScript],
    ['post-request-script', RequestMetadata.PostResponseScript],
    ['post-response-script', RequestMetadata.PostResponseScript],
    ['expect-status', RequestMetadata.Expect],
    ['expected-status', RequestMetadata.Expect],
    ['poll-until', RequestMetadata.Poll],
]);

export function fromString(value: string): RequestMetadata | undefined {
    value = value.toLowerCase();
    const enumName = (Object.keys(RequestMetadata) as Array<keyof typeof RequestMetadata>).find(k => RequestMetadata[k] === value);
    return enumName ? RequestMetadata[enumName] : metadataAliases.get(value);
}