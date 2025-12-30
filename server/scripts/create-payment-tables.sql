-- 支付订单表
CREATE TABLE IF NOT EXISTS payment_orders (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    out_trade_no VARCHAR(64) UNIQUE NOT NULL,  -- 商户订单号
    trade_no VARCHAR(64),                       -- 第三方订单号
    payment_type VARCHAR(20) NOT NULL,          -- 支付方式: alipay, wxpay
    amount DECIMAL(10, 2) NOT NULL,             -- 支付金额
    product_name VARCHAR(255) NOT NULL,         -- 商品名称
    product_type VARCHAR(50),                   -- 商品类型: vip, balance, preview 等
    product_id VARCHAR(100),                    -- 商品ID或数量
    status VARCHAR(20) DEFAULT 'pending',       -- 订单状态: pending, paid, failed, refunded
    notify_status VARCHAR(20) DEFAULT 'waiting', -- 通知状态: waiting, notified, verified
    client_ip VARCHAR(50),                      -- 客户端IP
    device VARCHAR(20),                         -- 设备类型
    extra_param TEXT,                           -- 额外参数
    notify_time TIMESTAMP,                      -- 支付通知时间
    paid_at TIMESTAMP,                          -- 支付完成时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 支付回调日志表
CREATE TABLE IF NOT EXISTS payment_callbacks (
    id SERIAL PRIMARY KEY,
    out_trade_no VARCHAR(64),
    callback_type VARCHAR(20),  -- notify 或 return
    callback_data TEXT,          -- 回调原始数据
    sign_verified BOOLEAN,       -- 签名是否验证通过
    ip_address VARCHAR(50),      -- 回调IP
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_out_trade_no ON payment_orders(out_trade_no);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created_at ON payment_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_callbacks_out_trade_no ON payment_callbacks(out_trade_no);

COMMENT ON TABLE payment_orders IS '支付订单表';
COMMENT ON TABLE payment_callbacks IS '支付回调日志表';
