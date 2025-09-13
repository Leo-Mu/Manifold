import * as vscode from 'vscode';
import { ContextManager } from '../core/ContextManager';
import { ContextItem } from '../types/ContextTypes';

export class ContextTreeProvider implements vscode.TreeDataProvider<ContextTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ContextTreeItem | undefined | null | void> = new vscode.EventEmitter<ContextTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ContextTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private contextManager: ContextManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ContextTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ContextTreeItem): Promise<ContextTreeItem[]> {
        if (!element) {
            // 根节点，返回分类
            return [
                new ContextTreeItem('代码片段', 'code', vscode.TreeItemCollapsibleState.Expanded),
                new ContextTreeItem('JSON数据', 'json', vscode.TreeItemCollapsibleState.Expanded),
                new ContextTreeItem('问答对话', 'qa', vscode.TreeItemCollapsibleState.Expanded)
            ];
        } else {
            // 返回具体的上下文项
            const contexts = await this.contextManager.getRecentContexts(50);
            const filteredContexts = contexts.filter(ctx => ctx.type === element.contextType);
            
            return filteredContexts.map(ctx => {
                const item = new ContextTreeItem(
                    ctx.title,
                    ctx.type,
                    vscode.TreeItemCollapsibleState.None,
                    ctx
                );
                
                item.tooltip = ctx.preview;
                item.description = this.formatTimestamp(ctx.timestamp);
                item.command = {
                    command: 'vibeContext.openContext',
                    title: '打开上下文',
                    arguments: [ctx]
                };

                // 设置图标
                switch (ctx.type) {
                    case 'code':
                        item.iconPath = new vscode.ThemeIcon('code');
                        break;
                    case 'json':
                        item.iconPath = new vscode.ThemeIcon('json');
                        break;
                    case 'qa':
                        item.iconPath = new vscode.ThemeIcon('comment-discussion');
                        break;
                }

                return item;
            });
        }
    }

    private formatTimestamp(timestamp: Date): string {
        const now = new Date();
        const diff = now.getTime() - timestamp.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}天前`;
        } else if (hours > 0) {
            return `${hours}小时前`;
        } else if (minutes > 0) {
            return `${minutes}分钟前`;
        } else {
            return '刚刚';
        }
    }
}

export class ContextTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly contextType: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextItem?: ContextItem
    ) {
        super(label, collapsibleState);
        
        if (!contextItem) {
            // 这是分类节点
            this.contextValue = 'contextCategory';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else {
            // 这是具体的上下文项
            this.contextValue = 'contextItem';
        }
    }
}