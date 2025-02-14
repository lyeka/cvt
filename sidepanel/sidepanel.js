// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
    const loadingContainer = document.querySelector('.loading-container');
    const errorContainer = document.querySelector('.error-container');
    const summaryContent = document.querySelector('.summary-content');
    const refreshBtn = document.querySelector('.refresh-btn');
    const copyBtn = document.querySelector('.copy-btn');
    const retryBtn = document.querySelector('.retry-btn');
    const statusSpan = document.querySelector('.status');
    const statusDot = document.querySelector('.status-dot');
    const toast = document.querySelector('.toast');

    // 显示加载动画
    function showLoading() {
        loadingContainer.style.display = 'flex';
        errorContainer.style.display = 'none';
        summaryContent.style.display = 'none';
        statusDot.style.backgroundColor = '#ffb340';
    }

    // 隐藏加载动画
    function hideLoading() {
        loadingContainer.style.display = 'none';
    }

    // 显示错误信息
    function showError(message) {
        errorContainer.style.display = 'flex';
        errorContainer.querySelector('.error-message').textContent = message;
        summaryContent.style.display = 'none';
        statusDot.style.backgroundColor = '#ff3b30';
    }

    // 显示Toast提示
    function showToast(message, duration = 2000) {
        toast.querySelector('.toast-message').textContent = message;
        toast.style.display = 'flex';
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.style.display = 'none';
            }, 300);
        }, duration);
    }

    // 复制文本内容
    async function copyText() {
        try {
            const text = summaryContent.textContent;
            await navigator.clipboard.writeText(text);
            showToast('复制成功');
        } catch (err) {
            showToast('复制失败，请重试');
            console.error('复制失败:', err);
        }
    }

    // 监听来自background的流式更新消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'streamUpdate') {
            console.log('收到流式更新消息:', message);
            
            // 检查内容是否为空
            if (!message.content) {
                console.warn('收到空内容更新');
                return;
            }

            // 隐藏加载动画
            hideLoading();

            // 更新显示内容
            try {
                // 创建一个安全的HTML解析器
                const parser = new DOMParser();
                const doc = parser.parseFromString(message.content, 'text/html');
                
                // 检查解析是否成功
                if (doc.body.firstChild === null) {
                    console.log('内容不是HTML格式，直接显示文本');
                    summaryContent.textContent = message.content;
                } else {
                    // 清理不安全的内容
                    const cleanHtml = doc.body.innerHTML
                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // 移除script标签
                        .replace(/on\w+="[^"]*"/g, '') // 移除事件处理程序
                        .replace(/javascript:/gi, ''); // 移除javascript:协议
                    
                    console.log('处理后的HTML内容:', cleanHtml);
                    
                    // 设置清理后的HTML内容
                    summaryContent.innerHTML = cleanHtml || message.content;
                }
                
                console.log('内容已更新到DOM');
                
                // 确保内容可见
                summaryContent.style.display = 'block';
                errorContainer.style.display = 'none';
            } catch (error) {
                console.error('处理HTML内容时出错:', error);
                // 如果HTML解析失败，尝试直接显示文本
                summaryContent.textContent = message.content;
            }
            
            // 更新性能统计
            if (message.stats) {
                const { totalTime } = message.stats;
                const timeStr = `总耗时 ${(totalTime/1000).toFixed(1)}s`;
                console.log('更新状态:', timeStr);
                statusSpan.textContent = timeStr;
            }

            // 更新 Powered by 显示
            const poweredBy = document.querySelector('.powered-by');
            if (poweredBy && message.model) {
                // 提取模型名称的最后一部分
                const modelName = message.model.split('/').pop();
                poweredBy.textContent = `Powered by ${modelName}`;
            }
            
            // 自动滚动到底部
            summaryContent.scrollTop = summaryContent.scrollHeight;

            // 发送响应表示消息已处理
            if (sendResponse) {
                sendResponse({ success: true });
            }
        }
        // 返回true表示异步处理消息
        return true;
    });

    // 分析当前页面内容
    async function analyzeCurrentPage(forceRefresh = false) {
        try {
            showLoading();
            const startTime = Date.now();
            statusSpan.textContent = '正在分析...';
            summaryContent.innerHTML = '';

            // 获取当前标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log(`[性能] 获取标签页耗时: ${Date.now() - startTime}ms`);
            
            // 提取页面内容
            const contentStartTime = Date.now();
            const [{result}] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const title = document.title;
                    const article = document.querySelector('article');
                    let text = '';
                    
                    if (article) {
                        text = article.textContent;
                    } else {
                        // 如果没有article标签，获取所有可见的段落文本
                        const paragraphs = Array.from(document.getElementsByTagName('p'));
                        text = paragraphs
                            .filter(p => p.offsetParent !== null) // 只获取可见段落
                            .map(p => p.textContent.trim())
                            .filter(t => t.length > 0)
                            .join('\n\n');
                    }
                    
                    return { 
                        title, 
                        text,
                        url: window.location.href
                    };
                }
            });
            console.log(`[性能] 提取内容耗时: ${Date.now() - contentStartTime}ms`);

            // 发送消息给background script进行分析
            const apiStartTime = Date.now();
            chrome.runtime.sendMessage(
                { 
                    action: 'analyzeContent', 
                    content: result,
                    forceRefresh: forceRefresh 
                },
                response => {
                    if (response.error) {
                        hideLoading();
                        showError(response.error.message || '分析失败');
                        statusSpan.textContent = '分析失败';
                        return;
                    }

                    // 更新状态
                    if (response.stats) {
                        const { totalTime } = response.stats;
                        const source = response.fromCache ? '从缓存加载' : '';
                        statusSpan.textContent = `${source} | 总耗时 ${(totalTime/1000).toFixed(1)}s`;
                    }
                    
                    statusDot.style.backgroundColor = '#32d74b';
                }
            );
            console.log(`[性能] 发送分析请求耗时: ${Date.now() - apiStartTime}ms`);
            console.log(`[性能] 总耗时: ${Date.now() - startTime}ms`);
        } catch (error) {
            console.error('内容分析错误:', error);
            hideLoading();
            showError('无法访问页面内容');
            statusSpan.textContent = '分析失败';
        }
    }

    // 添加按钮点击效果
    function addButtonEffect(button) {
        button.addEventListener('mousedown', () => {
            button.style.transform = 'scale(0.95)';
        });
        
        button.addEventListener('mouseup', () => {
            button.style.transform = 'scale(1)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
        });
    }

    // 初始化
    addButtonEffect(refreshBtn);
    addButtonEffect(copyBtn);
    addButtonEffect(retryBtn);

    // 初始化分析（使用缓存）
    analyzeCurrentPage(false);

    // 刷新按钮点击事件（强制刷新）
    refreshBtn.addEventListener('click', () => analyzeCurrentPage(true));

    // 复制按钮点击事件
    copyBtn.addEventListener('click', copyText);

    // 重试按钮点击事件（强制刷新）
    retryBtn.addEventListener('click', () => analyzeCurrentPage(true));
}); 