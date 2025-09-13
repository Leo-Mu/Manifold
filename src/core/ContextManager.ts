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
            console.log('开始解析内容，长度:', content.length);
            const parsed = this.chatParser.parse(content);
            
            console.log('解析结果:', {
                codeBlocks: parsed.codeBlocks.length,
                jsonBlocks: parsed.jsonBlocks.length,
                qaBlocks: parsed.qaBlocks.length
            });
            
            await this.storeContexts(parsed);
        } catch (error) {
            console.error('解析存储详细错误:', error);
            throw new Error(`解析存储失败: ${error}`);
        }
    }

    private async storeContexts(parsedContent: ParsedContent): Promise<void> {
        const contextItems: ContextItem[] = [];

        // 存储代码块
        for (const codeBlock of parsedContent.codeBlocks) {
            const item = {
                id: this.generateId(),
                type: 'code' as const,
                title: `${codeBlock.language} 代码片段`,
                content: codeBlock.code,
                preview: codeBlock.code.substring(0, 100) + (codeBlock.code.length > 100 ? '...' : ''),
                timestamp: new Date(),
                metadata: {
                    language: codeBlock.language,
                    lineCount: codeBlock.code.split('\n').length
                }
            };
            contextItems.push(item);
            console.log('添加代码块:', item.title);
        }

        // 存储JSON数据
        for (const jsonData of parsedContent.jsonBlocks) {
            const jsonStr = JSON.stringify(jsonData, null, 2);
            const item = {
                id: this.generateId(),
                type: 'json' as const,
                title: 'JSON 数据',
                content: jsonStr,
                preview: jsonStr.substring(0, 100) + (jsonStr.length > 100 ? '...' : ''),
                timestamp: new Date(),
                metadata: {
                    keys: Object.keys(jsonData).length
                }
            };
            contextItems.push(item);
            console.log('添加JSON数据:', item.title);
        }

        // 存储问答对
        for (const qa of parsedContent.qaBlocks) {
            const item = {
                id: this.generateId(),
                type: 'qa' as const,
                title: qa.question.length > 50 ? qa.question.substring(0, 50) + '...' : qa.question,
                content: `Q: ${qa.question}\n\nA: ${qa.answer}`,
                preview: qa.question,
                timestamp: new Date(),
                metadata: {
                    questionLength: qa.question.length,
                    answerLength: qa.answer.length
                }
            };
            contextItems.push(item);
            console.log('添加问答对:', item.title);
        }

        console.log(`准备存储 ${contextItems.length} 个上下文项`);

        // 批量存储到数据库
        for (const item of contextItems) {
            await this.dbManager.insertContext(item);
        }
        
        console.log('存储完成');
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