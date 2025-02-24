import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class FileOperationManager {
    /**
     * Create or update a file with the given content
     */
    public async createOrUpdateFile(relativePath: string, content: string): Promise<void> {
        try {
            // Get the workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder open');
            }

            // Create the full file path
            const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);

            // Ensure the directory exists
            await this.ensureDirectoryExists(path.dirname(fullPath));

            // Write the file
            fs.writeFileSync(fullPath, content);

            // Open the file in the editor
            const document = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(document);

            return Promise.resolve();
        } catch (error) {
            console.error(`Error creating/updating file ${relativePath}:`, error);
            throw error;
        }
    }

    /**
     * Create a directory if it doesn't exist
     */
    public async createDirectory(relativePath: string): Promise<void> {
        try {
            // Get the workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder open');
            }

            // Create the full directory path
            const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);

            // Ensure the directory exists
            await this.ensureDirectoryExists(fullPath);

            return Promise.resolve();
        } catch (error) {
            console.error(`Error creating directory ${relativePath}:`, error);
            throw error;
        }
    }

    /**
     * Ensure a directory exists, creating it if necessary
     */
    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            // Check if directory exists
            await fs.promises.access(dirPath);
        } catch {
            // Directory doesn't exist, create it
            await fs.promises.mkdir(dirPath, { recursive: true });
        }
    }

    /**
     * Preview a file's content before creating/updating
     */
    public async previewFileContent(relativePath: string, content: string): Promise<boolean> {
        // Create a temporary document for preview
        const document = await vscode.workspace.openTextDocument({
            content,
            language: this.getLanguageFromPath(relativePath)
        });

        // Show the document
        await vscode.window.showTextDocument(document);

        // Ask for confirmation
        const result = await vscode.window.showInformationMessage(
            `Preview of ${relativePath}. Create this file?`,
            'Yes', 'No'
        );

        return result === 'Yes';
    }

    /**
     * Get the language ID from a file path
     */
    private getLanguageFromPath(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();

        const languageMap: Record<string, string> = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascriptreact',
            '.tsx': 'typescriptreact',
            '.html': 'html',
            '.css': 'css',
            '.json': 'json',
            '.md': 'markdown',
            '.py': 'python',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.go': 'go',
            '.rb': 'ruby',
            '.php': 'php'
        };

        return languageMap[ext] || 'plaintext';
    }
}