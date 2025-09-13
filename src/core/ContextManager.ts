import { ChatHistoryParser } from '../parsers/ChatHistoryParser';
import { DatabaseManager } from '../storage/DatabaseManager';
import { ContextItem, ParsedContent } from '../types/ContextTypes';
import { IntelligentContextManager, IntelligentProcessingResult } from '../intelligence/IntelligentContextManager';
import { AIProvider } from '../ai/AIProvider';

export class ContextManager {
    private intelligentManager?: IntelligentContextManager;
    private intelligentMode: boolean = false;

    constructor(
        private dbManager: DatabaseManager,
        private chatParser: ChatHistoryParser,
        aiProvider?: AIProvider
    ) {
        // 如果提供了AI提供商，启用智能模式
        if (aiProvider) {
            this.intelligentManager = new IntelligentContextManager(
                dbManager,
                chatParser,
                aiProvider
            );
            this.intelligentMode = true;
            console.log('智能上下文管理器已启用');
        }
    }

    async parseAndStore(content: string): Promise<IntelligentProcessingResult | void> {
        try {
            console.log('开始解析内容，长度:', content.length);
            
            // 如果启用智能模式，使用智能处理
            if (this.intelligentMode && this.intelligentManager) {
                console.log('使用智能处理模式');
                const result = await this.intelligentManager.intelligentParseAndStore(content);
                console.log('智能处理完成:', {
                    newItems: result.newItems.length,
                    recommendations: result.recommendations.items.length,
                    insights: result.insights.length,
                    suggestions: result.reorganizationSuggestions.length
                });
                return result;
            } else {
                // 使用传统处理模式
                console.log('使用传统处理模式');
                const parsed = this.chatParser.parse(content);
                
                console.log('解析结果:', {
                    codeBlocks: parsed.codeBlocks.length,
                    jsonBlocks: parsed.jsonBlocks.length,
                    qaBlocks: parsed.qaBlocks.length
                });
                
                await this.storeContexts(parsed);
            }
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
        // 如果启用智能模式，使用智能搜索
        if (this.intelligentMode && this.intelligentManager) {
            const result = await this.intelligentManager.intelligentSearch(query);
            // 合并所有搜索结果
            const allResults = [
                ...result.directMatches,
                ...result.semanticMatches,
                ...result.recommendations.items.map(r => r.item)
            ];
            
            // 去重并返回
            const uniqueResults = this.deduplicateItems(allResults);
            return uniqueResults.slice(0, 20); // 限制结果数量
        } else {
            return await this.dbManager.searchContexts(query);
        }
    }

    async deleteContext(id: string): Promise<void> {
        await this.dbManager.deleteContext(id);
    }

    /**
     * 获取智能推荐（仅在智能模式下可用）
     */
    async getIntelligentRecommendations(
        query?: string,
        currentContext?: ContextItem[],
        maxResults?: number
    ): Promise<any> {
        if (this.intelligentMode && this.intelligentManager) {
            return await this.intelligentManager.getIntelligentRecommendations(query, currentContext, maxResults);
        }
        return null;
    }

    /**
     * 获取相关内容（仅在智能模式下可用）
     */
    async getRelatedContent(itemId: string, maxResults: number = 5): Promise<any> {
        if (this.intelligentMode && this.intelligentManager) {
            return await this.intelligentManager.getRelatedContent(itemId, maxResults);
        }
        return null;
    }

    /**
     * 分析关系网络（仅在智能模式下可用）
     */
    async analyzeRelationshipNetwork(itemIds: string[]): Promise<any> {
        if (this.intelligentMode && this.intelligentManager) {
            return await this.intelligentManager.analyzeRelationshipNetwork(itemIds);
        }
        return null;
    }

    /**
     * 获取处理统计信息
     */
    getProcessingStats(): any {
        if (this.intelligentMode && this.intelligentManager) {
            return this.intelligentManager.getProcessingStats();
        }
        return {
            intelligentMode: false,
            message: '智能模式未启用'
        };
    }

    /**
     * 检查是否启用智能模式
     */
    isIntelligentModeEnabled(): boolean {
        return this.intelligentMode;
    }

    /**
     * 去重项目
     */
    private deduplicateItems(items: ContextItem[]): ContextItem[] {
        const seen = new Set<string>();
        return items.filter(item => {
            if (seen.has(item.id)) {
                return false;
            }
            seen.add(item.id);
            return true;
        });
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}