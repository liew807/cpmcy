const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 环境变量验证 ==========
console.log('🔍 正在验证环境变量...');
const requiredEnvVars = [
    'FIREBASE_API_KEY',      // Firebase Web API密钥
    'CHANGE_ID_URL',         // 修改ID的游戏API地址
    'NODE_ENV'               // 运行环境
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ 缺失必需环境变量: ${envVar}`);
        console.error('💡 请在 .env 文件中设置此变量');
        process.exit(1);
    }
    console.log(`✅ ${envVar}: ${envVar === 'FIREBASE_API_KEY' ? '***' + process.env[envVar].slice(-8) : process.env[envVar]}`);
}
console.log('✅ 所有环境变量验证通过\n');

// ========== 中间件配置 ==========
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'https://你的前端域名.com'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== 请求日志中间件 ==========
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// ========== Firebase配置 ==========
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const FIREBASE_AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;

// ========== 游戏API配置 ==========
const CHANGE_ID_URL = process.env.CHANGE_ID_URL;

// ========== API路由 ==========

// 1. 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: '游戏ID管理后端',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        endpoints: {
            login: 'POST /api/login',
            changeId: 'POST /api/change-id',
            health: 'GET /health',
            verifyToken: 'POST /api/verify-token'
        },
        envStatus: {
            firebaseApiKey: FIREBASE_API_KEY ? '已配置' : '未配置',
            changeIdUrl: CHANGE_ID_URL ? '已配置' : '未配置'
        }
    });
});

// 2. 用户登录端点
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_CREDENTIALS',
                message: '邮箱和密码不能为空'
            });
        }
        
        console.log(`🔐 用户尝试登录: ${email}`);
        
        // 调用Firebase进行认证
        const firebaseResponse = await axios.post(FIREBASE_AUTH_URL, {
            email: email.trim(),
            password: password,
            returnSecureToken: true
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        const firebaseData = firebaseResponse.data;
        
        // 构造响应数据
        const userData = {
            success: true,
            message: '登录成功',
            user: {
                email: firebaseData.email,
                userId: firebaseData.localId,
                displayName: firebaseData.displayName || '未设置'
            },
            token: {
                idToken: firebaseData.idToken,
                refreshToken: firebaseData.refreshToken,
                expiresIn: firebaseData.expiresIn
            },
            timestamp: new Date().toISOString()
        };
        
        console.log(`✅ 用户登录成功: ${email} (UID: ${firebaseData.localId})`);
        
        res.json(userData);
        
    } catch (error) {
        console.error('❌ 登录失败:', error.response?.data || error.message);
        
        let errorMessage = '登录失败';
        let errorCode = 'UNKNOWN_ERROR';
        let statusCode = 500;
        
        if (error.response?.data) {
            const firebaseError = error.response.data;
            errorCode = firebaseError.error?.message || 'FIREBASE_ERROR';
            
            // 常见Firebase错误处理
            switch (errorCode) {
                case 'EMAIL_NOT_FOUND':
                case 'INVALID_PASSWORD':
                    errorMessage = '邮箱或密码错误';
                    statusCode = 401;
                    break;
                case 'USER_DISABLED':
                    errorMessage = '账户已被禁用';
                    statusCode = 403;
                    break;
                case 'TOO_MANY_ATTEMPTS_TRY_LATER':
                    errorMessage = '尝试次数过多，请稍后再试';
                    statusCode = 429;
                    break;
                default:
                    errorMessage = firebaseError.error?.message || '认证服务错误';
            }
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorCode,
            message: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
});

// 3. 验证Token端点
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
        
        const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
        
        const verifyResponse = await axios.post(verifyUrl, {
            idToken: idToken
        });
        
        const userInfo = verifyResponse.data.users[0];
        
        res.json({
            success: true,
            user: {
                userId: userInfo.localId,
                email: userInfo.email,
                emailVerified: userInfo.emailVerified,
                lastLoginAt: userInfo.lastLoginAt,
                createdAt: userInfo.createdAt
            },
            valid: true,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Token验证失败:', error.response?.data || error.message);
        
        res.status(401).json({
            success: false,
            error: 'INVALID_TOKEN',
            message: '令牌无效或已过期',
            valid: false,
            timestamp: new Date().toISOString()
        });
    }
});

// 4. 修改游戏ID端点
app.post('/api/change-id', async (req, res) => {
    try {
        const { newLocalId, idToken } = req.body;
        
        if (!newLocalId || !idToken) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_PARAMETERS',
                message: '缺少必要参数: newLocalId 或 idToken'
            });
        }
        
        console.log(`🔄 用户请求修改ID为: ${newLocalId}`);
        
        // 先验证Token
        const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
        const verifyResponse = await axios.post(verifyUrl, { idToken });
        const userInfo = verifyResponse.data.users[0];
        
        console.log(`✅ Token验证通过, 用户: ${userInfo.email}`);
        
        // 调用游戏API修改ID
        console.log(`📡 调用游戏API: ${CHANGE_ID_URL}`);
        
        const gameResponse = await axios.post(CHANGE_ID_URL, {
            newLocalId: newLocalId
        }, {
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Game-ID-Management-Server/1.0'
            },
            timeout: 10000 // 10秒超时
        });
        
        const gameData = gameResponse.data;
        
        console.log(`✅ 游戏ID修改成功! 新ID: ${gameData.newLocalId || newLocalId}`);
        
        // 返回给前端
        res.json({
            success: true,
            message: '游戏ID修改成功',
            gameResponse: gameData,
            user: {
                email: userInfo.email,
                userId: userInfo.localId
            },
            timestamp: new Date().toISOString(),
            processedBy: '游戏ID管理后端'
        });
        
    } catch (error) {
        console.error('❌ 修改ID失败:', error.response?.data || error.message);
        
        let errorMessage = '修改游戏ID失败';
        let errorCode = 'GAME_API_ERROR';
        let statusCode = 500;
        
        if (error.response) {
            // 游戏API返回的错误
            if (error.response.status === 404) {
                errorMessage = '游戏API接口不存在或路径错误';
                errorCode = 'API_NOT_FOUND';
                statusCode = 404;
            } else if (error.response.status === 401) {
                errorMessage = '游戏API认证失败';
                errorCode = 'GAME_AUTH_FAILED';
                statusCode = 401;
            } else {
                errorMessage = error.response.data?.message || '游戏服务器错误';
                errorCode = error.response.data?.error || 'GAME_SERVER_ERROR';
            }
        } else if (error.request) {
            errorMessage = '无法连接到游戏服务器';
            errorCode = 'NETWORK_ERROR';
        } else if (error.code === 'ECONNABORTED') {
            errorMessage = '游戏服务器响应超时';
            errorCode = 'TIMEOUT';
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

// 5. 获取用户信息端点
app.get('/api/user-info', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'NO_TOKEN',
                message: '未提供认证令牌'
            });
        }
        
        const idToken = authHeader.split(' ')[1];
        const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
        
        const verifyResponse = await axios.post(verifyUrl, { idToken });
        const userInfo = verifyResponse.data.users[0];
        
        res.json({
            success: true,
            user: {
                userId: userInfo.localId,
                email: userInfo.email,
                displayName: userInfo.displayName,
                emailVerified: userInfo.emailVerified,
                photoUrl: userInfo.photoUrl,
                lastRefreshAt: userInfo.lastRefreshAt,
                createdAt: userInfo.createdAt
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'INVALID_TOKEN',
            message: '令牌无效或已过期'
        });
    }
});

// ========== 错误处理中间件 ==========
app.use((err, req, res, next) => {
    console.error('🚨 服务器错误:', err);
    res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误',
        timestamp: new Date().toISOString()
    });
});

// ========== 404处理 ==========
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'ENDPOINT_NOT_FOUND',
        message: `找不到端点: ${req.method} ${req.originalUrl}`,
        availableEndpoints: {
            health: 'GET /health',
            login: 'POST /api/login',
            changeId: 'POST /api/change-id',
            verifyToken: 'POST /api/verify-token',
            userInfo: 'GET /api/user-info'
        }
    });
});

// ========== 启动服务器 ==========
app.listen(PORT, () => {
    console.log(`
    🚀 游戏ID管理后端已启动!
    📍 本地地址: http://localhost:${PORT}
    🌐 健康检查: http://localhost:${PORT}/health
    
    📋 可用API端点:
       POST /api/login        - 用户登录
       POST /api/change-id    - 修改游戏ID
       POST /api/verify-token - 验证令牌
       GET  /api/user-info    - 获取用户信息
       GET  /health           - 健康检查
    
    🔧 环境配置:
       运行环境: ${process.env.NODE_ENV}
       Firebase API: ${FIREBASE_API_KEY ? '已配置' : '未配置'}
       游戏API地址: ${CHANGE_ID_URL}
       
    ⏰ 启动时间: ${new Date().toLocaleString()}
    `);
});

// ========== 优雅关闭 ==========
process.on('SIGTERM', () => {
    console.log('🛑 收到关闭信号，正在优雅关闭服务器...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 收到中断信号，正在关闭服务器...');
    process.exit(0);
});
