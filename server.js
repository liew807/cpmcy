const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 配置 ==========
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const CHANGE_ID_URL = process.env.CHANGE_ID_URL || 'https://jbcacc-6zpo.onrender.com/api/change-localid';

// 检查配置
console.log('🔧 系统配置检查...');
if (!FIREBASE_API_KEY) {
    console.error('❌ 错误：缺少 FIREBASE_API_KEY');
    console.error('💡 在Render控制台添加环境变量：FIREBASE_API_KEY=你的Firebase密钥');
    process.exit(1);
}
console.log('✅ FIREBASE_API_KEY: 已配置');
console.log('✅ CHANGE_ID_URL:', CHANGE_ID_URL);
console.log('✅ 配置检查完成\n');

// ========== 中间件 ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== 静态文件服务 ==========
app.use(express.static('public'));

// ========== Firebase接口配置 ==========
const FIREBASE_API = {
    // 1. 邮箱密码登录接口
    SIGN_IN_WITH_PASSWORD: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    
    // 2. 验证Token接口
    VERIFY_TOKEN: `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    
    // 3. 刷新Token接口
    REFRESH_TOKEN: `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`
};

// ========== 游戏API配置 ==========
const GAME_API = {
    CHANGE_ID: CHANGE_ID_URL,
    CHECK_ID: 'https://us-central1-cp-multiplayer.cloudfunctions.net/CheckLocalIDUniqueOrGenerateNew'
};

// ========== API路由 ==========

// 1. 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: '游戏ID管理系统',
        status: 'running',
        timestamp: new Date().toISOString(),
        apis: {
            firebase: '已配置',
            gameApi: CHANGE_ID_URL ? '已配置' : '未配置'
        }
    });
});

// 2. 邮箱密码登录 - 调用Firebase接口
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 参数验证
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMS',
                message: '邮箱和密码不能为空'
            });
        }
        
        // 邮箱格式验证
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_EMAIL',
                message: '邮箱格式不正确（正确格式：example@gmail.com）'
            });
        }
        
        // 密码长度验证
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_PASSWORD',
                message: '密码至少需要6个字符'
            });
        }
        
        console.log(`📧 用户登录请求: ${email}`);
        
        // 🔥 调用Firebase登录接口
        const firebaseResponse = await axios.post(
            FIREBASE_API.SIGN_IN_WITH_PASSWORD,
            {
                email: email.trim(),
                password: password,
                returnSecureToken: true
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );
        
        const userData = firebaseResponse.data;
        
        console.log(`✅ 登录成功: ${email} (UID: ${userData.localId})`);
        
        // 返回用户数据
        res.json({
            success: true,
            message: '登录成功',
            user: {
                email: userData.email,
                userId: userData.localId,
                displayName: userData.displayName || email.split('@')[0]
            },
            token: {
                idToken: userData.idToken,
                refreshToken: userData.refreshToken,
                expiresIn: userData.expiresIn
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ 登录失败:', error.response?.data?.error || error.message);
        
        let errorMessage = '登录失败';
        let errorCode = 'LOGIN_FAILED';
        
        if (error.response?.data?.error) {
            const fbError = error.response.data.error;
            
            switch (fbError.message) {
                case 'EMAIL_NOT_FOUND':
                    errorMessage = '邮箱地址未注册';
                    errorCode = 'EMAIL_NOT_FOUND';
                    break;
                case 'INVALID_PASSWORD':
                    errorMessage = '密码错误';
                    errorCode = 'INVALID_PASSWORD';
                    break;
                case 'USER_DISABLED':
                    errorMessage = '账户已被禁用';
                    errorCode = 'USER_DISABLED';
                    break;
                case 'TOO_MANY_ATTEMPTS_TRY_LATER':
                    errorMessage = '尝试次数过多，请稍后再试';
                    errorCode = 'TOO_MANY_ATTEMPTS';
                    break;
                default:
                    errorMessage = fbError.message || '认证失败';
            }
        }
        
        res.status(401).json({
            success: false,
            error: errorCode,
            message: errorMessage
        });
    }
});

// 3. 验证Token - 调用Firebase接口
app.post('/api/verify-token', async (req, res) => {
    try {
        const { idToken } = req.body;
        
        if (!idToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_TOKEN',
                message: '未提供认证令牌'
            });
        }
        
        // 🔥 调用Firebase验证Token接口
        const verifyResponse = await axios.post(
            FIREBASE_API.VERIFY_TOKEN,
            { idToken },
            { headers: { 'Content-Type': 'application/json' } }
        );
        
        const userInfo = verifyResponse.data.users[0];
        
        res.json({
            success: true,
            valid: true,
            user: {
                userId: userInfo.localId,
                email: userInfo.email,
                emailVerified: userInfo.emailVerified,
                lastLoginAt: userInfo.lastLoginAt
            }
        });
        
    } catch (error) {
        res.status(401).json({
            success: false,
            valid: false,
            error: 'INVALID_TOKEN',
            message: '令牌无效或已过期'
        });
    }
});

// 4. 修改游戏ID - 调用游戏API接口
app.post('/api/change-id', async (req, res) => {
    try {
        const { newLocalId, idToken } = req.body;
        
        if (!newLocalId || !idToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMS',
                message: '需要提供新ID和认证令牌'
            });
        }
        
        console.log(`🔄 请求修改ID为: "${newLocalId}"`);
        
        // 先验证Token
        const verifyResponse = await axios.post(
            FIREBASE_API.VERIFY_TOKEN,
            { idToken },
            { headers: { 'Content-Type': 'application/json' } }
        );
        
        const userInfo = verifyResponse.data.users[0];
        console.log(`✅ 用户验证通过: ${userInfo.email}`);
        
        // 🔥 调用游戏API修改ID
        console.log(`📡 调用游戏API: ${GAME_API.CHANGE_ID}`);
        
        const gameResponse = await axios.post(
            GAME_API.CHANGE_ID,
            { newLocalId },
            {
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Game-ID-Manager/2.0'
                },
                timeout: 15000
            }
        );
        
        const gameData = gameResponse.data;
        
        console.log(`🎉 ID修改成功! 响应:`, gameData);
        
        // 返回游戏API的响应
        res.json({
            success: true,
            message: '游戏ID修改成功',
            gameResponse: gameData,
            user: {
                email: userInfo.email,
                userId: userInfo.localId
            },
            apiInfo: {
                called: GAME_API.CHANGE_ID,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ 修改ID失败:', error.message);
        
        let errorMessage = '修改游戏ID失败';
        let errorCode = 'CHANGE_ID_FAILED';
        let statusCode = 500;
        
        if (error.response) {
            // 游戏API返回的错误
            statusCode = error.response.status;
            
            if (statusCode === 404) {
                errorMessage = '游戏API接口不存在 (404)';
                errorCode = 'API_NOT_FOUND';
            } else if (statusCode === 401) {
                errorMessage = '游戏API认证失败';
                errorCode = 'GAME_AUTH_FAILED';
            } else if (statusCode === 400) {
                errorMessage = '游戏API请求参数错误';
                errorCode = 'BAD_REQUEST';
            } else {
                errorMessage = error.response.data?.message || `游戏服务器错误 (${statusCode})`;
                errorCode = error.response.data?.error || 'GAME_SERVER_ERROR';
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = '游戏服务器响应超时';
            errorCode = 'TIMEOUT';
        } else if (error.request) {
            errorMessage = '无法连接到游戏服务器';
            errorCode = 'NETWORK_ERROR';
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorCode,
            message: errorMessage,
            details: error.response?.data || null,
            timestamp: new Date().toISOString()
        });
    }
});

// 5. 检查游戏ID状态 - 调用游戏API
app.post('/api/check-id', async (req, res) => {
    try {
        const { idToken } = req.body;
        
        if (!idToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_TOKEN',
                message: '需要认证令牌'
            });
        }
        
        console.log('🔍 检查游戏ID状态...');
        
        // 🔥 调用游戏API检查ID
        const gameResponse = await axios.post(
            GAME_API.CHECK_ID,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        res.json({
            success: true,
            gameResponse: gameResponse.data,
            apiCalled: GAME_API.CHECK_ID
        });
        
    } catch (error) {
        console.error('❌ 检查ID失败:', error.message);
        res.status(500).json({
            success: false,
            error: 'CHECK_ID_FAILED',
            message: '检查游戏ID失败'
        });
    }
});

// 6. 刷新Token - 调用Firebase接口
app.post('/api/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_TOKEN',
                message: '需要刷新令牌'
            });
        }
        
        // 🔥 调用Firebase刷新Token接口
        const refreshResponse = await axios.post(
            FIREBASE_API.REFRESH_TOKEN,
            `grant_type=refresh_token&refresh_token=${refreshToken}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        res.json({
            success: true,
            token: refreshResponse.data
        });
        
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'REFRESH_FAILED',
            message: '刷新令牌失败'
        });
    }
});

