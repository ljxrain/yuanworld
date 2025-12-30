# 三级分销系统技术设计文档

## 一、系统概述

### 1.1 业务场景
博世界AI图片生成服务的三级分销推广系统

### 1.2 分成比例
- **一级推荐人**：30% 佣金
- **二级推荐人**：10% 佣金
- **三级推荐人**：5% 佣金
- **平台**：保留55%

### 1.3 合规性说明
✅ 基于真实产品/服务的推广佣金（AI图片生成服务）
✅ 层级不超过3级
✅ 主要收益来自产品销售而非发展下线
✅ 符合《禁止传销条例》相关规定

---

## 二、数据库设计

### 2.1 核心表结构

#### (1) 用户邀请关系表 `user_invitations`
```sql
CREATE TABLE user_invitations (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),          -- 被邀请用户
    inviter_id UUID REFERENCES users(id),                -- 邀请人
    invitation_code VARCHAR(20) UNIQUE NOT NULL,        -- 用户的邀请码
    level INTEGER DEFAULT 1 CHECK (level BETWEEN 1 AND 3), -- 层级关系
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**关键字段说明**：
- `user_id`: 被邀请的用户ID
- `inviter_id`: 直接邀请人的ID
- `invitation_code`: 这个用户自己的邀请码（用于邀请他人）
- `level`: 与根节点的层级距离（1-3）

#### (2) 分销佣金记录表 `distribution_commissions`
```sql
CREATE TABLE distribution_commissions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES payment_orders(id),      -- 订单ID
    out_trade_no VARCHAR(64) NOT NULL,                  -- 订单号
    buyer_id UUID NOT NULL REFERENCES users(id),        -- 购买者
    distributor_id UUID NOT NULL REFERENCES users(id),  -- 分销商（获得佣金者）
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3), -- 分销层级
    order_amount DECIMAL(10, 2) NOT NULL,               -- 订单金额
    commission_rate DECIMAL(5, 2) NOT NULL,             -- 佣金比例
    commission_amount DECIMAL(10, 2) NOT NULL,          -- 佣金金额
    status VARCHAR(20) DEFAULT 'pending',               -- 状态
    settled_at TIMESTAMP,                                -- 结算时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**状态说明**：
- `pending`: 待结算（订单完成但佣金未发放）
- `confirmed`: 已确认（佣金已发放到账户）
- `cancelled`: 已取消（订单退款等情况）

#### (3) 佣金账户表 `user_commission_accounts`
```sql
CREATE TABLE user_commission_accounts (
    id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id),
    total_commission DECIMAL(10, 2) DEFAULT 0 NOT NULL,      -- 累计佣金
    available_commission DECIMAL(10, 2) DEFAULT 0 NOT NULL,  -- 可提现佣金
    frozen_commission DECIMAL(10, 2) DEFAULT 0 NOT NULL,     -- 冻结佣金（提现中）
    withdrawn_commission DECIMAL(10, 2) DEFAULT 0 NOT NULL,  -- 已提现佣金
    total_invited INTEGER DEFAULT 0 NOT NULL,                -- 总邀请人数
    level1_invited INTEGER DEFAULT 0 NOT NULL,               -- 一级邀请人数
    level2_invited INTEGER DEFAULT 0 NOT NULL,               -- 二级邀请人数
    level3_invited INTEGER DEFAULT 0 NOT NULL,               -- 三级邀请人数
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### (4) 提现记录表 `commission_withdrawals`
```sql
CREATE TABLE commission_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    withdrawal_no VARCHAR(64) UNIQUE NOT NULL,          -- 提现单号
    amount DECIMAL(10, 2) NOT NULL,                     -- 提现金额
    fee DECIMAL(10, 2) DEFAULT 0,                       -- 手续费
    actual_amount DECIMAL(10, 2) NOT NULL,              -- 实际到账金额
    withdrawal_type VARCHAR(20) DEFAULT 'alipay',       -- 提现方式
    withdrawal_account VARCHAR(200) NOT NULL,           -- 提现账号
    account_name VARCHAR(100),                          -- 账户名
    status VARCHAR(20) DEFAULT 'pending',               -- 状态
    reject_reason TEXT,                                 -- 拒绝原因
    processed_at TIMESTAMP,                             -- 处理时间
    completed_at TIMESTAMP,                             -- 完成时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**提现状态**：
