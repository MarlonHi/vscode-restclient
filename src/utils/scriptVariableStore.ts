import { Event, EventEmitter } from 'vscode';

/**
 * Holds variables written by pre-request/post-response scripts via `client.global.set`.
 * The store lives for the whole extension session and is shared by all http files.
 */
export class ScriptVariableStore {
    private static readonly variables = new Map<string, string>();

    private static readonly eventEmitter = new EventEmitter<void>();

    public static get onDidChange(): Event<void> {
        return this.eventEmitter.event;
    }

    public static set(name: string, value: unknown): void {
        this.variables.set(name, ScriptVariableStore.stringify(value));
        this.eventEmitter.fire();
    }

    public static get(name: string): string | undefined {
        return this.variables.get(name);
    }

    public static has(name: string): boolean {
        return this.variables.has(name);
    }

    public static clear(name: string): void {
        if (this.variables.delete(name)) {
            this.eventEmitter.fire();
        }
    }

    public static clearAll(): void {
        if (this.variables.size > 0) {
            this.variables.clear();
            this.eventEmitter.fire();
        }
    }

    public static get isEmpty(): boolean {
        return this.variables.size === 0;
    }

    public static getAll(): Map<string, string> {
        return new Map(this.variables);
    }

    private static stringify(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }

        return typeof value === 'string' ? value : JSON.stringify(value);
    }
}
