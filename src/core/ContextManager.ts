import { ChatHistoryParser } from '../parsers/ChatHistoryParser';
import { DatabaseManager } from '../storage/DatabaseManager';
import { ContextItem, ParsedContent } from '../types/ContextTypes';

export class ContextManager {
    constructor(
        private dbManager: DatabaseManager,
        private chatParser: ChatHistoryParser
    ) {}

    async parseAndStore(content: string): Promise<void> {
        try {
            const parsed = this.chatParser.parse(content);
            await this.storeContexts(parsed);
        } catch (error) {
            throw new Error(`解析存储失败: ${error}`);
        }
    }

    private async storeContexts(parsedContent: ParsedContent): Promise<void> {
        const contextItems: ContextItem[] = [];

        // 存储代码块
        for (const codeBlock of parsedContent.codeBlocks) {
            contextItems.push({
                id: this.generateId(),
                type: 'code',
                title: `${codeBlock.language} 代码片段`,
                content: codeBlock.code,
                preview: codeBlock.code.substring(0, 100) + '...',
                timestamp: new Date(),
                metadata: {
                    language: codeBlock.language,
                    lineCount: codeBlock.code.split('\n').length
                }
            });
        }

        // 存储JSON数据
        for (const jsonData of parsedContent.jsonBlocks) {
            contextItems.push({
                id: this.generateId(),
                type: 'json',
                title: 'JSON 数据',
                content: JSON.stringify(jsonData, null, 2),
                preview: JSON.stringify(jsonData).substring(0, 100) + '...',
                timestamp: new Date(),
                metadata: {
                    keys: Object.keys(jsonData).length
                }
            });
        }

        // 存储问答对
        for (const qa of parsedContent.qaBlocks) {
            contextItems.push({
                id: this.generateId(),
                type: 'qa',
                title: qa.question.substring(0, 50) + '...',
                content: `Q: ${qa.question}\n\nA: ${qa.answer}`,
                preview: qa.question,
                timestamp: new Date(),
                metadata: {
                    questionLength: qa.question.length,
                    answerLength: qa.answer.length
                }
            });
        }

        // 批量存储到数据库
        for (const item of contextItems) {
            await this.dbManager.insertContext(item);
        }
    }

    async getRecentContexts(limit: number = 20): Promise<ContextItem[]> {
        return await this.dbManager.getRecentContexts(limit);
    }

    async getContextsByIds(ids: string[]): Promise<ContextItem[]> {
        return await this.dbManager.getContextsByIds(ids);
    }

    async searchContexts(query: string): Promise<ContextItem[]> {
        return await this.dbManager.searchContexts(query);
    }

    async deleteContext(id: string): Promise<void> {
        await this.dbManager.deleteContext(id);
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}