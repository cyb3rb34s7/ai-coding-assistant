import * as vscode from 'vscode';

export class CommandExecutor {
    private terminal: vscode.Terminal | undefined;

    constructor() {
        // Create a dedicated terminal or use an existing one
        this.ensureTerminalExists();
    }

    /**
     * Execute a terminal command
     */
    public async executeCommand(command: string): Promise<void> {
        this.ensureTerminalExists();

        // Show the terminal
        this.terminal!.show();

        // Send the command
        this.terminal!.sendText(command);

        // Notify that the command has been executed
        // Note: We can't easily capture the output in VSCode Extension API
        return Promise.resolve();
    }

    /**
     * Ensure a terminal exists for our commands
     */
    private ensureTerminalExists(): void {
        // Look for an existing terminal named "AI Assistant"
        const existingTerminal = vscode.window.terminals.find(
            terminal => terminal.name === 'AI Assistant'
        );

        if (existingTerminal) {
            this.terminal = existingTerminal;
        } else {
            // Create a new terminal
            this.terminal = vscode.window.createTerminal('AI Assistant');
        }
    }

    /**
     * Dispose of the terminal when the extension is deactivated
     */
    public dispose(): void {
        if (this.terminal) {
            this.terminal.dispose();
        }
    }
}