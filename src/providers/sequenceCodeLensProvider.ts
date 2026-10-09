import { CancellationToken, CodeLens, CodeLensProvider, Command, Range, TextDocument } from 'vscode';
import { SequenceParser } from '../utils/sequenceParser';

export class SequenceCodeLensProvider implements CodeLensProvider {
    public provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        const lenses = SequenceParser.parse(document).map(sequence => {
            const range = new Range(sequence.line, 0, sequence.line, 0);
            const command: Command = {
                arguments: [document, sequence.name],
                title: `Run Sequence (${sequence.steps.length} requests)`,
                command: 'rest-client.run-sequence'
            };
            return new CodeLens(range, command);
        });

        return Promise.resolve(lenses);
    }
}
