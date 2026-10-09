import { ScriptSource } from './httpScript';
import { RequestMetadata } from './requestMetadata';

export interface SelectedRequest {
    text: string;

    metadatas: Map<RequestMetadata, string | undefined>;

    /**
     * Values collected through `# @prompt` comments. They still have to be applied
     * when `text` is the unresolved raw request.
     */
    promptVariables?: Map<string, string>;

    preRequestScripts?: ScriptSource[];

    postResponseScripts?: ScriptSource[];
}