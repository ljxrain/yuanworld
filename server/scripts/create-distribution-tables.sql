-- 三级分销系统数据库表
-- 创建时间: 2025-12-30

-- 1. 用户邀请关系表
CREATE TABLE IF NOT EXISTS user_invitations (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inviter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invitation_code VARCHAR(20) UNIQUE NOT NULL,
    level INTEGER DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 为user_id创建唯一索引，确保每个用户只有一个邀请记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invitations_user_id ON user_invitations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_inviter_id ON user_invitations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_code ON user_invitations(invitation_code);

COMMENT ON TABLE user_invitations IS '用户邀请关系表';
COMMENT ON COLUMN user_invitations.user_id IS '被邀请用户ID';
COMMENT ON COLUMN user_invitations.inviter_id IS '邀请人ID';
COMMENT ON COLUMN user_invitations.invitation_code IS '用户的邀请码';
COMMENT ON COLUMN user_invitations.level IS '与根节点的层级关系（1-3级）';


-- 2. 分销佣金记录表
CREATE TABLE IF NOT EXISTS distribution_commissions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES payment_orders(id) ON DELETE CASCADE,
    out_trade_no VARCHAR(64) NOT NULL,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    distributor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
    order_amount DECIMAL(10, 2) NOT NULL,
    commission_rate DECIMAL(5, 2) NOT NULL,
    commission_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    settled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_distribution_commissions_order ON distribution_commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_distribution_commissions_buyer ON distribution_commissions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_distribution_commissions_distributor ON distribution_commissions(distributor_id);
CREATE INDEX IF NOT EXISTS idx_distribution_commissions_status ON distribution_commissions(status);

COMMENT ON TABLE distribution_commissions IS '分销佣金记录表';
COMMENT ON COLUMN distribution_commissions.level IS '分销层级（1=一级，2=二级，3=三级）';
COMMENT ON COLUMN distribution_commissions.commission_rate IS '佣金比例（%）';
COMMENT ON COLUMN distribution_commissions.status IS '佣金状态：pending-待结算，confirmed-已确认，cancelled-已取消';


-- 3. 佣金提现记录表
CREATE TABLE IF NOT EXISTS commission_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    withdrawal_no VARCHAR(64) UNIQUE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    fee DECIMAL(10, 2) DEFAULT 0,
    actual_amount DECIMAL(10, 2) NOT NULL,
    withdrawal_type VARCHAR(20) DEFAULT 'alipay' CHECK (withdrawal_type IN ('alipay', 'wechat', 'bank')),
    withdrawal_account VARCHAR(200) NOT NULL,
    account_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'cancelled')),
    reject_reason TEXT,
    processed_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commission_withdrawals_user ON commission_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_withdrawals_status ON commission_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_commission_withdrawals_no ON commission_withdrawals(withdrawal_no);

COMMENT ON TABLE commission_withdrawals IS '佣金提现记录表';
COMMENT ON COLUMN commission_withdrawals.fee IS '手续费';
COMMENT ON COLUMN commission_withdrawals.actual_amount IS '实际到账金额';
COMMENT ON COLUMN commission_withdrawals.status IS '提现状态：pending-待审核，processing-处理中，completed-已完成，rejected-已拒绝，cancelled-已取消';


-- 4. 用户佣金账户表
CREATE TABLE IF NOT EXISTS user_commission_accounts (
    id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_commission DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    available_commission DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    frozen_commission DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    withdrawn_commission DECIMAL(10, 2) DEFAULT 0 NOT NULL,
    total_invited INTEGER DEFAULT 0 NOT NULL,
    level1_invited INTEGER DEFAULT 0 NOT NULL,
    level2_invited INTEGER DEFAULT 0 NOT NULL,
    level3_invited INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_commission_accounts_user ON user_commission_accounts(user_id);

COMMENT ON TABLE user_commission_accounts IS '用户佣金账户表';
COMMENT ON COLUMN user_commission_accounts.total_commission IS '累计佣金';
COMMENT ON COLUMN user_commission_accounts.available_commission IS '可提现佣金';
COMMENT ON COLUMN user_commission_accounts.frozen_commission IS '冻结佣金（提现中）';
COMMENT ON COLUMN user_commission_accounts.withdrawn_commission IS '已提现佣金';
COMMENT ON COLUMN user_commission_accounts.total_invited IS '总邀请人数';
COMMENT ON COLUMN user_commission_accounts.level1_invited IS '一级邀请人数';
COMMENT ON COLUMN user_commission_accounts.level2_invited IS '二级邀请人数';
COMMENT ON COLUMN user_commission_accounts.level3_invited IS '三级邀请人数';


-- 5. 分销配置表
CREATE TABLE IF NOT EXISTS distribution_config (
    id SERIAL PRIMARY KEY,
    level INTEGER UNIQUE NOT NULL CHECK (level BETWEEN 1 AND 3),
    commission_rate DECIMAL(5, 2) NOT NULL,
    min_withdrawal_amount DECIMAL(10, 2) DEFAULT 10,
    withdrawal_fee_rate DECIMAL(5, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE distribution_config IS '分销配置表';
COMMENT ON COLUMN distribution_config.commission_rate IS '佣金比例（%）';
COMMENT ON COLUMN distribution_config.min_withdrawal_amount IS '最低提现金额';
COMMENT ON COLUMN distribution_config.withdrawal_fee_rate IS '提现手续费率（%）';

-- 插入默认配置
INSERT INTO distribution_config (level, commission_rate, min_withdrawal_amount, withdrawal_fee_rate)
VALUES
    (1, 30.00, 10.00, 0.00),
    (2, 10.00, 10.00, 0.00),
    (3, 5.00, 10.00, 0.00)
ON CONFLICT (level) DO NOTHING;


-- 6. 添加users表的佣金相关字段（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='invitation_code') THEN
        ALTER TABLE users ADD COLUMN invitation_code VARCHAR(20) UNIQUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='inviter_code') THEN
        ALTER TABLE users ADD COLUMN inviter_code VARCHAR(20);
    END IF;
END $$;

COMMENT ON COLUMN users.invitation_code IS '用户的邀请码';
COMMENT ON COLUMN users.inviter_code IS '注册时使用的邀请码';


-- 创建触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为各表添加自动更新触发器
DROP TRIGGER IF EXISTS update_user_invitations_updated_at ON user_invitations;
CREATE TRIGGER update_user_invitations_updated_at
    BEFORE UPDATE ON user_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_distribution_commissions_updated_at ON distribution_commissions;
CREATE TRIGGER update_distribution_commissions_updated_at
    BEFORE UPDATE ON distribution_commissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_commission_withdrawals_updated_at ON commission_withdrawals;
CREATE TRIGGER update_commission_withdrawals_updated_at
    BEFORE UPDATE ON commission_withdrawals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_commission_accounts_updated_at ON user_commission_accounts;
CREATE TRIGGER update_user_commission_accounts_updated_at
    BEFORE UPDATE ON user_commission_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_distribution_config_updated_at ON distribution_config;
CREATE TRIGGER update_distribution_config_updated_at
    BEFORE UPDATE ON distribution_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
