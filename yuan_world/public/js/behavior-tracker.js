// 用户行为追踪系统 - 优化版
(function() {
    // 生成唯一的session ID
    function getSessionId() {
        let sessionId = sessionStorage.getItem('behavior_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('behavior_session_id', sessionId);
        }
        return sessionId;
    }

    let startTime = Date.now();
    let lastActiveTime = Date.now();
    let isActive = true;
    const sessionId = getSessionId();
    const token = localStorage.getItem('token');
    
    const pageData = {
        page_path: window.location.pathname,
        page_title: document.title,
        referrer: document.referrer || '',
        session_id: sessionId,
        duration: 0
    };

    // 发送页面访问数据
    function sendPageView(duration) {
        pageData.duration = duration;
        
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // 使用 fetch 发送（同步）
        fetch('/yuan/api/user-behavior/page-view', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(pageData),
            keepalive: true  // 确保在页面卸载时也能发送
        }).catch(err => console.error('Tracking error:', err));
    }

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 页面隐藏（切换标签、最小化窗口等）
            isActive = false;
            const duration = Math.floor((lastActiveTime - startTime) / 1000);
            sendPageView(duration);  // 发送当前停留时间
        } else {
            // 页面重新可见
            isActive = true;
            startTime = Date.now();  // 重新开始计时
            lastActiveTime = Date.now();
        }
    });

    // 监听用户活动（鼠标移动、键盘输入等）
    let activityTimeout;
    function resetActivityTimer() {
        lastActiveTime = Date.now();
        clearTimeout(activityTimeout);
        
        // 3分钟无活动视为离开
        activityTimeout = setTimeout(() => {
            if (isActive) {
                const duration = Math.floor((lastActiveTime - startTime) / 1000);
                sendPageView(duration);
                isActive = false;
            }
        }, 180000);  // 3分钟
    }

    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, resetActivityTimer, { passive: true });
    });

    resetActivityTimer();

    // 页面加载后立即发送一次（duration=0），确保短时间访问也能记录
    sendPageView(0);

    // 每30秒更新一次停留时间（仅在页面活跃时）
    setInterval(() => {
        if (isActive && !document.hidden) {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            sendPageView(duration);
        }
    }, 30000);

    // 页面卸载时发送最终数据
    window.addEventListener('beforeunload', () => {
        const duration = Math.floor((lastActiveTime - startTime) / 1000);
        pageData.duration = duration;
        
        // 使用 sendBeacon 确保数据发送
        const blob = new Blob([JSON.stringify(pageData)], { type: 'application/json' });
        navigator.sendBeacon('/yuan/api/user-behavior/page-view', blob);
    });
})();
