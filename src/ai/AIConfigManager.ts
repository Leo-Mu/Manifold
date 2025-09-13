import * as vscode from 'vscode';
import { AIConfig } from './AIProvider';

export interface SavedAIConfig extends AIConfig {
    id: string;
    name: string;
    createdAt: Date;
    lastUsed?: Date;
}

export class AIConfigManager {
    private configs: SavedAIConfig[] = [];
    private activeConfigId: string | null = null;

    constructor(private context: vscode.ExtensionContext) {
        this.loadConfigs();
    }

    async saveConfig(config: AIConfig, name: string): Promise<string> {
        const id = this.generateId();
        const savedConfig: SavedAIConfig = {
            ...config,
            id,
            name,
            createdAt: new Date(),
            lastUsed: new Date()
        };

        // 检查是否已存在同名配置
        const existingIndex = this.configs.findIndex(c => c.name === name);
        if (existingIndex >= 0) {
            // 更新现有配置
            this.configs[existingIndex] = { ...savedConfig, createdAt: this.configs[existingIndex].createdAt };
        } else {
            // 添加新配置
            this.configs.push(savedConfig);
        }

        await this.persistConfigs();
        return id;
    }

    async deleteConfig(id: string): Promise<void> {
        const index = this.configs.findIndex(c => c.id === id);
        if (index >= 0) {
            this.configs.splice(index, 1);

            // 如果删除的是当前激活的配置，清除激活状态
            if (this.activeConfigId === id) {
                this.activeConfigId = null;
            }

            await this.persistConfigs();
        }
    }

    async setActiveConfig(id: string): Promise<SavedAIConfig | null> {
        const config = this.configs.find(c => c.id === id);
        if (config) {
            this.activeConfigId = id;
            config.lastUsed = new Date();
            await this.persistConfigs();
            return config;
        }
        return null;
    }

    getActiveConfig(): SavedAIConfig | null {
        if (!this.activeConfigId) return null;
        return this.configs.find(c => c.id === this.activeConfigId) || null;
    }

    getAllConfigs(): SavedAIConfig[] {
        return [...this.configs].sort((a, b) => {
            // 按最后使用时间排序，未使用的排在后面
            const aTime = a.lastUsed?.getTime() || 0;
            const bTime = b.lastUsed?.getTime() || 0;
            return bTime - aTime;
        });
    }

    getConfigById(id: string): SavedAIConfig | null {
        return this.configs.find(c => c.id === id) || null;
    }

    async updateConfig(id: string, updates: Partial<AIConfig>): Promise<boolean> {
        const config = this.configs.find(c => c.id === id);
        if (config) {
            Object.assign(config, updates);
            await this.persistConfigs();
            return true;
        }
        return false;
    }

    async renameConfig(id: string, newName: string): Promise<boolean> {
        const config = this.configs.find(c => c.id === id);
        if (config) {
            // 检查新名称是否已存在
            const existingConfig = this.configs.find(c => c.name === newName && c.id !== id);
            if (existingConfig) {
                throw new Error(`配置名称 "${newName}" 已存在`);
            }

            config.name = newName;
            await this.persistConfigs();
            return true;
        }
        return false;
    }

    private async persistConfigs(): Promise<void> {
        // 保存配置到工作区状态（不包含敏感信息）
        const safeConfigs = this.configs.map(config => ({
            id: config.id,
            name: config.name,
            provider: config.provider,
            baseUrl: config.baseUrl,
            model: config.model,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            createdAt: config.createdAt.toISOString(),
            lastUsed: config.lastUsed?.toISOString()
        }));

        await this.context.workspaceState.update('aiConfigs', safeConfigs);
        await this.context.workspaceState.update('activeConfigId', this.activeConfigId);

        // API Keys 单独加密存储
        const apiKeys: { [id: string]: string } = {};
        this.configs.forEach(config => {
            if (config.apiKey) {
                apiKeys[config.id] = config.apiKey;
            }
        });
        await this.context.secrets.store('aiApiKeys', JSON.stringify(apiKeys));
    }

    private loadConfigs(): void {
        const safeConfigs = this.context.workspaceState.get<any[]>('aiConfigs', []);
        this.activeConfigId = this.context.workspaceState.get<string | null>('activeConfigId') || null;

        // 加载 API Keys
        this.loadApiKeys(safeConfigs);
    }

    private async loadApiKeys(safeConfigs: any[]): Promise<void> {
        try {
            const apiKeysJson = await this.context.secrets.get('aiApiKeys');
            const apiKeys = apiKeysJson ? JSON.parse(apiKeysJson) : {};

            this.configs = safeConfigs.map(config => ({
                ...config,
                apiKey: apiKeys[config.id] || '',
                createdAt: new Date(config.createdAt),
                lastUsed: config.lastUsed ? new Date(config.lastUsed) : undefined
            }));
        } catch (error) {
            console.error('加载 API Keys 失败:', error);
            this.configs = safeConfigs.map(config => ({
                ...config,
                apiKey: '',
                createdAt: new Date(config.createdAt),
                lastUsed: config.lastUsed ? new Date(config.lastUsed) : undefined
            }));
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // 导出配置（不包含敏感信息）
    exportConfigs(): any[] {
        return this.configs.map(config => ({
            name: config.name,
            provider: config.provider,
            baseUrl: config.baseUrl,
            model: config.model,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            createdAt: config.createdAt
        }));
    }

    // 导入配置
    async importConfigs(configs: any[]): Promise<number> {
        let importedCount = 0;

        for (const config of configs) {
            try {
                // 检查必要字段
                if (!config.name || !config.provider || !config.model) {
                    continue;
                }

                // 生成唯一名称
                let name = config.name;
                let counter = 1;
                while (this.configs.some(c => c.name === name)) {
                    name = `${config.name} (${counter})`;
                    counter++;
                }

                const savedConfig: SavedAIConfig = {
                    id: this.generateId(),
                    name,
                    provider: config.provider,
                    apiKey: '', // 需要用户重新输入
                    baseUrl: config.baseUrl,
                    model: config.model,
                    temperature: config.temperature || 0.7,
                    maxTokens: config.maxTokens || 2000,
                    createdAt: new Date()
                };

                this.configs.push(savedConfig);
                importedCount++;
            } catch (error) {
                console.error('导入配置失败:', error);
            }
        }

        if (importedCount > 0) {
            await this.persistConfigs();
        }

        return importedCount;
    }
}