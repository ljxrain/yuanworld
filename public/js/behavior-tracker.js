// 用户行为追踪系统
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

    // 记录页面访问
    function trackPageView() {
        const startTime = Date.now();
        const sessionId = getSessionId();
        const token = localStorage.getItem('token');
        
        const pageData = {
            page_path: window.location.pathname,
            page_title: document.title,
            referrer: document.referrer || '',
            session_id: sessionId,
            duration: 0
        };

        // 页面关闭或离开时发送数据
        window.addEventListener('beforeunload', () => {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            pageData.duration = duration;
            
            // 使用 sendBeacon 确保数据发送
            const blob = new Blob([JSON.stringify(pageData)], { type: 'application/json' });
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            navigator.sendBeacon('/yuan/api/user-behavior/page-view', blob);
        });

        // 每30秒发送一次心跳，更新停留时间
        setInterval(() => {
            const duration = Math.floor((Date.now() - startTime) / 1000);
            pageData.duration = duration;
            
            fetch('/yuan/api/user-behavior/page-view', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(pageData)
            }).catch(err => console.error('Tracking error:', err));
        }, 30000);
    }

    // 页面加载完成后开始追踪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', trackPageView);
    } else {
        trackPageView();
    }
})();

