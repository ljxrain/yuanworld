/**
 * 三级分销系统路由
 * 包含邀请码、佣金计算、提现等功能
 */

const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

/**
 * 生成唯一邀请码
 */
function generateInvitationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

/**
 * 生成提现单号
 */
function generateWithdrawalNo() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `WD${timestamp}${random}`;
}

/**
 * 获取用户的邀请码（如果没有则创建）
 * GET /api/distribution/my-code
 */
router.get('/my-code', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 查询用户是否已有邀请码
        const [users] = await sequelize.query(`
            SELECT invitation_code FROM users WHERE id = :userId
        `, {
            replacements: { userId }
        });

        let invitationCode = users[0]?.invitation_code;

        // 如果没有邀请码，生成一个
        if (!invitationCode) {
            invitationCode = generateInvitationCode();

            // 更新用户表
            await sequelize.query(`
                UPDATE users
                SET invitation_code = :code
                WHERE id = :userId
            `, {
                replacements: {
                    code: invitationCode,
                    userId: userId
                }
            });

            // 初始化佣金账户
            await sequelize.query(`
                INSERT INTO user_commission_accounts (user_id)
                VALUES (:userId)
                ON CONFLICT (user_id) DO NOTHING
            `, {
                replacements: { userId }
            });
        }

        res.json({
            success: true,
            data: {
                invitation_code: invitationCode,
                invitation_url: `http://49.232.220.223/yuan/register.html?code=${invitationCode}`
            }
        });

    } catch (error) {
        console.error('获取邀请码失败:', error);
        res.status(500).json({
            success: false,
            message: '获取邀请码失败'
        });
    }
});

/**
 * 绑定邀请关系（用户注册时调用）
 * POST /api/distribution/bind-inviter
 */
