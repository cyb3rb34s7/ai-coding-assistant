# AI Coding Assistant

A VS Code extension that uses Claude AI to assist with coding tasks, understand your codebase, and help execute common development workflows.

## Features

- **AI-Powered Code Understanding**: Analyzes your codebase to provide context-aware assistance
- **Terminal Command Suggestions**: Recommends terminal commands based on your needs
- **File Creation & Modification**: Create new files or modify existing ones with AI assistance
- **One-Click Command Execution**: Execute suggested commands with a single click

## Requirements

- VS Code 1.60.0 or higher
- An OpenAI API key (for embeddings)
- An Anthropic Claude API key

## Setup

1. Install the extension from the VS Code marketplace or from the VSIX file
2. Open VS Code settings (File > Preferences > Settings)
3. Search for "AI Coding Assistant"
4. Add your Claude API key and OpenAI API key

## Usage

1. Open the AI Coding Assistant sidebar (click the robot icon in the activity bar)
2. Type your question or request in the input box
3. The assistant will analyze your codebase and provide guidance
4. Execute suggested commands with the "Execute" button

## Extension Settings

* `aiCodingAssistant.claudeApiKey`: Your Claude API key
* `aiCodingAssistant.openaiApiKey`: Your OpenAI API key (for embeddings)

## Commands

* `AI Coding Assistant: Open Sidebar` - Opens the assistant sidebar
* `AI Coding Assistant: Ask Question` - Ask a question directly from the command palette

## Known Issues

- Terminal output cannot be directly captured due to VS Code API limitations
- Large codebases may take some time to index initially

## Release Notes

### 0.1.0

Initial release with basic functionality:
- Code analysis using embeddings
- Terminal command execution
- File creation/modification
- Claude AI integration

## Development

To build and run this extension locally:

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run watch` to start the compiler in watch mode
4. Press F5 to open a new window with the extension loaded

## Contributing
Core Components

WorkspaceManager: Indexes your codebase by creating embeddings for code files, letting the assistant understand your code semantically.
EmbeddingService: Generates vector embeddings for code chunks using OpenAI's embedding model.
ClaudeService: Communicates with Claude API, sending context-relevant code and parsing structured responses.
CommandExecutor: Executes terminal commands with a one-click interface.
FileOperationManager: Handles file creation and modification with preview capabilities.
ChatViewProvider: Provides the UI for interacting with the assistant.

Key Features

Semantic Code Understanding: The extension chunks your code and uses embeddings to find the most relevant files for your query.
Structured Responses: Claude provides both natural language explanations and structured step-by-step actions.
One-Click Execution: Users can execute suggested commands or create files with a single click.
Preview Before Changes: File modifications show a preview and require confirmation before applying.

How to Use It

Install and configure the extension with your API keys
Open a workspace/project
The extension automatically indexes your codebase on startup
Open the AI Coding Assistant sidebar
Ask questions or make requests in natural language
Execute the suggested actions with the "Execute" button

Contributions are welcome! Please feel free to submit a Pull Request.