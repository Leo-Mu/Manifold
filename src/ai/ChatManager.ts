import * as vscode from 'vscode';
import { AIProvider, AIConfig, ChatMessage, ChatResponse, createAIProvider } from './AIProvider';
import { ContextItem } from '../types/ContextTypes';

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    contextIds: string[];
    createdAt: Date;
    updatedAt: Date;
}

export class ChatManager {
    private aiProvider: AIProvider | null = null;
    private currentSession: ChatSession | null = null;
    private sessions: ChatSession[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.loadSessions();
    }

    async initializeAI(config: AIConfig): Promise<void> {
        try {
            this.aiProvider = createAIProvider(config);
            
            // 保存配置到工作区设置
            await this.saveAIConfig(config);
            
            vscode.window.showInformationMessage(`AI 提供商 ${config.provider} 初始化成功`);
        } catch (error) {
            vscode.window.showErrorMessage(`AI 初始化失败: ${error}`);
            throw error;
        }
    }

    async sendMessage(
        userMessage: string, 
        contextItems: ContextItem[] = [],
        systemPrompt?: string
    ): Promise<ChatResponse> {
        if (!this.aiProvider) {
            throw new Error('AI 提供商未初始化，请先配置 API');
        }

        // 创建或更新当前会话
        if (!this.currentSession) {
            this.currentSession = this.createNewSession(contextItems);
        }

        // 构建消息列表
        const messages: ChatMessage[] = [];

        // 添加系统提示
        if (systemPrompt || contextItems.length > 0) {
            const systemContent = this.buildSystemPrompt(systemPrompt, contextItems);
            messages.push({
                role: 'system',
                content: systemContent
            });
        }

        // 添加历史对话
        messages.push(...this.currentSession.messages);

        // 添加用户消息
        const userMsg: ChatMessage = {
            role: 'user',
            content: userMessage
        };
        messages.push(userMsg);

        try {
            // 发送到 AI
            const response = await this.aiProvider.chat(messages);

            // 保存到会话历史
            this.currentSession.messages.push(userMsg);
            this.currentSession.messages.push({
                role: 'assistant',
                content: response.content
            });
            this.currentSession.updatedAt = new Date();

            // 保存会话
            await this.saveSessions();

            return response;
        } catch (error) {
            vscode.window.showErrorMessage(`AI 对话失败: ${error}`);
            throw error;
        }
    }

    private buildSystemPrompt(customPrompt?: string, contextItems: ContextItem[] = []): string {
        let systemContent = customPrompt || '你是一个有用的AI助手。';

        if (contextItems.length > 0) {
            systemContent += '\n\n以下是相关的上下文信息，请在回答时参考这些内容：\n\n';
            
            contextItems.forEach((item, index) => {
                systemContent += `## 上下文 ${index + 1}: ${item.title}\n`;
                systemContent += `类型: ${item.type}\n`;
                systemContent += `内容:\n${item.content}\n\n`;
            });
        }

        return systemContent;
    }

    private createNewSession(contextItems: ContextItem[]): ChatSession {
        const session: ChatSession = {
            id: this.generateSessionId(),
            title: `对话 ${new Date().toLocaleString()}`,
            messages: [],
            contextIds: contextItems.map(item => item.id),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.sessions.push(session);
        return session;
    }

    private generateSessionId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async createNewChat(): Promise<void> {
        this.currentSession = null;
        vscode.window.showInformationMessage('已创建新的对话会话');
    }

    getCurrentSession(): ChatSession | null {
        return this.currentSession;
    }

    getAllSessions(): ChatSession[] {
        return [...this.sessions];
    }

    async loadSession(sessionId: string): Promise<void> {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSession = session;
            vscode.window.showInformationMessage(`已加载对话: ${session.title}`);
        } else {
            vscode.window.showErrorMessage('对话会话不存在');
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        const index = this.sessions.findIndex(s => s.id === sessionId);
        if (index >= 0) {
            this.sessions.splice(index, 1);
            if (this.currentSession?.id === sessionId) {
                this.currentSession = null;
            }
            await this.saveSessions();
            vscode.window.showInformationMessage('对话会话已删除');
        }
    }

    private async saveAIConfig(config: AIConfig): Promise<void> {
        // 不保存敏感信息到设置中，只保存非敏感配置
        const safeConfig = {
            provider: config.provider,
            baseUrl: config.baseUrl,
            model: config.model,
            temperature: config.temperature,
            maxTokens: config.maxTokens
        };

        const workspaceConfig = vscode.workspace.getConfiguration('vibeContext');
        await workspaceConfig.update('aiConfig', safeConfig, vscode.ConfigurationTarget.Workspace);
    }

    async getAIConfig(): Promise<Partial<AIConfig> | null> {
        const workspaceConfig = vscode.workspace.getConfiguration('vibeContext');
        return workspaceConfig.get('aiConfig') || null;
    }

    private async saveSessions(): Promise<void> {
        const sessionsData = JSON.stringify(this.sessions);
        await this.context.workspaceState.update('chatSessions', sessionsData);
    }

    private loadSessions(): void {
        const sessionsData = this.context.workspaceState.get<string>('chatSessions');
        if (sessionsData) {
            try {
                this.sessions = JSON.parse(sessionsData).map((s: any) => ({
                    ...s,
                    createdAt: new Date(s.createdAt),
                    updatedAt: new Date(s.updatedAt)
                }));
            } catch (error) {
                console.error('加载对话会话失败:', error);
                this.sessions = [];
            }
        }
    }
}