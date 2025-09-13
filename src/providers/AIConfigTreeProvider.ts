import * as vscode from 'vscode';
import { AIConfigManager, SavedAIConfig } from '../ai/AIConfigManager';

export class AIConfigTreeProvider implements vscode.TreeDataProvider<AIConfigTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AIConfigTreeItem | undefined | null | void> = new vscode.EventEmitter<AIConfigTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AIConfigTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private configManager: AIConfigManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AIConfigTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: AIConfigTreeItem): Promise<AIConfigTreeItem[]> {
        if (!element) {
            // 根节点，返回所有配置
            const configs = this.configManager.getAllConfigs();
            const activeConfig = this.configManager.getActiveConfig();
            
            const items = configs.map(config => {
                const item = new AIConfigTreeItem(
                    config.name,
                    vscode.TreeItemCollapsibleState.None,
                    'config',
                    config
                );
                
                // 设置图标和状态
                if (activeConfig?.id === config.id) {
                    item.description = '(当前)';
                    item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
                } else {
                    item.iconPath = this.getProviderIcon(config.provider);
                }
                
                // 设置工具提示
                item.tooltip = this.getConfigTooltip(config);
                
                // 设置上下文菜单
                item.contextValue = activeConfig?.id === config.id ? 'activeConfig' : 'config';
                
                return item;
            });

            // 添加新建配置按钮
            const newConfigItem = new AIConfigTreeItem(
                '+ 新建 AI 配置',
                vscode.TreeItemCollapsibleState.None,
                'newConfig'
            );
            newConfigItem.iconPath = new vscode.ThemeIcon('add');
            newConfigItem.command = {
                command: 'vibeContext.configureAI',
                title: '新建 AI 配置'
            };

            return [newConfigItem, ...items];
        }

        return [];
    }

    private getProviderIcon(provider: string): vscode.ThemeIcon {
        switch (provider) {
            case 'openai':
                return new vscode.ThemeIcon('robot');
            case 'anthropic':
                return new vscode.ThemeIcon('organization');
            case 'custom':
                return new vscode.ThemeIcon('server');
            default:
                return new vscode.ThemeIcon('question');
        }
    }

    private getConfigTooltip(config: SavedAIConfig): string {
        const lines = [
            `名称: ${config.name}`,
            `提供商: ${this.getProviderDisplayName(config.provider)}`,
            `模型: ${config.model}`,
            `创建时间: ${config.createdAt.toLocaleString()}`
        ];

        if (config.baseUrl) {
            lines.push(`API 地址: ${config.baseUrl}`);
        }

        if (config.lastUsed) {
            lines.push(`最后使用: ${config.lastUsed.toLocaleString()}`);
        }

        lines.push(`温度: ${config.temperature}`);
        lines.push(`最大 Token: ${config.maxTokens}`);

        return lines.join('\n');
    }

    private getProviderDisplayName(provider: string): string {
        switch (provider) {
            case 'openai':
                return 'OpenAI';
            case 'anthropic':
                return 'Anthropic (Claude)';
            case 'custom':
                return '自定义 API';
            default:
                return provider;
        }
    }
}

export class AIConfigTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: 'config' | 'newConfig',
        public readonly config?: SavedAIConfig
    ) {
        super(label, collapsibleState);
        
        this.contextValue = itemType;
        
        if (itemType === 'config' && config) {
            this.command = {
                command: 'vibeContext.switchAIConfig',
                title: '切换到此配置',
                arguments: [config.id]
            };
        }
    }
}