// 7. 处理404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `找不到端点: ${req.method} ${req.url}`,
        availableEndpoints: [
            'GET    /api/health',
            'POST   /api/login',
            'POST   /api/verify-token',
            'POST   /api/change-id',
            'POST   /api/check-id',
            'POST   /api/refresh-token'
        ]
    });
});

// ========== 启动服务器 ==========
app.listen(PORT, () => {
    console.log(`
    🚀 游戏ID管理系统已启动!
    📍 端口: ${PORT}
    🌐 访问: http://localhost:${PORT}
    
    📋 可用API端点:
       🔐 POST   /api/login        - 邮箱密码登录（调用Firebase）
       🔍 POST   /api/verify-token - 验证Token（调用Firebase）
       ✏️ POST   /api/change-id    - 修改游戏ID（调用游戏API）
       📊 POST   /api/check-id     - 检查游戏ID状态
       🔄 POST   /api/refresh-token - 刷新令牌
       ❤️ GET    /api/health       - 健康检查
    
    🔧 配置状态:
       Firebase API: ${FIREBASE_API_KEY ? '✅ 已配置' : '❌ 未配置'}
       游戏API: ${CHANGE_ID_URL ? '✅ 已配置' : '❌ 未配置'}
       
    ⏰ 启动时间: ${new Date().toLocaleString('zh-CN')}
    `);
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('🛑 收到关闭信号，正在停止服务器...');
    process.exit(0);
});
