/**
 * 七相支付 SDK (Node.js版本)
 * 支持支付宝和微信支付
 */

const crypto = require('crypto');
const axios = require('axios');

class QixiangPay {
    constructor(merchantId, merchantKey) {
        this.merchantId = merchantId;
        this.merchantKey = merchantKey;

        // API 接口地址
        this.API_MAPI_URL = 'https://api.payqixiang.cn/mapi.php';
        this.API_SUBMIT_URL = 'https://api.payqixiang.cn/submit.php';
        this.API_QUERY_URL = 'https://api.payqixiang.cn/api.php';
    }

    /**
     * 生成签名
     * @param {Object} params 参数对象
     * @returns {string} MD5签名
     */
    generateSign(params) {
        // 移除 sign 和 sign_type 参数
        const signParams = { ...params };
        delete signParams.sign;
        delete signParams.sign_type;

        // 按照 ASCII 码从小到大排序
        const sortedKeys = Object.keys(signParams).sort();

        // 拼接参数
        let signStr = '';
        sortedKeys.forEach(key => {
            const value = signParams[key];
            if (value !== '' && value !== null && value !== undefined) {
                signStr += `${key}=${value}&`;
            }
        });

        // 去除最后一个 & 并添加商户密钥
        signStr = signStr.slice(0, -1) + this.merchantKey;

        // 生成 MD5 签名（小写）
        return crypto.createHash('md5').update(signStr).digest('hex');
    }

    /**
     * 验证签名
     * @param {Object} params 参数对象
     * @param {string} sign 待验证的签名
     * @returns {boolean}
     */
    verifySign(params, sign) {
        const calculatedSign = this.generateSign(params);
        return calculatedSign === sign;
    }

    /**
     * 统一下单接口（mapi.php）
     * @param {Object} orderData 订单数据
     * @returns {Promise<Object>} 返回结果
     */
    async createOrder(orderData) {
        const params = {
            pid: this.merchantId,
            type: orderData.type, // alipay 或 wxpay
            out_trade_no: orderData.out_trade_no, // 商户订单号
            notify_url: orderData.notify_url,
            return_url: orderData.return_url,
            name: orderData.name, // 商品名称
            money: orderData.money, // 金额
            device: orderData.device || 'jump', // 推荐使用 jump
        };

        // 可选参数
        if (orderData.clientip) {
            params.clientip = orderData.clientip;
        }
        if (orderData.param) {
            params.param = orderData.param;
        }

        // 生成签名
        params.sign = this.generateSign(params);
        params.sign_type = 'MD5';

        try {
            const response = await axios.post(this.API_MAPI_URL,
                new URLSearchParams(params).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('七相支付下单失败:', error.message);
            throw new Error('支付接口调用失败');
        }
    }

    /**
     * 页面跳转支付（submit.php）
     * @param {Object} orderData 订单数据
     * @returns {string} 返回支付页面URL
     */
    submitPay(orderData) {
        const params = {
            pid: this.merchantId,
            type: orderData.type,
            out_trade_no: orderData.out_trade_no,
            notify_url: orderData.notify_url,
            return_url: orderData.return_url,
            name: orderData.name,
            money: orderData.money,
            device: orderData.device || 'jump',
        };

        // 可选参数
        if (orderData.clientip) {
            params.clientip = orderData.clientip;
        }
        if (orderData.param) {
            params.param = orderData.param;
        }

        // 生成签名
        params.sign = this.generateSign(params);
        params.sign_type = 'MD5';

        // 构建 GET 请求 URL
        const queryString = new URLSearchParams(params).toString();
        return `${this.API_SUBMIT_URL}?${queryString}`;
    }

    /**
     * 订单查询
     * @param {string} outTradeNo 商户订单号
     * @returns {Promise<Object>}
     */
    async queryOrder(outTradeNo) {
        const params = {
            act: 'order',
            pid: this.merchantId,
            key: this.merchantKey,
            out_trade_no: outTradeNo,
        };

        try {
            const response = await axios.post(this.API_QUERY_URL,
                new URLSearchParams(params).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('订单查询失败:', error.message);
            throw new Error('订单查询失败');
        }
    }

    /**
     * 批量订单查询
     * @param {number} page 页码
     * @param {number} limit 每页数量
     * @returns {Promise<Object>}
     */
    async queryOrderList(page = 1, limit = 10) {
        const params = {
            act: 'orders',
            pid: this.merchantId,
            key: this.merchantKey,
            page: page,
            limit: limit,
        };

        try {
            const response = await axios.post(this.API_QUERY_URL,
                new URLSearchParams(params).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('订单列表查询失败:', error.message);
            throw new Error('订单列表查询失败');
        }
    }

    /**
     * 查询商户信息
     * @returns {Promise<Object>}
     */
    async queryMerchantInfo() {
        const params = {
            act: 'user',
            pid: this.merchantId,
            key: this.merchantKey,
        };

        try {
            const response = await axios.post(this.API_QUERY_URL,
                new URLSearchParams(params).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('商户信息查询失败:', error.message);
            throw new Error('商户信息查询失败');
        }
    }

    /**
     * 生成唯一订单号
     * @returns {string}
     */
    static generateOrderNo() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const random = Math.floor(Math.random() * 900000) + 100000;

        return `${year}${month}${day}${hours}${minutes}${seconds}${random}`;
    }

    /**
     * 获取客户端IP
     * @param {Object} req Express request对象
     * @returns {string}
     */
    static getClientIp(req) {
        return req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               req.connection.remoteAddress ||
               req.socket.remoteAddress ||
               '';
    }
}

module.exports = QixiangPay;