- `pending`: 待审核
- `processing`: 处理中
- `completed`: 已完成
- `rejected`: 已拒绝
- `cancelled`: 已取消

#### (5) 分销配置表 `distribution_config`
```sql
CREATE TABLE distribution_config (
    id SERIAL PRIMARY KEY,
    level INTEGER UNIQUE NOT NULL CHECK (level BETWEEN 1 AND 3),
    commission_rate DECIMAL(5, 2) NOT NULL,             -- 佣金比例
    min_withdrawal_amount DECIMAL(10, 2) DEFAULT 10,    -- 最低提现金额
    withdrawal_fee_rate DECIMAL(5, 2) DEFAULT 0,        -- 提现手续费率
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 默认配置
INSERT INTO distribution_config (level, commission_rate, min_withdrawal_amount)
VALUES
    (1, 30.00, 10.00),
    (2, 10.00, 10.00),
    (3, 5.00, 10.00);
```

---

## 三、核心业务流程

### 3.1 用户注册并绑定邀请关系

```
用户访问邀请链接
→ http://49.232.220.223/yuan/register.html?code=ABC12345
→ 注册成功后调用 POST /api/distribution/bind-inviter
→ 系统自动建立邀请关系树
→ 更新上级1-3级的邀请统计数据
```

**流程图**：
```
新用户C注册（使用B的邀请码）
    ↓
系统查找B（一级推荐人）
    ↓
系统查找A（B的邀请人，二级推荐人）
    ↓
系统查找Z（A的邀请人，三级推荐人）
    ↓
建立关系链：C → B → A → Z
    ↓
更新统计：
  - B的level1_invited +1
  - A的level2_invited +1
  - Z的level3_invited +1
```

### 3.2 支付成功后佣金计算与分配

```
用户C购买VIP（29元）
    ↓
支付成功回调
    ↓
调用 calculateAndDistributeCommission(orderId, buyerId, amount)
    ↓
查询C的邀请关系链
    ↓
计算佣金：
  - B（一级）获得：29 × 30% = 8.7元
  - A（二级）获得：29 × 10% = 2.9元
  - Z（三级）获得：29 × 5% = 1.45元
    ↓
写入distribution_commissions表
    ↓
更新user_commission_accounts（增加可用佣金）
    ↓
完成
```

**代码示例**：
```javascript
// 在payment.js的支付成功回调中
const { calculateAndDistributeCommission } = require('./distribution');

// 支付成功后
if (trade_status === 'TRADE_SUCCESS') {
    await processPaymentSuccess(order);

    // 分配佣金
    await calculateAndDistributeCommission(
        order.id,
        order.user_id,
        parseFloat(order.amount)
    );
}
```

### 3.3 用户提现流程

```
用户申请提现（≥10元）
    ↓
POST /api/distribution/withdraw
    ↓
验证余额充足
    ↓
冻结提现金额（available → frozen）
    ↓
创建提现申请记录（status='pending'）
    ↓
管理员审核
    ↓
审核通过 → 打款 → status='completed'
审核拒绝 → 解冻佣金 → status='rejected'
```

---

## 四、API接口文档

### 4.1 获取我的邀请码
```
GET /api/distribution/my-code
Authorization: Bearer {token}

Response:
{
    "success": true,
    "data": {
        "invitation_code": "ABC12345",
        "invitation_url": "http://49.232.220.223/yuan/register.html?code=ABC12345"
    }
}
```

### 4.2 绑定邀请人（注册时）
```
POST /api/distribution/bind-inviter
Authorization: Bearer {token}
Content-Type: application/json

{
    "inviter_code": "ABC12345"
}

Response:
{
    "success": true,
    "message": "绑定成功"
}
```

