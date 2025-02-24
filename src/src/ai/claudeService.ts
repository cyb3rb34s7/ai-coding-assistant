import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';

export interface ActionStep {
    id: string;
    description: string;
    actionType: 'terminal' | 'file' | 'folder';
    command?: string;
    filePath?: string;
    fileContent?: string;
}

export interface AssistantResponse {
    content: string;
    steps: ActionStep[];
}

export class ClaudeService {
    private client: Anthropic;
    private readonly model = 'claude-3-5-sonnet-20241022';
    private messages: Anthropic.Messages.Message[] = [];
    private systemPrompt: string;

    constructor() {
        // Get the API key from configuration
        const config = vscode.workspace.getConfiguration('aiCodingAssistant');
        const apiKey = config.get<string>('claudeApiKey') || process.env.ANTHROPIC_API_KEY;

        if (!apiKey) {
            console.warn('Claude API key not found. AI assistant will not work.');
        }

        this.client = new Anthropic({
            apiKey: apiKey || 'dummy-key'
        });

        // Initialize the system prompt
        this.systemPrompt = this.createSystemPrompt();
    }

    /**
     * Send a query to Claude and get a structured response
     */
    public async query(
        userQuery: string,
        relevantCode: any[],
        projectMetadata: any
    ): Promise<AssistantResponse> {
        // Prepare context from relevant code
        const codeContext = this.prepareCodeContext(relevantCode);

        // Prepare project metadata context
        const metadataContext = this.prepareMetadataContext(projectMetadata);

        // Combine into full prompt
        const fullPrompt = `
      ${userQuery}
      
      === Project Context ===
      ${metadataContext}
      
      === Relevant Code ===
      ${codeContext}
      
      Please analyze the above context and provide guidance. If I need to run terminal commands or create/modify files, include those steps in a structured format.
    `;

        try {
            // Add the new user message
            this.messages.push({
                role: 'user',
                content: fullPrompt
            });

            // Keep only the last 10 messages (5 exchanges) to manage context
            if (this.messages.length > 10) {
                this.messages = this.messages.slice(this.messages.length - 10);
            }

            // Make the API call
            const response = await this.client.messages.create({
                model: this.model,
                system: this.systemPrompt,
                messages: this.messages,
                max_tokens: 4000
            });

            // Process and parse the response
            const assistantMessage = response.content[0].text;

            // Add the assistant response to the conversation history
            this.messages.push({
                role: 'assistant',
                content: assistantMessage
            });

            // Parse structured steps from the response
            const steps = this.parseSteps(assistantMessage);

            return {
                content: this.removeXMLTags(assistantMessage),
                steps
            };
        } catch (error) {
            console.error('Error calling Claude API:', error);
            throw new Error(`Failed to get a response from Claude: ${error}`);
        }
    }

    /**
     * Create the system prompt for Claude
     */
    private createSystemPrompt(): string {
        return `
      You are an AI assistant integrated into a VSCode extension. Your purpose is to help developers understand, create, and modify code projects.
      
      When the user asks you to take actions:
      1. Analyze the request and the provided code context
      2. Break down what needs to be done into clear, sequential steps
      3. For steps that require terminal commands, provide the exact command
      4. For file operations, specify the file path and content
      
      Format your actionable steps using this XML structure at the end of your response:
      
      <steps>
        <step id="1">
          <description>Brief description of what this step does</description>
          <action type="terminal">
            <command>The exact terminal command to run</command>
          </action>
        </step>
        <step id="2">
          <description>Create a new file</description>
          <action type="file">
            <path>path/to/file.js</path>
            <content>
            // File content goes here
            function example() {
              return true;
            }
            </content>
          </action>
        </step>
      </steps>
      
      First provide a natural language explanation of your approach, then include the structured steps.
      Be specific and explicit with your instructions.
    `;
    }

    /**
     * Prepare a context string from relevant code chunks
     */
    private prepareCodeContext(relevantCode: any[]): string {
        if (!relevantCode || relevantCode.length === 0) {
            return 'No code context available.';
        }

        return relevantCode.map((chunk) => {
            const metadata = chunk.metadata;
            return `--- File: ${metadata.filePath} (Lines ${metadata.startLine + 1}-${metadata.endLine + 1}) ---\n${metadata.content}\n`;
        }).join('\n\n');
    }

    /**
     * Prepare a context string from project metadata
     */
    private prepareMetadataContext(metadata: any): string {
        if (!metadata || Object.keys(metadata).length === 0) {
            return 'No project metadata available.';
        }

        // Format package.json specially
        let context = '';

        if (metadata.packageJson) {
            context += 'package.json dependencies:\n';
            if (metadata.packageJson.dependencies) {
                context += Object.entries(metadata.packageJson.dependencies)
                    .map(([name, version]) => `- ${name}: ${version}`)
                    .join('\n');
            }

            context += '\n\npackage.json dev dependencies:\n';
            if (metadata.packageJson.devDependencies) {
                context += Object.entries(metadata.packageJson.devDependencies)
                    .map(([name, version]) => `- ${name}: ${version}`)
                    .join('\n');
            }

            context += `\n\nProject name: ${metadata.packageJson.name || 'unknown'}\n`;
            context += `Project version: ${metadata.packageJson.version || 'unknown'}\n`;
        }

        // Add names of other config files
        const configFiles = Object.keys(metadata).filter(key => key !== 'packageJson');
        if (configFiles.length > 0) {
            context += `\nConfiguration files present: ${configFiles.join(', ')}\n`;
        }

        return context;
    }

    /**
     * Parse the structured steps from Claude's response
     */
    private parseSteps(response: string): ActionStep[] {
        const steps: ActionStep[] = [];

        // Simple regex-based parsing
        // In a real implementation, you'd want to use proper XML parsing
        const stepsMatch = response.match(/<steps>([\s\S]*?)<\/steps>/);

        if (!stepsMatch) {
            return steps;
        }

        const stepsContent = stepsMatch[1];
        const stepMatches = stepsContent.matchAll(/<step id="([^"]+)">([\s\S]*?)<\/step>/g);

        for (const match of stepMatches) {
            const id = match[1];
            const stepContent = match[2];

            // Extract description
            const descriptionMatch = stepContent.match(/<description>([\s\S]*?)<\/description>/);
            const description = descriptionMatch ? descriptionMatch[1].trim() : '';

            // Determine action type
            let actionType: 'terminal' | 'file' | 'folder' = 'terminal';
            let command = '';
            let filePath = '';
            let fileContent = '';

            if (stepContent.includes('<action type="terminal">')) {
                actionType = 'terminal';
                const commandMatch = stepContent.match(/<command>([\s\S]*?)<\/command>/);
                command = commandMatch ? commandMatch[1].trim() :