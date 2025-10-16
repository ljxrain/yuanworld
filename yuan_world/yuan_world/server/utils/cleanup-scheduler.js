// 定时清理超时任务的调度器
const cron = require('node-cron');

// 每5分钟执行一次清理
const startCleanupScheduler = (sequelize) => {
    console.log('🕐 启动定时清理任务调度器...');
    
    // 每5分钟执行一次
    cron.schedule('*/5 * * * *', async () => {
        try {
            const [results, metadata] = await sequelize.query(`
                UPDATE generations 
                SET status = 'failed', 
                    error_message = '生成超时，已自动取消',
                    updated_at = NOW()
                WHERE status = 'processing' 
                AND created_at < NOW() - INTERVAL '10 minutes'
            `);
            
            const count = metadata || 0;
            if (count > 0) {
                console.log(`🧹 [定时清理] 清理了 ${count} 个超时任务`);
            }
        } catch (error) {
            console.error('❌ [定时清理] 清理失败:', error.message);
        }
    });
    
    console.log('✅ 定时清理任务已启动：每5分钟清理超过10分钟的processing任务');
};

module.exports = { startCleanupScheduler };