### 4.3 获取我的分销数据
```
GET /api/distribution/my-stats
Authorization: Bearer {token}

Response:
{
    "success": true,
    "data": {
        "account": {
            "total_commission": 158.50,
            "available_commission": 120.00,
            "frozen_commission": 38.50,
            "withdrawn_commission": 0,
            "total_invited": 15,
            "level1_invited": 5,
            "level2_invited": 7,
            "level3_invited": 3
        },
        "invitation_code": "ABC12345",
        "recent_commissions": [...]
    }
}
```

### 4.4 获取我的团队成员
```
GET /api/distribution/my-team?level=3
Authorization: Bearer {token}

Response:
{
    "success": true,
    "data": [
        {
            "user_id": "xxx",
            "username": "张三",
            "level": 1,
            "register_time": "2025-12-01",
            "contributed_commission": 50.00
        },
        ...
    ]
}
```

### 4.5 申请提现
```
POST /api/distribution/withdraw
Authorization: Bearer {token}
Content-Type: application/json

{
    "amount": 100.00,
    "withdrawal_type": "alipay",
    "withdrawal_account": "13800138000",
    "account_name": "张三"
}

Response:
{
    "success": true,
    "message": "提现申请已提交",
    "data": {
        "withdrawal_no": "WD1735567200001",
        "amount": 100.00,
        "fee": 0,
        "actual_amount": 100.00
    }
}
```

### 4.6 获取提现记录
```
GET /api/distribution/withdrawals
Authorization: Bearer {token}

Response:
{
    "success": true,
    "data": [
        {
            "withdrawal_no": "WD1735567200001",
            "amount": 100.00,
            "status": "pending",
            "created_at": "2025-12-30 19:00:00"
        },
        ...
    ]
}
```

---

## 五、前端页面设计

### 5.1 分销中心页面 (distribution.html)

**页面结构**：
1. **顶部统计卡片**
   - 累计佣金
   - 可提现佣金
   - 已提现佣金
   - 总邀请人数

2. **邀请区域**
   - 我的邀请码（大字号显示）
   - 邀请链接（一键复制）
   - 生成二维码按钮
   - 分享到微信/朋友圈按钮

3. **我的团队**
   - 一级成员列表（可展开）
   - 二级成员列表（可展开）
   - 三级成员列表（可展开）
   - 显示每个成员的贡献佣金

4. **佣金明细**
   - 佣金收入记录列表
   - 显示来源订单、层级、金额、时间

5. **提现区域**
   - 提现金额输入
   - 提现方式选择（支付宝/微信/银行卡）
   - 提现账号输入
   - 提现记录列表

### 5.2 注册页面改造 (register.html)

**需要添加**：
```javascript
// 从URL获取邀请码
const urlParams = new URLSearchParams(window.location.search);
const inviterCode = urlParams.get('code');

if (inviterCode) {
    // 显示邀请人信息
    document.getElementById('inviterCodeDisplay').textContent = inviterCode;
    document.getElementById('inviterCodeHidden').value = inviterCode;
}

// 注册成功后自动绑定邀请关系
async function onRegisterSuccess(token) {
    if (inviterCode) {
        await fetch('/yuan/api/distribution/bind-inviter', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ inviter_code: inviterCode })
        });
    }
}
```

---

## 六、微信推广防封技术方案

### 6.1 域名策略
✅ **使用独立短域名**
- 主域名：yuanworld.com（正常访问）
- 短链域名：yw888.cn（分销推广专用）
- 备用域名：准备2-3个备用域名随时切换

### 6.2 链接跳转方案
✅ **多级跳转避免直接检测**
```
用户点击微信分享链接
    ↓
跳转到中间页（yw888.cn/go?c=ABC123）
    ↓
显示"正在加载..."（延迟0.5秒）
    ↓
最终跳转到目标页面（yuanworld.com/register.html?code=ABC123）
```

