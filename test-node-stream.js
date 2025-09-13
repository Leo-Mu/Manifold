// Node.js 流处理测试脚本
const fetch = require('node-fetch');

async function testNodeStream() {
    console.log('测试 Node.js 流处理...');
    
    // 模拟一个返回流数据的请求
    try {
        const response = await fetch('https://httpbin.org/stream/5');
        
        if (!response.body) {
            console.error('响应体为空');
            return;
        }
        
        console.log('response.body 类型:', typeof response.body);
        console.log('response.body 构造函数:', response.body.constructor.name);
        console.log('是否有 getReader 方法:', typeof response.body.getReader);
        console.log('是否有 on 方法:', typeof response.body.on);
        
        // 测试 Node.js 流事件
        return new Promise((resolve, reject) => {
            let buffer = '';
            
            response.body.on('data', (chunk) => {
                console.log('收到数据块:', chunk.length, '字节');
                buffer += chunk.toString();
            });
            
            response.body.on('end', () => {
                console.log('流结束，总共收到:', buffer.length, '字节');
                console.log('前100个字符:', buffer.substring(0, 100));
                resolve();
            });
            
            response.body.on('error', (error) => {
                console.error('流错误:', error);
                reject(error);
            });
        });
        
    } catch (error) {
        console.error('测试失败:', error);
    }
}

// 运行测试
testNodeStream().then(() => {
    console.log('测试完成');
}).catch((error) => {
    console.error('测试出错:', error);
});