router.post('/bind-inviter', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { inviter_code } = req.body;

        if (!inviter_code) {
            return res.status(400).json({
                success: false,
                message: '邀请码不能为空'
            });
        }

        // 检查是否已经绑定过
        const [existing] = await sequelize.query(`
            SELECT inviter_code FROM users WHERE id = :userId
        `, {
            replacements: { userId }
        });

        if (existing[0]?.inviter_code) {
            return res.json({
                success: false,
                message: '您已经绑定过邀请人'
            });
        }

        // 查找邀请人
        const [inviters] = await sequelize.query(`
            SELECT id FROM users WHERE invitation_code = :code
        `, {
            replacements: { code: inviter_code }
        });

        if (inviters.length === 0) {
            return res.status(404).json({
                success: false,
                message: '邀请码无效'
            });
        }

        const inviterId = inviters[0].id;

        // 不能绑定自己
        if (inviterId === userId) {
            return res.status(400).json({
                success: false,
                message: '不能使用自己的邀请码'
            });
        }

        // 开始事务
        const transaction = await sequelize.transaction();

        try {
            // 更新用户的邀请码
            await sequelize.query(`
                UPDATE users
                SET inviter_code = :code
                WHERE id = :userId
            `, {
                replacements: {
                    code: inviter_code,
                    userId: userId
                },
                transaction
            });

            // 创建邀请关系记录
            await sequelize.query(`
                INSERT INTO user_invitations (user_id, inviter_id, invitation_code, level)
                VALUES (:userId, :inviterId, :userCode, 1)
            `, {
                replacements: {
                    userId: userId,
                    inviterId: inviterId,
                    userCode: generateInvitationCode()
                },
                transaction
            });

            // 更新邀请人的统计数据
            await sequelize.query(`
                UPDATE user_commission_accounts
                SET total_invited = total_invited + 1,
                    level1_invited = level1_invited + 1
                WHERE user_id = :inviterId
            `, {
                replacements: { inviterId },
                transaction
            });

            // 查找二级邀请人
            const [level2] = await sequelize.query(`
                SELECT inviter_id FROM user_invitations WHERE user_id = :inviterId
            `, {
                replacements: { inviterId },
                transaction
            });

            if (level2.length > 0 && level2[0].inviter_id) {
                const level2InviterId = level2[0].inviter_id;

                await sequelize.query(`
                    UPDATE user_commission_accounts
                    SET total_invited = total_invited + 1,
                        level2_invited = level2_invited + 1
                    WHERE user_id = :inviterId
                `, {
                    replacements: { inviterId: level2InviterId },
                    transaction
                });

                // 查找三级邀请人
                const [level3] = await sequelize.query(`
                    SELECT inviter_id FROM user_invitations WHERE user_id = :inviterId
                `, {
                    replacements: { inviterId: level2InviterId },
                    transaction
                });

                if (level3.length > 0 && level3[0].inviter_id) {
                    await sequelize.query(`
                        UPDATE user_commission_accounts
                        SET total_invited = total_invited + 1,
                            level3_invited = level3_invited + 1
                        WHERE user_id = :inviterId
                    `, {
                        replacements: { inviterId: level3[0].inviter_id },
                        transaction
                    });
                }
            }

            await transaction.commit();

            res.json({
                success: true,
                message: '绑定成功'
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('绑定邀请关系失败:', error);
        res.status(500).json({
            success: false,
            message: '绑定失败'
        });
    }
});

/**
 * 计算并分配订单佣金（支付成功后调用）
 * POST /api/distribution/calculate-commission
 */
async function calculateAndDistributeCommission(orderId, buyerId, orderAmount) {
    try {
        // 获取分销配置
        const [configs] = await sequelize.query(`
            SELECT level, commission_rate FROM distribution_config WHERE is_active = true
        `);

        const configMap = {};
        configs.forEach(c => {
            configMap[c.level] = parseFloat(c.commission_rate);
        });

        // 查找买家的邀请关系链
        const [invitationChain] = await sequelize.query(`
            WITH RECURSIVE invitation_tree AS (
                -- 起始节点：买家
                SELECT user_id, inviter_id, 1 as level
                FROM user_invitations
                WHERE user_id = :buyerId

                UNION ALL

                -- 递归查找上级
                SELECT ui.user_id, ui.inviter_id, it.level + 1
                FROM user_invitations ui
                INNER JOIN invitation_tree it ON ui.user_id = it.inviter_id
                WHERE it.level < 3
            )
            SELECT inviter_id, level FROM invitation_tree
            WHERE inviter_id IS NOT NULL
            ORDER BY level
        `, {
            replacements: { buyerId }
        });

        // 查询订单信息
        const [orders] = await sequelize.query(`
            SELECT out_trade_no FROM payment_orders WHERE id = :orderId
        `, {
            replacements: { orderId }
        });

        if (orders.length === 0) {
            console.error('订单不存在:', orderId);
            return;
        }

        const outTradeNo = orders[0].out_trade_no;

        // 为每一级分销商创建佣金记录
        for (const chain of invitationChain) {
            const level = chain.level;
            const distributorId = chain.inviter_id;
            const commissionRate = configMap[level] || 0;

            if (commissionRate <= 0) continue;

            const commissionAmount = (orderAmount * commissionRate / 100).toFixed(2);

            // 插入佣金记录
            await sequelize.query(`
                INSERT INTO distribution_commissions (
                    order_id, out_trade_no, buyer_id, distributor_id,
                    level, order_amount, commission_rate, commission_amount,
                    status, settled_at
                ) VALUES (
                    :orderId, :outTradeNo, :buyerId, :distributorId,
                    :level, :orderAmount, :commissionRate, :commissionAmount,
                    'confirmed', CURRENT_TIMESTAMP
                )
            `, {
                replacements: {
                    orderId,
                    outTradeNo,
                    buyerId,
                    distributorId,
                    level,
                    orderAmount,
                    commissionRate,
                    commissionAmount
                }
            });

            // 更新分销商的佣金账户
            await sequelize.query(`
                INSERT INTO user_commission_accounts (user_id, total_commission, available_commission)
                VALUES (:distributorId, :commission, :commission)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    total_commission = user_commission_accounts.total_commission + :commission,
                    available_commission = user_commission_accounts.available_commission + :commission
            `, {
                replacements: {
                    distributorId,
                    commission: commissionAmount
                }
            });

            console.log(`佣金分配成功: 订单${outTradeNo}, ${level}级分销商${distributorId}, 佣金${commissionAmount}元`);
        }

    } catch (error) {
        console.error('计算佣金失败:', error);
        throw error;
    }
}

/**
 * 获取我的分销数据
 * GET /api/distribution/my-stats
 */
router.get('/my-stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 获取佣金账户信息
        const [accounts] = await sequelize.query(`
            SELECT * FROM user_commission_accounts WHERE user_id = :userId
        `, {
            replacements: { userId }
        });

        let account = accounts[0];
        if (!account) {
            // 初始化账户
            await sequelize.query(`
                INSERT INTO user_commission_accounts (user_id)
                VALUES (:userId)
            `, {
                replacements: { userId }
            });

            account = {
                total_commission: 0,
                available_commission: 0,
                frozen_commission: 0,
                withdrawn_commission: 0,
                total_invited: 0,
                level1_invited: 0,
                level2_invited: 0,
                level3_invited: 0
            };
        }

        // 获取最近的佣金记录
        const [recentCommissions] = await sequelize.query(`
            SELECT
                dc.*,
                u.username as buyer_name,
                po.product_name
            FROM distribution_commissions dc
            LEFT JOIN users u ON dc.buyer_id = u.id
            LEFT JOIN payment_orders po ON dc.order_id = po.id
            WHERE dc.distributor_id = :userId
            ORDER BY dc.created_at DESC
            LIMIT 10
        `, {
            replacements: { userId }
        });

        // 获取邀请码
        const [users] = await sequelize.query(`
            SELECT invitation_code FROM users WHERE id = :userId
        `, {
            replacements: { userId }
        });

        res.json({
            success: true,
            data: {
                account: account,
                invitation_code: users[0]?.invitation_code,
                recent_commissions: recentCommissions
            }
        });

    } catch (error) {
        console.error('获取分销数据失败:', error);
        res.status(500).json({
            success: false,
            message: '获取数据失败'
        });
    }
});

