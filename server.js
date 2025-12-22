const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// 环境变量检查
if (!process.env.FIREBASE_API_KEY || !process.env.CPM_BASE_URL) {
    console.error('❌ 缺少必要环境变量: FIREBASE_API_KEY 或 CPM_BASE_URL');
    process.exit(1);
}

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const CPM_BASE_URL = process.env.CPM_BASE_URL;

// ==================== 系统配置 ====================
const ADMIN_KEY = 'Liew1201'; // 管理员密钥

// 内存数据库
let keysDatabase = [];
let usersDatabase = [];
let logsDatabase = [];

// 请求日志中间件
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${req.ip}`);
    next();
});

// 生成密钥
function generateRandomKey(type = 'hour', days = null) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    
    for (let i = 0; i < 10; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const prefix = type === 'hour' ? 'CPM-HOUR' : 'CPM-FULL';
    const key = `${prefix}-${randomPart}`;
    
    return {
        key: key,
        type: type,
        days: type === 'hour' ? '1小时' : `${days || 30}天`,
        status: 'unused',
        created: new Date().toLocaleString('zh-CN'),
        note: '',
        bindTime: null,
        boundUser: null
    };
}

// 初始化测试数据
function initializeTestData() {
    if (keysDatabase.length === 0) {
        keysDatabase.push(generateRandomKey('hour'));
        keysDatabase.push(generateRandomKey('full', 30));
        console.log('✅ 初始化测试密钥完成');
    }
}

// 添加日志
function addLog(user, action, content) {
    const log = {
        time: new Date().toLocaleString('zh-CN'),
        user: user,
        action: action,
        content: content,
        ip: '127.0.0.1'
    };
    logsDatabase.push(log);
    
    if (logsDatabase.length > 1000) {
        logsDatabase = logsDatabase.slice(-1000);
    }
    
    console.log(`📝 ${log.time} | ${user} | ${action} | ${content}`);
}

// 初始化
initializeTestData();

// ==================== 验证API ====================
app.post('/api/verify', (req, res) => {
    const { accessKey, username, email, password } = req.body;
    
    console.log(`🔐 验证请求: 用户=${username}, 密钥=${accessKey}`);
    
    if (!accessKey || !username) {
        return res.json({ 
            success: false, 
            message: '请填写完整的验证信息' 
        });
    }
    
    // 管理员验证
    if (accessKey === ADMIN_KEY && username === 'admin') {
        addLog('admin', '管理员登录', `管理员登录系统`);
        
        return res.json({
            success: true,
            message: '管理员验证成功',
            userType: 'admin',
            cardType: 'admin',
            username: username,
            email: 'admin@cpmcy.com',
            verified: true
        });
    }
    
    // 查找密钥
    const keyData = keysDatabase.find(k => k.key === accessKey);
    
    if (!keyData) {
        addLog(username, '验证失败', `密钥不存在: ${accessKey}`);
        return res.json({ 
            success: false, 
            message: '密钥不存在' 
        });
    }
    
    // 检查密钥状态
    if (keyData.status === 'used') {
        // 密钥已绑定，检查是否是绑定用户
        if (keyData.boundUser === username) {
            // 已有用户登录
            const user = usersDatabase.find(u => u.username === username);
            
            addLog(username, '用户登录', `使用${keyData.type === 'hour' ? '小时卡' : '全功能卡'}登录`);
            
            return res.json({
                success: true,
                message: '用户登录成功',
                userType: 'user',
                cardType: keyData.type,
                username: username,
                email: user?.email || '',
                verified: true
            });
        } else {
            addLog(username, '验证失败', `密钥已绑定其他用户: ${keyData.boundUser}`);
            return res.json({ 
                success: false, 
                message: '此密钥已绑定其他账号' 
            });
        }
    } else {
        // 新密钥，需要注册
        if (!email || !password) {
            return res.json({
                success: true,
                message: '需要注册信息',
                requireRegister: true,
                key: accessKey,
                username: username
            });
        }
        
        // 检查用户名是否已存在
        if (usersDatabase.find(u => u.username === username)) {
            return res.json({ 
                success: false, 
                message: '用户名已存在' 
            });
        }
        
        // 检查邮箱是否已存在
        if (usersDatabase.find(u => u.email === email)) {
            return res.json({ 
                success: false, 
                message: '邮箱已注册' 
            });
        }
        
        // 绑定密钥并创建用户
        keyData.status = 'used';
        keyData.bindTime = new Date().toISOString();
        keyData.boundUser = username;
        
        const newUser = {
            username: username,
            email: email,
            password: password,
            key: accessKey,
            cardType: keyData.type,
            created: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            status: 'active'
        };
        
        usersDatabase.push(newUser);
        
        addLog(username, '用户注册', `注册并绑定${keyData.type === 'hour' ? '小时卡' : '全功能卡'}`);
        
        console.log(`✅ 新用户注册: ${username} 绑定 ${keyData.type === 'hour' ? '小时卡' : '全功能卡'} ${accessKey}`);
        
        return res.json({
            success: true,
            message: '用户注册成功',
            userType: 'user',
            cardType: keyData.type,
            username: username,
            email: email,
            verified: true
        });
    }
});

// ==================== 密钥管理API ====================
app.post('/api/keys/generate', (req, res) => {
    const { keyType, days, note } = req.body;
    
    if (!keyType || (keyType !== 'hour' && keyType !== 'full')) {
        return res.json({ success: false, message: '无效的密钥类型' });
    }
    
    if (keyType === 'full' && (!days || days < 1 || days > 365)) {
        return res.json({ success: false, message: '全功能卡需要有效天数(1-365)' });
    }
    
    const newKey = generateRandomKey(keyType, days);
    if (note) newKey.note = note;
    keysDatabase.push(newKey);
    
    addLog('admin', '生成密钥', `生成${keyType === 'hour' ? '小时卡' : '全功能卡'} ${newKey.key}`);
    
    res.json({
        success: true,
        message: '密钥生成成功',
        key: newKey.key,
        type: newKey.type,
        days: newKey.days,
        note: newKey.note
    });
});

app.get('/api/keys', (req, res) => {
    res.json({ success: true, keys: keysDatabase });
});

app.get('/api/users', (req, res) => {
    res.json({ success: true, users: usersDatabase });
});

app.get('/api/logs', (req, res) => {
    res.json({ success: true, logs: logsDatabase });
});

// ==================== 通用请求函数 ====================
async function sendCPMRequest(url, payload, headers, params = {}) {
    try {
        const fullUrl = url + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
        
        const response = await axios({
            method: 'post',
            url: fullUrl,
            data: payload,
            headers: headers,
            timeout: 60000,
            validateStatus: function (status) {
                return status >= 200 && status < 600;
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Request error:', error.message);
        return null;
    }
}

function removeColorCodes(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\[[0-9A-F]{6}\]/g, '');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== CPM API ====================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('🔐 CPM登录尝试:', { email: email });
    
    if (!email || !password) {
        return res.json({
            ok: false,
            error: 400,
            message: "Missing email or password"
        });
    }

    const url = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
    const payload = {
        email: email,
        password: password,
        returnSecureToken: true,
        clientType: "CLIENT_TYPE_ANDROID"
    };
    
    const headers = {
        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 12; SM-A025F Build/SP1A.210812.016)",
        "Content-Type": "application/json",
        "Accept": "application/json"
    };
    
    const params = { key: FIREBASE_API_KEY };
    
    try {
        const response = await sendCPMRequest(url, payload, headers, params);
        
        if (response && response.idToken) {
            addLog(email, 'CPM登录成功', `CPM账号登录成功`);
            
            res.json({
                ok: true,
                error: 0,
                message: "SUCCESSFUL",
                auth: response.idToken,
                refreshToken: response.refreshToken,
                expiresIn: response.expiresIn,
                localId: response.localId,
                email: email
            });
        } else {
            const error = response?.error?.message || "UNKNOWN_ERROR";
            addLog(email, 'CPM登录失败', `登录失败: ${error}`);
            
            res.json({
                ok: false,
                error: 401,
                message: error,
                auth: null
            });
        }
    } catch (error) {
        console.error('Login server error:', error);
        res.json({
            ok: false,
            error: 500,
            message: "Server error: " + error.message
        });
    }
});

app.post('/api/get-account-data', async (req, res) => {
    const { authToken } = req.body;
    
    if (!authToken) {
        return res.json({ ok: false, error: 401, message: "Missing auth token" });
    }
    
    const url = `${CPM_BASE_URL}/GetPlayerRecords2`;
    const payload = { data: null };
    const headers = {
        "User-Agent": "okhttp/3.12.13",
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
    };
    
    try {
        const response = await sendCPMRequest(url, payload, headers);
        
        if (response?.result) {
            let data;
            try { data = JSON.parse(response.result); } catch (e) { data = response.result; }
            
            res.json({ ok: true, error: 0, message: "SUCCESSFUL", data: data });
        } else {
            res.json({ ok: false, error: 404, message: "UNKNOWN_ERROR", data: [] });
        }
    } catch (error) {
        console.error('Get account data error:', error);
        res.json({ ok: false, error: 500, message: "Server error" });
    }
});

app.post('/api/get-all-cars', async (req, res) => {
    const { authToken } = req.body;
    
    if (!authToken) return res.json({ ok: false, error: 401, message: "Missing auth token" });
    
    const url = `${CPM_BASE_URL}/TestGetAllCars`;
    const payload = { data: null };
    const headers = {
        "User-Agent": "okhttp/3.12.13",
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
    };
    
    try {
        const response = await sendCPMRequest(url, payload, headers);
        if (response?.result) {
            let data;
            try { data = JSON.parse(response.result); } catch (e) { data = response.result; }
            
            res.json({ ok: true, error: 0, message: "SUCCESSFUL", data: data });
        } else {
            res.json({ ok: false, error: 404, message: "UNKNOWN_ERROR", data: [] });
        }
    } catch (error) {
        console.error('Get cars error:', error);
        res.json({ ok: false, error: 500, message: "Server error" });
    }
});

// ==================== 其他端点 ====================
app.get('/api/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'cpmcy API is working',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'cpmcy Clone Service',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '3.0.0'
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal Server Error', 
        message: err.message
    });
});

app.listen(PORT, () => {
    console.log(`
    🚀 Server running on port ${PORT}
    🌐 Access at: http://localhost:${PORT}
    🏥 Health check: http://localhost:${PORT}/health
    🔑 Firebase API Key: ${FIREBASE_API_KEY ? 'Set ✓' : 'Not set ✗'}
    🌐 CPM Base URL: ${CPM_BASE_URL}
    🔐 Admin Key: ${ADMIN_KEY}
    ⚡ Environment: ${process.env.NODE_ENV || 'development'}
    ✨ Version: 3.0.0 - 修复验证系统
    `);
});
