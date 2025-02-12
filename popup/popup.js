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

    // 显示分析结果
    function showResult(result) {
        if (result.error) {
            showError(result.error.message);
            return;
        }

        errorContainer.style.display = 'none';
        summaryContent.style.display = 'block';
        
        // 创建一个安全的HTML解析器
        const parser = new DOMParser();
        const doc = parser.parseFromString(result.summary, 'text/html');
        
        // 清理不安全的内容
        const cleanHtml = doc.body.innerHTML
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // 移除script标签
            .replace(/on\w+="[^"]*"/g, '') // 移除事件处理程序
            .replace(/javascript:/gi, ''); // 移除javascript:协议
        
        // 设置清理后的HTML内容
        summaryContent.innerHTML = cleanHtml;
        
        // 更新状态
        statusDot.style.backgroundColor = '#32d74b';
    }

    // 分析当前页面内容
    async function analyzeCurrentPage(forceRefresh = false) {
        try {
            showLoading();
            statusSpan.textContent = '正在分析...';

            // 获取当前标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // 提取页面内容
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
                        url: window.location.href // 添加URL用于缓存
                    };
                }
            });

            // 发送消息给background script进行分析
            chrome.runtime.sendMessage(
                { 
                    action: 'analyzeContent', 
                    content: result,
                    forceRefresh: forceRefresh 
                },
                response => {
                    hideLoading();
                    showResult(response);
                    statusSpan.textContent = response.fromCache ? '已加载缓存' : '分析完成';
                    statusDot.style.backgroundColor = '#32d74b';
                }
            );
        } catch (error) {
            hideLoading();
            showError('无法访问页面内容');
            statusSpan.textContent = '分析失败';
            console.error('Content script error:', error);
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