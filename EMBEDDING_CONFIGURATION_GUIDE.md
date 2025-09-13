# 🔧 Embedding 配置指南

## 概述

为了使用智能功能（语义搜索、智能推荐、关系分析等），您需要配置 Embedding 模型。Embedding 模型将文本转换为高维向量，使系统能够理解内容的语义含义。

## 🚀 快速配置

### 1. 配置 AI 提供商时启用智能功能

当您执行 `Vibe Context: 配置 AI 提供商` 时，系统会询问是否启用智能功能：

```
是否启用智能功能？
✅ 启用智能功能（推荐） - 启用语义搜索、智能推荐等功能
❌ 仅使用基础功能 - 只使用聊天功能，不启用智能分析
```

选择"启用智能功能"后，系统会自动配置相应的 Embedding 设置。

## 📋 各提供商配置详情

### OpenAI 配置

**优势**: 最简单的配置，使用相同的 API Key

**配置步骤**:
1. 输入 OpenAI API Key
2. 选择聊天模型（如 gpt-4）
3. 选择启用智能功能
4. 选择 Embedding 模型：
   - `text-embedding-ada-002` (推荐)
   - `text-embedding-3-small` (更新)
   - `text-embedding-3-large` (最强)

**自动配置**:
- Embedding API Key: 使用相同的 OpenAI API Key
- Embedding URL: 自动设置为 OpenAI Embedding 端点

### Anthropic (Claude) 配置

**注意**: Claude 本身不提供 Embedding 服务，需要配置额外的 Embedding 提供商

**配置步骤**:
1. 输入 Anthropic API Key
2. 选择 Claude 模型
3. 选择启用智能功能
4. 配置 Embedding 服务（推荐使用 OpenAI）：
   - 输入 Embedding API Key（OpenAI）
   - 选择 Embedding 模型

**推荐配置**:
```
聊天模型: Claude-3-Sonnet
Embedding 服务: OpenAI text-embedding-ada-002
```

### 自定义 API 配置

**适用场景**: 使用本地部署或第三方兼容服务

**配置步骤**:
1. 输入聊天 API 地址和 Key
2. 选择启用智能功能
3. 配置 Embedding API：
   - Embedding API 地址
   - Embedding API Key
   - Embedding 模型名称

**示例配置**:
```
聊天 API: https://your-api.com/v1/chat/completions
Embedding API: https://your-api.com/v1/embeddings
模型: your-embedding-model
```

## 🔍 验证配置

### 检查智能模式状态

1. 使用命令 `Vibe Context: 显示处理统计`
2. 查看是否显示"智能模式已启用"
3. 检查向量存储统计信息

### 测试智能功能

1. **解析内容**: 使用 `Vibe Context: 解析当前对话`
2. **智能推荐**: 使用 `Ctrl+K Ctrl+R` 获取智能推荐
3. **关系分析**: 使用 `Ctrl+K Ctrl+N` 分析内容关系

如果功能正常工作，说明 Embedding 配置成功。

## ⚙️ 高级配置

### 手动编辑配置

如果需要手动调整 Embedding 配置，可以：

1. 使用 `Vibe Context: 编辑 AI 配置`
2. 修改以下字段：
   ```json
   {
     "enableEmbedding": true,
     "embeddingModel": "text-embedding-ada-002",
     "embeddingApiKey": "your-embedding-api-key",
     "embeddingBaseUrl": "https://api.openai.com/v1/embeddings"
   }
   ```

### 性能优化配置

**模型选择建议**:
- **text-embedding-ada-002**: 平衡性能和成本，推荐日常使用
- **text-embedding-3-small**: 更快速度，适合大量文本处理
- **text-embedding-3-large**: 最高质量，适合精确分析

**成本控制**:
- 限制处理的文本长度（系统自动截取前8000字符）
- 使用缓存避免重复计算
- 批量处理相似内容

## 🚨 常见问题

### Q: 提示"智能模式未启用"

**解决方案**:
1. 检查是否在配置时选择了"启用智能功能"
2. 验证 Embedding API Key 是否正确
3. 使用 `Vibe Context: 启用智能模式` 重新配置

### Q: Embedding API 调用失败

**可能原因**:
- API Key 无效或过期
- API 地址配置错误
- 网络连接问题
- 模型名称不正确

**解决方案**:
1. 验证 API Key 有效性
2. 检查 API 地址格式
3. 测试网络连接
4. 确认模型名称正确

### Q: 智能功能响应慢

**优化建议**:
1. 选择更快的 Embedding 模型
2. 减少处理的文本数量
3. 检查网络延迟
4. 使用本地 Embedding 服务

### Q: 推荐质量不佳

**改进方法**:
1. 使用更高质量的 Embedding 模型
2. 增加训练数据量
3. 调整推荐阈值
4. 提供更多用户反馈

## 💡 最佳实践

### 1. 选择合适的配置

**轻量使用**:
```
提供商: OpenAI
聊天模型: gpt-3.5-turbo
Embedding: text-embedding-ada-002
```

**高质量分析**:
```
提供商: OpenAI
聊天模型: gpt-4
Embedding: text-embedding-3-large
```

**成本优化**:
```
提供商: 自定义API (本地部署)
聊天模型: 本地模型
Embedding: 本地 Embedding 服务
```

### 2. 监控使用情况

- 定期查看处理统计
- 监控 API 调用成本
- 评估推荐质量
- 收集用户反馈

### 3. 渐进式启用

1. **第一阶段**: 仅启用基础聊天功能
2. **第二阶段**: 启用智能推荐
3. **第三阶段**: 启用完整智能分析

## 🔄 配置更新

### 更换 Embedding 提供商

1. 使用 `Vibe Context: 编辑 AI 配置`
2. 更新 Embedding 相关字段
3. 重启 VS Code 或重新加载配置
4. 测试新配置是否工作

### 升级 Embedding 模型

1. 编辑配置中的 `embeddingModel` 字段
2. 清理旧的向量缓存
3. 重新处理重要内容
4. 验证推荐质量改善

## 📊 配置示例

### 完整的 OpenAI 配置
```json
{
  "name": "OpenAI-Complete",
  "provider": "openai",
  "apiKey": "sk-your-openai-key",
  "model": "gpt-4",
  "enableEmbedding": true,
  "embeddingModel": "text-embedding-ada-002",
  "embeddingApiKey": "sk-your-openai-key",
  "temperature": 0.7,
  "maxTokens": 2000
}
```

### Claude + OpenAI Embedding 配置
```json
{
  "name": "Claude-Smart",
  "provider": "anthropic",
  "apiKey": "sk-ant-your-claude-key",
  "model": "claude-3-sonnet-20240229",
  "enableEmbedding": true,
  "embeddingModel": "text-embedding-ada-002",
  "embeddingApiKey": "sk-your-openai-key",
  "embeddingBaseUrl": "https://api.openai.com/v1/embeddings"
}
```

### 自定义 API 配置
```json
{
  "name": "Custom-Local",
  "provider": "custom",
  "apiKey": "your-custom-key",
  "baseUrl": "https://your-api.com/v1/chat/completions",
  "model": "your-chat-model",
  "enableEmbedding": true,
  "embeddingModel": "your-embedding-model",
  "embeddingApiKey": "your-embedding-key",
  "embeddingBaseUrl": "https://your-api.com/v1/embeddings"
}
```

---

🎉 配置完成后，您就可以享受完整的智能上下文管理体验了！系统将自动分析内容语义，提供精准的推荐和洞察。