**中间页代码示例**：
```html
<!DOCTYPE html>
<html>
<head>
    <title>加载中...</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <div style="text-align:center; padding:100px 20px;">
        <h2>正在为您打开博世界...</h2>
        <p style="color:#999;">如果没有自动跳转，请点击下方按钮</p>
        <button onclick="goToTarget()" style="background:#90EE90; color:#111; padding:15px 30px; border:none; border-radius:25px; font-size:16px; margin-top:20px;">
            立即前往
        </button>
    </div>
    <script>
        const code = new URLSearchParams(location.search).get('c');
        const targetUrl = `http://49.232.220.223/yuan/register.html?code=${code}`;

        function goToTarget() {
            location.href = targetUrl;
        }

        // 延迟跳转避免被检测为自动跳转
        setTimeout(goToTarget, 500);
    </script>
</body>
</html>
```

### 6.3 微信浏览器检测和引导

**检测微信浏览器**：
```javascript
function isWeChatBrowser() {
    return /MicroMessenger/i.test(navigator.userAgent);
}

if (isWeChatBrowser()) {
    // 显示"点击右上角在浏览器中打开"的提示图
    showOpenInBrowserTip();
}
```

**在浏览器打开提示**：
```html
<div id="wechatTip" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.9); z-index:9999;">
    <img src="/images/open-in-browser.png" style="width:80%; max-width:300px; position:absolute; top:50px; right:20px;">
    <div style="color:white; text-align:center; margin-top:250px; font-size:18px;">
        点击右上角<br>选择"在浏览器中打开"
    </div>
</div>
```

### 6.4 内容合规策略

✅ **避免敏感词汇**：
- ❌ "分销"、"代理"、"拉人头"
- ✅ "推荐好友"、"邀请奖励"、"分享赚钱"

✅ **文案示例**：
```
【正确】邀请好友使用博世界，您可获得推荐奖励
【错误】加入我们的分销体系，发展下线赚大钱
```

### 6.5 二维码分享

**生成二维码**：
```javascript
// 使用qrcode.js生成二维码
const QRCode = require('qrcode');

