import * as vscode from 'vscode';
import { WorkspaceManager } from '../workspace/workspaceManager';
import { ClaudeService, ActionStep } from '../ai/claudeService';
import { CommandExecutor } from '../terminal/commandExecutor';
import { FileOperationManager } from '../file/fileOperationManager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;
    private messages: Array<{ role: string; content: string }> = [];
    private pendingSteps: ActionStep[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly workspaceManager: WorkspaceManager,
        private readonly claudeService: ClaudeService,
        private readonly commandExecutor: CommandExecutor,
        private readonly fileOperationManager: FileOperationManager
    ) { }

    /**
     * Called when the view is first created
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.webviewView = webviewView;

        // Set the webview options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        // Initialize the webview content
        webviewView.webview.html = this.getHtmlForWebview();

        // Handle webview messages
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendQuery':
                        await this.handleUserQuery(message.text);
                        break;
                    case 'executeStep':
                        await this.executeStep(message.stepId);
                        break;
                    case 'clearChat':
                        this.messages = [];
                        this.pendingSteps = [];
                        this.updateWebview();
                        break;
                }
            }
        );

        // Add intro message
        if (this.messages.length === 0) {
            this.messages.push({
                role: 'assistant',
                content: 'Hello! I\'m your AI coding assistant. How can I help you today?'
            });
            this.updateWebview();
        }
    }

    /**
     * Handle a user query
     */
    private async handleUserQuery(query: string): Promise<void> {
        try {
            // Add user message
            this.messages.push({
                role: 'user',
                content: query
            });

            // Add a loading message
            this.messages.push({
                role: 'assistant',
                content: 'Thinking...'
            });
            this.updateWebview();

            // Get relevant code for the query
            const relevantCode = await this.workspaceManager.getRelevantCode(query);

            // Get project metadata
            const projectMetadata = this.workspaceManager.getProjectMetadata();

            // Send the query to Claude
            const response = await this.claudeService.query(query, relevantCode, projectMetadata);

            // Replace the loading message with the actual response
            this.messages[this.messages.length - 1] = {
                role: 'assistant',
                content: response.content
            };

            // Store any steps
            this.pendingSteps = response.steps;

            // Update the webview
            this.updateWebview();
        } catch (error) {
            console.error('Error handling user query:', error);

            // Replace loading message with error
            this.messages[this.messages.length - 1] = {
                role: 'assistant',
                content: `I encountered an error: ${error}`
            };
            this.updateWebview();
        }
    }

    /**
     * Execute a specific step
     */
    private async executeStep(stepId: string): Promise<void> {
        try {
            // Find the step
            const step = this.pendingSteps.find(s => s.id === stepId);
            if (!step) {
                throw new Error(`Step ${stepId} not found`);
            }

            // Execute based on the action type
            switch (step.actionType) {
                case 'terminal':
                    if (!step.command) {
                        throw new Error('No command specified for terminal action');
                    }
                    await this.commandExecutor.executeCommand(step.command);
                    break;

                case 'file':
                    if (!step.filePath || !step.fileContent) {
                        throw new Error('Missing file path or content for file action');
                    }

                    // Preview and ask for confirmation
                    const confirmed = await this.fileOperationManager.previewFileContent(
                        step.filePath,
                        step.fileContent
                    );

                    if (confirmed) {
                        await this.fileOperationManager.createOrUpdateFile(
                            step.filePath,
                            step.fileContent
                        );
                    }
                    break;

                case 'folder':
                    if (!step.filePath) {
                        throw new Error('No path specified for folder action');
                    }
                    await this.fileOperationManager.createDirectory(step.filePath);
                    break;
            }

            // Mark the step as completed
            step.id = `${step.id}-completed`;

            // Update the webview
            this.updateWebview();
        } catch (error) {
            console.error(`Error executing step ${stepId}:`, error);
            vscode.window.showErrorMessage(`Error executing step: ${error}`);
        }
    }

    /**
     * Send a new question from outside the webview
     */
    public sendNewQuestion(question: string): void {
        if (this.webviewView) {
            this.webviewView.webview.postMessage({
                command: 'newQuestion',
                text: question
            });
        } else {
            // Queue the question for when the webview is ready
            vscode.commands.executeCommand('aiCodingAssistant.openSidebar');
            setTimeout(() => this.handleUserQuery(question), 500);
        }
    }

    /**
     * Update the webview with current messages and steps
     */
    private updateWebview(): void {
        if (this.webviewView) {
            this.webviewView.webview.postMessage({
                command: 'updateChat',
                messages: this.messages,
                steps: this.pendingSteps
            });
        }
    }

    /**
     * Get the HTML for the webview
     */
    private getHtmlForWebview(): string {
        return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Coding Assistant</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 10px;
            display: flex;
            flex-direction: column;
            height: 100vh;
            margin: 0;
          }
          
          #chat-container {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 10px;
          }
          
          .message {
            padding: 8px 12px;
            margin-bottom: 8px;
            border-radius: 4px;
          }
          
          .user-message {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            align-self: flex-end;
          }
          
          .assistant-message {
            background-color: var(--vscode-editor-hoverHighlightBackground);
          }
          
          #input-container {
            display: flex;
            margin-top: auto;
          }
          
          #query-input {
            flex: 1;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
          }
          
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            margin-left: 5px;
            cursor: pointer;
            border-radius: 2px;
          }
          
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          
          .step-container {
            margin: 10px 0;
            padding: 8px;
            background-color: var(--vscode-editor-lineHighlightBackground);
            border-radius: 4px;
          }
          
          .step-description {
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .step-action {
            margin-top: 5px;
          }
          
          .completed {
            opacity: 0.6;
          }
          
          pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
          }
          
          code {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
          }
        </style>
      </head>
      <body>
        <div id="chat-container"></div>
        
        <div id="input-container">
          <input type="text" id="query-input" placeholder="Ask a question..." />
          <button id="send-button">Send</button>
          <button id="clear-button">Clear</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          const chatContainer = document.getElementById('chat-container');
          const queryInput = document.getElementById('query-input');
          const sendButton = document.getElementById('send-button');
          const clearButton = document.getElementById('clear-button');
          
          // Initialize from state if available
          const previousState = vscode.getState();
          let messages = previousState?.messages || [];
          let steps = previousState?.steps || [];
          
          // Render initial state
          renderChat();
          
          // Handle message from extension
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
              case 'updateChat':
                messages = message.messages;
                steps = message.steps;
                renderChat();
                vscode.setState({ messages, steps });
                break;
                
              case 'newQuestion':
                queryInput.value = message.text;
                sendQuery();
                break;
            }
          });
          
          // Send query when Send button is clicked
          sendButton.addEventListener('click', () => {
            sendQuery();
          });
          
          // Send query when Enter is pressed
          queryInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
              sendQuery();
            }
          });
          
          // Clear chat
          clearButton.addEventListener('click', () => {
            vscode.postMessage({
              command: 'clearChat'
            });
          });
          
          // Send query to extension
          function sendQuery() {
            const text = queryInput.value.trim();
            if (text) {
              vscode.postMessage({
                command: 'sendQuery',
                text
              });
              queryInput.value = '';
            }
          }
          
          // Execute a step
          function executeStep(stepId) {
            vscode.postMessage({
              command: 'executeStep',
              stepId
            });
          }
          
          // Render the chat messages and steps
          function renderChat() {
            chatContainer.innerHTML = '';
            
            // Render messages
            messages.forEach(message => {
              const messageDiv = document.createElement('div');
              messageDiv.classList.add('message');
              messageDiv.classList.add(message.role === 'user' ? 'user-message' : 'assistant-message');
              
              // Convert markdown-like code blocks
              let content = message.content.replace(/\`\`\`(\\w*)(\\n[\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
              
              // Convert inline code
              content = content.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
              
              messageDiv.innerHTML = content;
              chatContainer.appendChild(messageDiv);
            });
            
            // Render steps
            if (steps && steps.length > 0) {
              const stepsContainer = document.createElement('div');
              stepsContainer.classList.add('steps-container');
              
              steps.forEach(step => {
                const stepContainer = document.createElement('div');
                stepContainer.classList.add('step-container');
                
                if (step.id.includes('-completed')) {
                  stepContainer.classList.add('completed');
                }
                
                const descriptionDiv = document.createElement('div');
                descriptionDiv.classList.add('step-description');
                descriptionDiv.textContent = step.description;
                stepContainer.appendChild(descriptionDiv);
                
                const actionDiv = document.createElement('div');
                actionDiv.classList.add('step-action');
                
                if (step.actionType === 'terminal') {
                  actionDiv.innerHTML = \`<pre><code>\${step.command}</code></pre>\`;
                } else if (step.actionType === 'file') {
                  actionDiv.innerHTML = \`Create file: <code>\${step.filePath}</code>\`;
                } else if (step.actionType === 'folder') {
                  actionDiv.innerHTML = \`Create folder: <code>\${step.filePath}</code>\`;
                }
                
                stepContainer.appendChild(actionDiv);
                
                if (!step.id.includes('-completed')) {
                  const executeButton = document.createElement('button');
                  executeButton.textContent = 'Execute';
                  executeButton.addEventListener('click', () => {
                    executeStep(step.id);
                  });
                  stepContainer.appendChild(executeButton);
                }
                
                stepsContainer.appendChild(stepContainer);
              });
              
              chatContainer.appendChild(stepsContainer);
            }
            
            // Scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;
          }
        </script>
      </body>
      </html>
    `;
    }
}