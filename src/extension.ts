import * as vscode from 'vscode';
import { ChatViewProvider } from './webview/chatViewProvider';
import { WorkspaceManager } from './workspace/workspaceManager';
import { ClaudeService } from './ai/claudeService';
import { EmbeddingService } from './ai/embeddingService';
import { CommandExecutor } from './terminal/commandExecutor';
import { FileOperationManager } from './file/fileOperationManager';

export async function activate(context: vscode.ExtensionContext) {
    console.log('AI Coding Assistant is now active');

    // Initialize services
    const embeddingService = new EmbeddingService();
    const workspaceManager = new WorkspaceManager(embeddingService);
    const commandExecutor = new CommandExecutor();
    const fileOperationManager = new FileOperationManager();
    const claudeService = new ClaudeService();

    // Initialize the chat view provider
    const chatViewProvider = new ChatViewProvider(
        context.extensionUri,
        workspaceManager,
        claudeService,
        commandExecutor,
        fileOperationManager
    );

    // Register the webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'aiCodingAssistant.chatView',
            chatViewProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingAssistant.openSidebar', () => {
            vscode.commands.executeCommand('workbench.view.extension.ai-coding-assistant');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiCodingAssistant.askQuestion', async () => {
            const question = await vscode.window.showInputBox({
                prompt: 'What would you like to ask or do?',
                placeHolder: 'E.g., Create a React component, fix this bug, etc.'
            });

            if (question) {
                vscode.commands.executeCommand('workbench.view.extension.ai-coding-assistant');
                // Let the webview know there's a new question
                chatViewProvider.sendNewQuestion(question);
            }
        })
    );

    // Index the workspace on startup
    try {
        await workspaceManager.indexWorkspace();
        vscode.window.showInformationMessage('AI Coding Assistant: Workspace indexed successfully');
    } catch (error) {
        vscode.window.showErrorMessage(`AI Coding Assistant: Error indexing workspace - ${error}`);
    }

    // Add a status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(hubot) AI Assistant';
    statusBarItem.command = 'aiCodingAssistant.openSidebar';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

export function deactivate() {
    console.log('AI Coding Assistant has been deactivated');
}