import { VariableType } from '../../models/variableType';
import { ScriptVariableStore } from '../scriptVariableStore';
import { HttpVariable, HttpVariableProvider } from './httpVariableProvider';

export class ScriptVariableProvider implements HttpVariableProvider {
    private static _instance: ScriptVariableProvider;

    public static get Instance(): ScriptVariableProvider {
        if (!this._instance) {
            this._instance = new ScriptVariableProvider();
        }

        return this._instance;
    }

    private constructor() {
    }

    public readonly type: VariableType = VariableType.Script;

    public async has(name: string): Promise<boolean> {
        return ScriptVariableStore.has(name);
    }

    public async get(name: string): Promise<HttpVariable> {
        if (!ScriptVariableStore.has(name)) {
            return { name, error: `Script variable '${name}' does not exist` };
        }

        return { name, value: ScriptVariableStore.get(name) };
    }

    public async getAll(): Promise<HttpVariable[]> {
        return [...ScriptVariableStore.getAll()].map(([name, value]) => ({ name, value }));
    }
}