async function generateInvitationQRCode(invitationCode) {
    const url = `http://yw888.cn/go?c=${invitationCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });
    return qrCodeDataUrl;
}
```

**分享海报**：
```html
<div id="sharePoster" style="width:375px; background:#fff; padding:20px;">
    <h2 style="text-align:center;">我发现了一个超酷的AI工具！</h2>
    <img id="qrcode" src="" style="width:200px; display:block; margin:20px auto;">
    <p style="text-align:center; color:#666;">
        扫码注册，我们都能获得奖励~
    </p>
</div>

<button onclick="saveSharePoster()">保存海报并分享到朋友圈</button>
```

---

## 七、部署和集成步骤

### 7.1 创建数据库表
```bash
# SSH连接到服务器
ssh yuan

# 进入项目目录
cd /opt/yuan_world

# 执行SQL脚本
sudo -u postgres psql -d yuan_world -f server/scripts/create-distribution-tables.sql
```

### 7.2 注册路由
编辑 `server/app.js`，添加：
```javascript
const distributionRouter = require('./routes/distribution');
app.use('/api/distribution', distributionRouter);
```

### 7.3 修改payment.js集成佣金分配
在支付成功回调中添加：
```javascript
const { calculateAndDistributeCommission } = require('./distribution');

// 支付成功处理函数中
await processPaymentSuccess(order);

// 添加这一行
await calculateAndDistributeCommission(order.id, order.user_id, parseFloat(order.amount));
```

### 7.4 上传文件到服务器
```bash
# 上传SQL脚本
scp server/scripts/create-distribution-tables.sql yuan:/opt/yuan_world/server/scripts/

# 上传路由文件
scp server/routes/distribution.js yuan:/opt/yuan_world/server/routes/

# 上传前端页面（需要创建）
scp public/distribution.html yuan:/opt/yuan_world/public/
```

### 7.5 重启应用
```bash
ssh yuan 'pm2 restart yuan-world-app'
```

---

## 八、测试案例

### 测试场景1：用户注册并绑定邀请关系
```
1. 用户A注册 → 获得邀请码 AAA111
2. 用户B通过A的链接注册 → 绑定关系（B→A）→ B获得邀请码 BBB222
3. 用户C通过B的链接注册 → 绑定关系（C→B→A）
4. 用户D通过C的链接注册 → 绑定关系（D→C→B→A）

验证：
- A的level1_invited = 1（B）
- A的level2_invited = 1（C）
- A的level3_invited = 1（D）
- B的level1_invited = 1（C）
- B的level2_invited = 1（D）
```

### 测试场景2：佣金计算
```
用户D购买29元VIP：
- C（一级）获得：29 × 30% = 8.7元
- B（二级）获得：29 × 10% = 2.9元
- A（三级）获得：29 × 5% = 1.45元

验证SQL：
SELECT
    distributor_id,
    level,
    commission_amount
FROM distribution_commissions
WHERE buyer_id = '{D的user_id}'
ORDER BY level;
```

### 测试场景3：提现流程
```
1. C申请提现8.7元（最低10元）→ 失败
2. D再购买29元VIP → C累计佣金17.4元
3. C申请提现15元 → 成功
4. 验证：
   - available_commission = 17.4 - 15 = 2.4
   - frozen_commission = 15
   - withdrawal表新增记录，status='pending'
```

---

## 九、安全和风控

### 9.1 防刷机制
1. **同一IP注册限制**：24小时内同一IP最多注册3个账号
2. **手机号验证**：注册必须绑定手机号
3. **实名认证**：提现前必须完成实名认证
4. **订单验证**：只有真实付费订单才能产生佣金

### 9.2 异常监控
```sql
-- 监控异常高佣金账户
SELECT
    user_id,
    total_commission,
    total_invited,
    total_commission / NULLIF(total_invited, 0) as avg_per_invite
FROM user_commission_accounts
WHERE total_commission > 1000
ORDER BY total_commission DESC;

-- 监控短时间大量邀请
SELECT
    inviter_id,
    COUNT(*) as invite_count,
    MIN(created_at) as first_invite,
    MAX(created_at) as last_invite
FROM user_invitations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY inviter_id
HAVING COUNT(*) > 10
ORDER BY invite_count DESC;
```

### 9.3 提现审核规则
1. 首次提现必须人工审核
2. 单笔提现≥100元必须人工审核
3. 24小时内多次提现必须人工审核
4. 异常账户（高佣金/零消费）必须人工审核

---

## 十、未来优化方向

### 10.1 功能优化
- [ ] 分销商等级制度（铜牌/银牌/金牌）
- [ ] 限时佣金翻倍活动
- [ ] 分销排行榜和奖励机制
- [ ] 团队长奖励（团队业绩达标额外奖励）

### 10.2 技术优化
- [ ] 佣金计算异步队列（Redis + Bull）
- [ ] 分销数据实时统计（Redis缓存）
- [ ] 提现自动打款对接（支付宝/微信企业打款API）
- [ ] 分销数据BI大屏展示

### 10.3 微信防封优化
- [ ] 接入微信云托管（cloudbase）
- [ ] 使用微信小程序（不易被封）
- [ ] CDN加速和域名负载
- [ ] 智能域名切换系统

---

## 附录：关键代码片段

### A. 递归查询邀请关系树（PostgreSQL）
```sql
WITH RECURSIVE invitation_tree AS (
    -- 起始节点
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
SELECT * FROM invitation_tree WHERE inviter_id IS NOT NULL;
```

### B. 佣金计算核心逻辑
```javascript
async function calculateAndDistributeCommission(orderId, buyerId, orderAmount) {
    // 获取配置
    const configs = await getDistributionConfig();

    // 查询邀请链
    const invitationChain = await getInvitationChain(buyerId);

    // 为每一级分销商创建佣金记录
    for (const chain of invitationChain) {
        const commissionRate = configs[chain.level];
        const commissionAmount = (orderAmount * commissionRate / 100).toFixed(2);

        // 插入佣金记录
        await createCommissionRecord({
            orderId,
            distributorId: chain.inviter_id,
            level: chain.level,
            amount: commissionAmount
        });

        // 更新账户余额
        await updateCommissionAccount(chain.inviter_id, commissionAmount);
    }
}
```

---

**文档版本**: v1.0
**创建日期**: 2025-12-30
**作者**: Claude + ljxrain
**最后更新**: 2025-12-30
