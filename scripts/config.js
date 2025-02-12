// SiliconFlow API配置
const defaultConfig = {
    SILICONFLOW_API_KEY: '', // API密钥
    SILICONFLOW_API_URL: 'https://api.siliconflow.cn/v1/chat/completions',
    MODEL: 'deepseek-ai/DeepSeek-V3', // 默认模型
    MAX_TOKENS: 512,
    TEMPERATURE: 0.7,
    TOP_P: 0.7,
    TOP_K: 50,
    FREQUENCY_PENALTY: 0.5,
    PRESENCE_PENALTY: 0,
    STOP: [],
    N: 1,
    RESPONSE_FORMAT: {
        type: "text"
    },
    // 添加默认prompt
    DEFAULT_PROMPT: `请对以下文章内容进行总结，要求：
1. 提取文章的主要观点和关键信息
2. 总结要简洁明了，突出重点
3. 使用简单的HTML格式输出，可以使用以下标签：
   - <h2>标题</h2>：用于各部分标题
   - <p>段落内容</p>：用于普通段落
   - <strong>重点内容</strong>：用于强调重要信息
   - <ul><li>列表项</li></ul>：用于列举要点
4. 总结长度控制在500字以内
5. 建议的输出结构：
   - 开头：一段总体概述
   - 中间：3-10个核心要点(根据文章内容而定)
   - 结尾：简短结论`,
    CUSTOM_PROMPT: '' // 用户自定义prompt
};

// 运行时配置
let config = { ...defaultConfig };

// 保存所有配置
async function saveConfig(newConfig) {
    try {
        await chrome.storage.sync.set({ 'siliconflow_config': newConfig });
        config = { ...defaultConfig, ...newConfig };
        console.log('配置保存成功:', config);
    } catch (error) {
        console.error('保存配置失败:', error);
        throw error;
    }
}

// 获取所有配置
async function getConfig() {
    try {
        const result = await chrome.storage.sync.get(['siliconflow_config']);
        config = { ...defaultConfig, ...result.siliconflow_config };
        console.log('获取配置:', config);
        
        // 验证API密钥
        if (!config.SILICONFLOW_API_KEY) {
            console.warn('未设置API密钥');
        }
        
        return config;
    } catch (error) {
        console.error('获取配置失败:', error);
        return defaultConfig;
    }
}

// 获取可用的模型列表
const availableModels = [
    // DeepSeek系列
    'deepseek-ai/DeepSeek-V3',
    'deepseek-ai/DeepSeek-V2.5',
    'deepseek-ai/DeepSeek-R1',
    'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
    'deepseek-ai/DeepSeek-R1-Distill-Llama-8B',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
    // Qwen系列
    'Qwen/Qwen2.5-72B-Instruct-128K',
    'Qwen/Qwen2.5-72B-Instruct',
    'Qwen/Qwen2.5-32B-Instruct',
    'Qwen/Qwen2.5-14B-Instruct',
    'Qwen/Qwen2.5-7B-Instruct',
    'Qwen/Qwen2.5-Coder-32B-Instruct',
    'Qwen/Qwen2.5-Coder-7B-Instruct',
    'Qwen/Qwen2-7B-Instruct',
    'Qwen/Qwen2-1.5B-Instruct',
    // 其他模型
    'meta-llama/Llama-3.3-70B-Instruct',
    'AIDC-AI/Marco-o1'
];

export { config, defaultConfig, availableModels, saveConfig, getConfig }; 