/**
 * 获取我的下级成员列表
 * GET /api/distribution/my-team
 */
router.get('/my-team', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { level = 1 } = req.query;

        const [team] = await sequelize.query(`
            WITH RECURSIVE team_tree AS (
                -- 一级下线
                SELECT
                    ui.user_id,
                    ui.inviter_id,
                    u.username,
                    u.email,
                    u.created_at as register_time,
                    1 as level
                FROM user_invitations ui
                LEFT JOIN users u ON ui.user_id = u.id
                WHERE ui.inviter_id = :userId

                UNION ALL

                -- 递归查找下级
                SELECT
                    ui.user_id,
                    ui.inviter_id,
                    u.username,
                    u.email,
                    u.created_at,
                    tt.level + 1
                FROM user_invitations ui
                LEFT JOIN users u ON ui.user_id = u.id
                INNER JOIN team_tree tt ON ui.inviter_id = tt.user_id
                WHERE tt.level < 3
            )
            SELECT
                tt.*,
                COALESCE(uca.total_commission, 0) as contributed_commission
            FROM team_tree tt
            LEFT JOIN user_commission_accounts uca ON tt.user_id = uca.user_id
            WHERE tt.level <= :level
            ORDER BY tt.level, tt.register_time DESC
        `, {
            replacements: {
                userId,
                level: parseInt(level)
            }
        });

        res.json({
            success: true,
            data: team
        });

    } catch (error) {
        console.error('获取团队列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取团队列表失败'
        });
    }
});

/**
 * 申请提现
 * POST /api/distribution/withdraw
 */
router.post('/withdraw', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, withdrawal_type, withdrawal_account, account_name } = req.body;

        // 验证参数
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: '提现金额必须大于0'
            });
        }

        if (!withdrawal_type || !withdrawal_account) {
            return res.status(400).json({
                success: false,
                message: '请填写完整的提现信息'
            });
        }

        // 获取最低提现金额配置
        const [configs] = await sequelize.query(`
            SELECT min_withdrawal_amount, withdrawal_fee_rate
            FROM distribution_config
            WHERE level = 1
            LIMIT 1
        `);

        const minAmount = configs[0]?.min_withdrawal_amount || 10;
        const feeRate = configs[0]?.withdrawal_fee_rate || 0;

        if (amount < minAmount) {
            return res.status(400).json({
                success: false,
                message: `最低提现金额为${minAmount}元`
            });
        }

        // 查询可用余额
        const [accounts] = await sequelize.query(`
            SELECT available_commission FROM user_commission_accounts
            WHERE user_id = :userId
        `, {
            replacements: { userId }
        });

        const availableCommission = parseFloat(accounts[0]?.available_commission || 0);

        if (availableCommission < amount) {
            return res.status(400).json({
                success: false,
                message: '可用余额不足'
            });
        }

        // 计算手续费和实际到账金额
        const fee = (amount * feeRate / 100).toFixed(2);
        const actualAmount = (amount - fee).toFixed(2);

        const transaction = await sequelize.transaction();

        try {
            // 生成提现单号
            const withdrawalNo = generateWithdrawalNo();

            // 创建提现记录
            await sequelize.query(`
                INSERT INTO commission_withdrawals (
                    user_id, withdrawal_no, amount, fee, actual_amount,
                    withdrawal_type, withdrawal_account, account_name, status
                ) VALUES (
                    :userId, :withdrawalNo, :amount, :fee, :actualAmount,
                    :type, :account, :accountName, 'pending'
                )
            `, {
                replacements: {
                    userId,
                    withdrawalNo,
                    amount,
                    fee,
                    actualAmount,
                    type: withdrawal_type,
                    account: withdrawal_account,
                    accountName: account_name
                },
                transaction
            });

            // 冻结余额
            await sequelize.query(`
                UPDATE user_commission_accounts
                SET available_commission = available_commission - :amount,
                    frozen_commission = frozen_commission + :amount
                WHERE user_id = :userId
            `, {
                replacements: { userId, amount },
                transaction
            });

            await transaction.commit();

            res.json({
                success: true,
                message: '提现申请已提交，请等待审核',
                data: {
                    withdrawal_no: withdrawalNo,
                    amount: amount,
                    fee: fee,
                    actual_amount: actualAmount
                }
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('提现申请失败:', error);
        res.status(500).json({
            success: false,
            message: '提现申请失败'
        });
    }
});

/**
 * 获取提现记录
 * GET /api/distribution/withdrawals
 */
router.get('/withdrawals', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const [withdrawals] = await sequelize.query(`
            SELECT * FROM commission_withdrawals
            WHERE user_id = :userId
            ORDER BY created_at DESC
            LIMIT 50
        `, {
            replacements: { userId }
        });

        res.json({
            success: true,
            data: withdrawals
        });

    } catch (error) {
        console.error('获取提现记录失败:', error);
        res.status(500).json({
            success: false,
            message: '获取提现记录失败'
        });
    }
});

// 导出路由和佣金计算函数
router.calculateAndDistributeCommission = calculateAndDistributeCommission;
module.exports = router;
