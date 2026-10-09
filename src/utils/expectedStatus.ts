const exactRegex = /^\d{3}$/;
const wildcardRegex = /^[\dx]{3}$/i;
const rangeRegex = /^(\d{3})-(\d{3})$/;

/**
 * Matches a status code against a specification like `201`, `2xx`, `400-404` or `401, 403`.
 */
export class ExpectedStatus {
    public static matches(specification: string, statusCode: number): boolean {
        const tokens = specification.split(/[\s,]+/).filter(t => t !== '');
        if (tokens.length === 0) {
            throw new Error('No expected status code is specified');
        }

        return tokens.some(token => this.matchesToken(token, statusCode));
    }

    private static matchesToken(token: string, statusCode: number): boolean {
        if (exactRegex.test(token)) {
            return +token === statusCode;
        }

        const range = token.match(rangeRegex);
        if (range) {
            return statusCode >= +range[1] && statusCode <= +range[2];
        }

        if (wildcardRegex.test(token)) {
            const actual = statusCode.toString();
            return actual.length === 3
                && [...token.toLowerCase()].every((char, index) => char === 'x' || char === actual[index]);
        }

        throw new Error(`'${token}' is not a valid status code expectation`);
    }
}
