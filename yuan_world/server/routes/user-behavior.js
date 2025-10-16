const express = require('express');
const { sequelize } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 记录页面访问
router.post('/page-view', async (req, res) => {
    try {
        const { page_path, page_title, referrer, session_id, duration } = req.body;
        const token = req.headers.authorization?.split(' ')[1];
        let user_id = null;
        let username = null;

        // 尝试获取用户信息（如果已登录）
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const { User } = require('../models');
                const user = await User.findByPk(decoded.userId);
                if (user) {
                    user_id = user.id;
                    username = user.username;
                }
            } catch (err) {
                // Token无效或过期，继续记录为匿名访问
            }
        }

        await sequelize.query(
            `INSERT INTO page_views (user_id, username, page_path, page_title, referrer, user_agent, ip_address, session_id, duration) 
             VALUES (:user_id, :username, :page_path, :page_title, :referrer, :user_agent, :ip_address, :session_id, :duration)`,
            {
                replacements: {
                    user_id,
                    username,
                    page_path,
                    page_title,
                    referrer,
                    user_agent: req.get('user-agent') || '',
                    ip_address: req.ip || req.connection.remoteAddress,
                    session_id,
                    duration
                }
            }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('记录页面访问失败:', error);
        res.status(500).json({ message: '记录失败' });
    }
});

// 获取用户行为概览
router.get('/overview', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;
        let dateFilter = '';
        const replacements = {};

        if (dateFrom) {
            dateFilter += ' AND created_at >= :dateFrom';
            replacements.dateFrom = dateFrom;
        }
        if (dateTo) {
            dateFilter += ' AND created_at <= :dateTo';
            replacements.dateTo = dateTo;
        }

        // 总注册用户数
        const [[{ total_users }]] = await sequelize.query(
            `SELECT COUNT(*) as total_users FROM users WHERE created_at >= '1970-01-01'${dateFilter.replace('created_at', 'users.created_at')}`,
            { replacements }
        );

        // 活跃用户数（有页面访问记录的）
        const [[{ active_users }]] = await sequelize.query(
            `SELECT COUNT(DISTINCT user_id) as active_users 
             FROM page_views WHERE user_id IS NOT NULL ${dateFilter}`,
            { replacements }
        );

        // 总页面浏览量
        const [[{ total_page_views }]] = await sequelize.query(
            `SELECT COUNT(*) as total_page_views FROM page_views WHERE 1=1 ${dateFilter}`,
            { replacements }
        );

        // 总登录次数
        const [[{ total_logins }]] = await sequelize.query(
            `SELECT COUNT(*) as total_logins 
             FROM login_logs WHERE login_success = true ${dateFilter.replace('created_at', 'login_time')}`,
            { replacements }
        );

        // 总预览生成数
        const [[{ total_previews }]] = await sequelize.query(
            `SELECT COUNT(*) as total_previews 
             FROM generations WHERE generation_type = 'preview' ${dateFilter.replace('created_at', 'generations.created_at')}`,
            { replacements }
        );

        res.json({
            total_users: parseInt(total_users),
            active_users: parseInt(active_users),
            total_page_views: parseInt(total_page_views),
            total_logins: parseInt(total_logins),
            total_previews: parseInt(total_previews)
        });
    } catch (error) {
        console.error('获取概览数据失败:', error);
        res.status(500).json({ message: '获取失败' });
    }
});

// 获取用户列表（带行为统计）
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', dateFrom, dateTo } = req.query;
        const offset = (page - 1) * limit;
        let dateFilter = '';
        const replacements = { search: `%${search}%`, limit: parseInt(limit), offset: parseInt(offset) };

        if (dateFrom) {
            dateFilter += ' AND u.created_at >= :dateFrom';
            replacements.dateFrom = dateFrom;
        }
        if (dateTo) {
            dateFilter += ' AND u.created_at <= :dateTo';
            replacements.dateTo = dateTo;
        }

        const [users] = await sequelize.query(
            `SELECT 
                u.id, u.username, u.email, u.created_at,
                u.last_login_at, u.is_active, u.is_admin, u.is_vip,
                COUNT(DISTINCT pv.id) as page_views_count,
                COUNT(DISTINCT g.id) FILTER (WHERE g.generation_type = 'preview') as preview_count,
                COUNT(DISTINCT ll.id) FILTER (WHERE ll.login_success = true) as login_count
            FROM users u
            LEFT JOIN page_views pv ON u.id = pv.user_id
            LEFT JOIN generations g ON u.id = g.user_id
            LEFT JOIN login_logs ll ON u.id = ll.user_id
            WHERE (u.username ILIKE :search OR u.email ILIKE :search) ${dateFilter}
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT :limit OFFSET :offset`,
            { replacements }
        );

        const [[{ total }]] = await sequelize.query(
            `SELECT COUNT(*) as total FROM users u WHERE (u.username ILIKE :search OR u.email ILIKE :search) ${dateFilter}`,
            { replacements }
        );

        res.json({
            users,
            pagination: {
                total: parseInt(total),
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('获取用户列表失败:', error);
        res.status(500).json({ message: '获取失败' });
    }
});

