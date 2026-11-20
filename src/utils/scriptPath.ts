import * as os from 'os';
import * as path from 'path';

/**
 * Expands `~` and `${userHome}` so that the same script can be referenced from every workspace.
 */
export function expandUserHome(scriptPath: string): string {
    const home = os.homedir();
    const expanded = scriptPath.replace(/\$\{userHome\}/g, home);

    if (expanded === '~') {
        return home;
    }

    return /^~[\\/]/.test(expanded) ? path.join(home, expanded.slice(2)) : expanded;
}