// 获取单个用户的详细行为
router.get('/users/:userId/behavior', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { dateFrom, dateTo } = req.query;
        let dateFilter = '';
        const replacements = { userId };

        if (dateFrom) {
            replacements.dateFrom = dateFrom;
            dateFilter += ' AND created_at >= :dateFrom';
        }
        if (dateTo) {
            replacements.dateTo = dateTo;
            dateFilter += ' AND created_at <= :dateTo';
        }

        // 用户基本信息
        const [[userInfo]] = await sequelize.query(
            `SELECT id, username, email, created_at, last_login_at, is_active, is_vip 
             FROM users WHERE id = :userId`,
            { replacements }
        );

        if (!userInfo) {
            return res.status(404).json({ message: '用户不存在' });
        }

        // 登录记录
        const [loginLogs] = await sequelize.query(
            `SELECT login_time, logout_time, session_duration, ip_address, user_agent
             FROM login_logs 
             WHERE user_id = :userId AND login_success = true ${dateFilter.replace('created_at', 'login_time')}
             ORDER BY login_time DESC LIMIT 100`,
            { replacements }
        );

        // 页面浏览记录
        const [pageViews] = await sequelize.query(
            `SELECT page_path, page_title, created_at, duration, ip_address
             FROM page_views 
             WHERE user_id = :userId ${dateFilter}
             ORDER BY created_at DESC LIMIT 200`,
            { replacements }
        );

        // 预览生成记录
        const [previews] = await sequelize.query(
            `SELECT g.id, g.created_at, g.status, g.processing_time, g.template_id, t.name as template_name
             FROM generations g
             LEFT JOIN templates t ON g.template_id = t.id
             WHERE g.user_id = :userId AND g.generation_type = 'preview' ${dateFilter.replace('created_at', 'g.created_at')}
             ORDER BY g.created_at DESC LIMIT 100`,
            { replacements }
        );

        res.json({
            userInfo,
            loginLogs,
            pageViews,
            previews
        });
    } catch (error) {
        console.error('获取用户行为详情失败:', error);
        res.status(500).json({ message: '获取失败' });
    }
});

// 热门页面排行
router.get('/popular-pages', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { dateFrom, dateTo, limit = 20 } = req.query;
        let dateFilter = '';
        const replacements = { limit: parseInt(limit) };

        if (dateFrom) {
            dateFilter += ' AND created_at >= :dateFrom';
            replacements.dateFrom = dateFrom;
        }
        if (dateTo) {
            dateFilter += ' AND created_at <= :dateTo';
            replacements.dateTo = dateTo;
        }

        const [pages] = await sequelize.query(
            `SELECT 
                page_path, 
                page_title,
                COUNT(*) as view_count,
                COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
                AVG(duration) as avg_duration
             FROM page_views
             WHERE 1=1 ${dateFilter}
             GROUP BY page_path, page_title
             ORDER BY view_count DESC
             LIMIT :limit`,
            { replacements }
        );

        res.json({ pages });
    } catch (error) {
        console.error('获取热门页面失败:', error);
        res.status(500).json({ message: '获取失败' });
    }
});

// 热门模板排行
router.get('/popular-templates', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { dateFrom, dateTo, limit = 20 } = req.query;
        let dateFilter = '';
        const replacements = { limit: parseInt(limit) };

        if (dateFrom) {
            dateFilter += ' AND g.created_at >= :dateFrom';
            replacements.dateFrom = dateFrom;
        }
        if (dateTo) {
            dateFilter += ' AND g.created_at <= :dateTo';
            replacements.dateTo = dateTo;
        }

        const [templates] = await sequelize.query(
            `SELECT 
                t.id, t.name, t.category,
                COUNT(*) as usage_count,
                COUNT(DISTINCT g.user_id) as unique_users
             FROM generations g
             INNER JOIN templates t ON g.template_id = t.id
             WHERE g.generation_type = 'preview' ${dateFilter}
             GROUP BY t.id, t.name, t.category
             ORDER BY usage_count DESC
             LIMIT :limit`,
            { replacements }
        );

        res.json({ templates });
    } catch (error) {
        console.error('获取热门模板失败:', error);
        res.status(500).json({ message: '获取失败' });
    }
});

// 用户活跃时间分布
router.get('/active-hours', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;
        let dateFilter = '';
        const replacements = {};

        if (dateFrom) {
            dateFilter += ' AND created_at >= :dateFrom';
            replacements.dateFrom = dateFrom;
        }
        if (dateTo) {
            dateFilter += ' AND created_at <= :dateTo';
            replacements.dateTo = dateTo;
        }

        const [hourlyData] = await sequelize.query(
            `SELECT 
                EXTRACT(HOUR FROM created_at) as hour,
                COUNT(*) as count
             FROM page_views
             WHERE 1=1 ${dateFilter}
             GROUP BY hour
             ORDER BY hour`,
            { replacements }
        );

        res.json({ hourlyData });
    } catch (error) {
        console.error('获取活跃时间分布失败:', error);
        res.status(500).json({ message: '获取失败' });
    }
});

module.exports = router;

