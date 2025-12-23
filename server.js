const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 环境变量检查
if (!process.env.FIREBASE_API_KEY || !process.env.CPM_BASE_URL || !process.env.ACCESS_KEY) {
    console.error('❌ 缺少必要环境变量: FIREBASE_API_KEY 或 CPM_BASE_URL 或 ACCESS_KEY');
    process.exit(1);
}

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const CPM_BASE_URL = process.env.CPM_BASE_URL;
const ACCESS_KEY = process.env.ACCESS_KEY;

// 详细的CORS配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-access-key'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// 请求日志中间件
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// 移除颜色代码的函数
function removeColorCodes(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\[[0-9A-F]{6}\]/g, '');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 数据库字段列表（用于清理）
const DATABASE_FIELDS = [
    '_id', 'id', 'createdAt', 'updatedAt', '__v', 
    '$__', 'isNew', '_doc', 'errors', 'schema',
    '__proto__', 'constructor', 'prototype'
];

// 深度清理对象中的数据库字段
function deepCleanObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const cleaned = Array.isArray(obj) ? [] : {};
    
    for (const key in obj) {
        // 跳过数据库字段
        if (DATABASE_FIELDS.includes(key)) continue;
        
        // 递归清理嵌套对象
        if (obj[key] && typeof obj[key] === 'object') {
            cleaned[key] = deepCleanObject(obj[key]);
        } else {
            cleaned[key] = obj[key];
        }
    }
    
    return cleaned;
}

// 通用请求函数
async function sendCPMRequest(url, payload, headers, params = {}) {
    try {
        const fullUrl = url + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
        
        console.log(`🌐 发送请求到: ${url}`);
        
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
        
        console.log(`✅ 响应状态: ${response.status}`);
        return response.data;
    } catch (error) {
        console.error('❌ 请求错误:', error.message);
        return null;
    }
}

// 密钥验证API端点
app.post('/api/verify-key', (req, res) => {
    const { key } = req.body;
    
    if (!key) {
        return res.json({
            ok: false,
            message: "请输入访问密钥"
        });
    }
    
    // 验证密钥
    if (key === ACCESS_KEY) {
        res.json({
            ok: true,
            message: "密钥验证成功"
        });
    } else {
        res.json({
            ok: false,
            message: "密钥错误，请重新输入"
        });
    }
});

// 密钥验证中间件
const verifyAccessKey = (req, res, next) => {
    // 跳过某些公共端点
    const publicPaths = ['/api/verify-key', '/health', '/api/test', '/'];
    if (publicPaths.includes(req.path)) {
        return next();
    }
    
    // 从请求头获取访问密钥
    const clientKey = req.headers['x-access-key'];
    
    if (!clientKey) {
        return res.status(401).json({
            ok: false,
            error: 401,
            message: "访问被拒绝：缺少访问密钥"
        });
    }
    
    if (clientKey !== ACCESS_KEY) {
        return res.status(403).json({
            ok: false,
            error: 403,
            message: "访问被拒绝：无效的访问密钥"
        });
    }
    
    next();
};

// 应用密钥验证中间件
app.use('/api/*', verifyAccessKey);

// 1. 账号登录
app.post('/api/login', async (req, res) => {
    console.log('🔑 登录尝试:', { email: req.body.email });
    
    const { email, password } = req.body;
    
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
            console.log('✅ 登录成功:', email);
            res.json({
                ok: true,
                error: 0,
                message: "SUCCESSFUL",
                auth: response.idToken,
                refreshToken: response.refreshToken,
                expiresIn: response.expiresIn,
                localId: response.localId,
                email: email, 
                password: password
            });
        } else {
            const error = response?.error?.message || "UNKNOWN_ERROR";
            console.log('❌ 登录失败:', error);
            res.json({
                ok: false,
                error: 401,
                message: error,
                auth: null
            });
        }
    } catch (error) {
        console.error('❌ 登录服务器错误:', error);
        res.json({
            ok: false,
            error: 500,
            message: "Server error: " + error.message
        });
    }
});

// 2. 获取账号数据
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
        res.json({ ok: false, error: 500, message: "Server error" });
    }
});

// 3. 获取所有车辆
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
        res.json({ ok: false, error: 500, message: "Server error" });
    }
});

// 4. 修改当前账号ID（修复版）
app.post('/api/change-localid', async (req, res) => {
    console.log('🔄 修改Local ID请求');
    const { sourceEmail, sourcePassword, newLocalId, authToken: providedToken } = req.body;
    
    if (!newLocalId) {
        return res.json({ ok: false, result: 0, message: "Missing new local ID" });
    }
    
    let authToken = providedToken;
    let loginNeeded = !authToken;

    try {
        // 步骤 1: 验证或获取 Token
        console.log('📋 步骤 1: 验证身份...');
        
        if (authToken) {
            const checkUrl = `${CPM_BASE_URL}/GetPlayerRecords2`;
            const checkRes = await sendCPMRequest(checkUrl, { data: null }, {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            });
            if (!checkRes || !checkRes.result) {
                console.log('🔑 Token无效或过期，使用凭据重新登录');
                loginNeeded = true;
            } else {
                console.log('✅ Token有效');
            }
        }

        if (loginNeeded) {
            if (!sourceEmail || !sourcePassword) {
                return res.json({ ok: false, result: 0, message: "Token过期且未提供凭据" });
            }
            const loginUrl = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
            const loginPayload = {
                email: sourceEmail,
                password: sourcePassword,
                returnSecureToken: true,
                clientType: "CLIENT_TYPE_ANDROID"
            };
            const loginParams = { key: FIREBASE_API_KEY };
            const loginResponse = await sendCPMRequest(loginUrl, loginPayload, {
                "Content-Type": "application/json"
            }, loginParams);
            
            if (!loginResponse?.idToken) {
                return res.json({ ok: false, result: 0, message: "登录失败，检查凭据" });
            }
            authToken = loginResponse.idToken;
            console.log('✅ 重新登录成功');
        }
        
        // 步骤 2: 获取账号数据
        console.log('📋 步骤 2: 获取账号数据');
        const url1 = `${CPM_BASE_URL}/GetPlayerRecords2`;
        const headers1 = {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json"
        };
        
        const accountResponse = await sendCPMRequest(url1, { data: null }, headers1);
        if (!accountResponse?.result) {
            return res.json({ ok: false, result: 0, message: "获取账号数据失败" });
        }
        
        let accountData;
        try { 
            accountData = JSON.parse(accountResponse.result); 
        } catch (e) { 
            console.error('解析账号数据错误:', e);
            return res.json({ ok: false, result: 0, message: "无效的账号数据格式" });
        }
        
        let oldLocalId = accountData.localID || accountData.localId;
        const cleanOldLocalId = removeColorCodes(oldLocalId);
        
        if (newLocalId === cleanOldLocalId) {
            return res.json({ ok: false, result: 0, message: "新ID与旧ID相同" });
        }
        
        // 步骤 3: 获取所有车辆
        console.log('📋 步骤 3: 获取车辆数据');
        const url2 = `${CPM_BASE_URL}/TestGetAllCars`;
        const carsResponse = await sendCPMRequest(url2, { data: null }, headers1);
        let carsData = [];
        if (carsResponse?.result) {
            try { 
                carsData = JSON.parse(carsResponse.result); 
            } catch (e) { 
                console.error('解析车辆数据错误:', e);
                carsData = [];
            }
        }
        console.log(`📊 账号拥有 ${Array.isArray(carsData) ? carsData.length : '0'} 辆车`);
        
        // 步骤 4: 更新账号ID
        console.log('📋 步骤 4: 更新账号数据');
        
        // 深度清理账号数据
        const cleanAccountData = deepCleanObject({
            localID: newLocalId,
            localId: newLocalId,
            money: accountData.money || 500000000,
            Name: accountData.Name || "Player",
            allData: accountData.allData || {},
            platesData: accountData.platesData || {},
            premium: accountData.premium || false,
            exp: accountData.exp || 0,
            wins: accountData.wins || 0,
            level: accountData.level || 0,
            pfp: accountData.pfp || "",
            bio: accountData.bio || "",
            xp: accountData.xp || 0,
            playerCar: accountData.playerCar || "",
            players: accountData.players || {},
            daily: accountData.daily || {},
            tags: accountData.tags || []
        });
        
        console.log('✅ 清理后的账号数据结构:', Object.keys(cleanAccountData));
        
        const url3 = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
        const payload3 = { data: JSON.stringify(cleanAccountData) };
        
        const saveAccountResponse = await sendCPMRequest(url3, payload3, headers1);
        console.log('💾 保存账号数据响应:', saveAccountResponse);
        
        // 检查保存结果
        if (!saveAccountResponse) {
            return res.json({
                ok: false,
                result: 0,
                message: "保存账号数据失败：服务器无响应"
            });
        }
        
        const resultValue = saveAccountResponse.result;
        const isSuccess = resultValue === 1 || resultValue === "1" || 
                         resultValue === '{"result":1}' || 
                         (typeof resultValue === 'string' && resultValue.includes('"result":1'));
        
        if (!isSuccess) {
            console.error('❌ 保存账号数据失败，响应:', resultValue);
            return res.json({
                ok: false,
                result: 0,
                message: `保存账号数据失败。服务器返回: ${JSON.stringify(resultValue)}`
            });
        }
        
        console.log('✅ 账号数据保存成功');
        
        // 步骤 5: 更新车辆
        let updatedCars = 0;
        let failedCars = 0;
        
        if (Array.isArray(carsData) && carsData.length > 0) {
            console.log(`🔄 更新 ${carsData.length} 辆车...`);
            
            for (let i = 0; i < carsData.length; i++) {
                const car = carsData[i];
                
                try {
                    let carCopy = deepCleanObject(car);
                    
                    // 替换Local ID
                    if (oldLocalId && cleanOldLocalId) {
                        const carStr = JSON.stringify(carCopy);
                        let newCarStr = carStr;
                        
                        if (oldLocalId) {
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(oldLocalId), 'g'), newLocalId);
                        }
                        if (cleanOldLocalId && cleanOldLocalId !== oldLocalId) {
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(cleanOldLocalId), 'g'), newLocalId);
                        }
                        
                        try { 
                            carCopy = JSON.parse(newCarStr); 
                        } catch (parseError) {
                            console.log('⚠️ 车辆解析错误，使用原始数据');
                        }
                    }
                    
                    // 更新CarID字段
                    if (carCopy.CarID && typeof carCopy.CarID === 'string') {
                        if (oldLocalId && carCopy.CarID.includes(oldLocalId)) {
                            carCopy.CarID = carCopy.CarID.replace(new RegExp(escapeRegExp(oldLocalId), 'g'), newLocalId);
                        }
                        if (cleanOldLocalId && carCopy.CarID.includes(cleanOldLocalId)) {
                            carCopy.CarID = carCopy.CarID.replace(new RegExp(escapeRegExp(cleanOldLocalId), 'g'), newLocalId);
                        }
                    }
                    
                    const url4 = `${CPM_BASE_URL}/SaveCars`;
                    const randomNum = Math.floor(Math.random() * (888889 - 111111) + 111111);
                    const payload4 = { data: JSON.stringify(carCopy) };
                    const headers4 = {
                        "Host": "us-central1-cp-multiplayer.cloudfunctions.net",
                        "Authorization": `Bearer ${authToken}`,
                        "firebase-instance-id-token": "fdEMFcKoR2iSrZAzViyFkh:APA91bEQsP8kAGfBuPTL_ATg25AmnqpssGTkc7IAS2CgLiILjBbneFuSEzOJr2a97eDvQOPGxlphSIV7gCk2k4Wl0UxMK5x298LrJYa5tJmVRqdyz0j3KDSKLCtCbldkRFwNnjU3lwfP",
                        "Content-Type": "application/json; charset=utf-8",
                        "User-Agent": `Dalvik/2.1.0 (Linux; U; Android 8.1.0; ASUS_X00TD MIUI/16.2017.2009.087-20${randomNum})`
                    };
                    
                    const saveCarResponse = await sendCPMRequest(url4, payload4, headers4);
                    if (saveCarResponse && (saveCarResponse.success === true || saveCarResponse.result === 1 || saveCarResponse.result === "1")) {
                        updatedCars++;
                        console.log(`✅ 车辆 ${i+1}/${carsData.length} 更新成功`);
                    } else {
                        failedCars++;
                        console.log(`❌ 车辆 ${i+1}/${carsData.length} 更新失败:`, saveCarResponse);
                    }
                    
                    // 添加延迟避免请求过多
                    if (i < carsData.length - 1) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                    
                } catch (e) {
                    failedCars++;
                    console.error(`❌ 处理车辆 ${i+1} 错误:`, e.message);
                }
            }
        }
        
        res.json({
            ok: true,
            result: 1,
            message: "Local ID修改成功！",
            details: {
                oldLocalId: cleanOldLocalId,
                newLocalId: newLocalId,
                carsUpdated: updatedCars,
                carsFailed: failedCars,
                totalCars: Array.isArray(carsData) ? carsData.length : 0
            }
        });
        
    } catch (error) {
        console.error('❌ 修改Local ID过程错误:', error);
        res.json({ 
            ok: false, 
            result: 0, 
            message: `处理失败: ${error.message}` 
        });
    }
});

// 5. 克隆账号功能（完整修复版）- 解决认证失败问题
app.post('/api/clone-account', async (req, res) => {
    console.log('🚀 克隆账号请求开始');
    
    const { sourceAuth, targetEmail, targetPassword, customLocalId } = req.body;
    
    if (!sourceAuth || !targetEmail || !targetPassword) {
        return res.json({
            ok: false,
            error: 400,
            message: "缺少必要参数：源账号Token、目标账号邮箱和密码"
        });
    }
    
    try {
        console.log('📋 步骤 1: 验证源账号Token并获取数据');
        
        // 首先验证源账号Token是否有效
        const validateSource = await sendCPMRequest(`${CPM_BASE_URL}/GetPlayerRecords2`, 
            { data: null }, 
            {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${sourceAuth}`,
                "Content-Type": "application/json"
            }
        );
        
        if (!validateSource?.result) {
            console.error('❌ 源账号Token无效或已过期');
            return res.json({
                ok: false,
                error: 401,
                message: "源账号认证失败：Token无效或已过期，请重新登录源账号"
            });
        }
        
        let sourceData;
        try { 
            sourceData = JSON.parse(validateSource.result); 
            console.log('✅ 源账号数据解析成功');
        } catch (e) { 
            console.error('❌ 解析源账号数据出错:', e);
            return res.json({
                ok: false,
                error: 500,
                message: "源账号数据格式无效"
            });
        }
        
        let from_id = sourceData.localID || sourceData.localId;
        console.log(`📝 源账号LocalID (原始): ${from_id}`);
        
        const clean_from_id = removeColorCodes(from_id);
        console.log(`📝 源账号LocalID (清理后): ${clean_from_id}`);
        
        console.log('🚗 步骤 2: 获取源账号车辆数据');
        const carsResponse = await sendCPMRequest(`${CPM_BASE_URL}/TestGetAllCars`, 
            { data: null }, 
            {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${sourceAuth}`,
                "Content-Type": "application/json"
            }
        );
        
        let sourceCars = [];
        if (carsResponse?.result) {
            try { 
                sourceCars = JSON.parse(carsResponse.result); 
                console.log(`✅ 获取到 ${sourceCars.length} 辆车`);
            } catch (e) { 
                console.error('❌ 解析源车辆数据错误:', e);
                sourceCars = [];
            }
        } else {
            console.log('ℹ️ 源账号无车辆数据或获取失败');
        }
        
        console.log('🔑 步骤 3: 登录目标账号');
        const loginResponse = await sendCPMRequest(
            "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword",
            {
                email: targetEmail,
                password: targetPassword,
                returnSecureToken: true,
                clientType: "CLIENT_TYPE_ANDROID"
            },
            {
                "Content-Type": "application/json"
            }, 
            { key: FIREBASE_API_KEY }
        );
        
        if (!loginResponse?.idToken) {
            const error = loginResponse?.error?.message || "UNKNOWN_ERROR";
            console.error('❌ 目标账号登录失败:', error);
            return res.json({
                ok: false,
                error: 401,
                message: `目标账号登录失败: ${error}`
            });
        }
        
        const targetAuth = loginResponse.idToken;
        console.log('✅ 目标账号登录成功，获取到Token');
        
        console.log('🆔 步骤 4: 准备目标账号数据');
        let to_id;
        if (customLocalId && customLocalId.trim() !== '') {
            to_id = customLocalId.trim();
            console.log(`🎯 使用自定义LocalID: ${to_id}`);
        } else {
            to_id = generateRandomId().toUpperCase();
            console.log(`🎲 生成随机LocalID: ${to_id}`);
        }
        
        // 深度清理并准备目标账号数据
        console.log('🧹 深度清理账号数据...');
        const targetAccountData = deepCleanObject({
            localID: to_id,
            localId: to_id,
            money: sourceData.money || 500000000,
            Name: sourceData.Name || "TELMunn",
            allData: sourceData.allData || {},
            platesData: sourceData.platesData || {},
            premium: sourceData.premium || false,
            exp: sourceData.exp || 0,
            wins: sourceData.wins || 0,
            level: sourceData.level || 0,
            pfp: sourceData.pfp || "",
            bio: sourceData.bio || "",
            xp: sourceData.xp || 0,
            playerCar: sourceData.playerCar || "",
            players: sourceData.players || {},
            daily: sourceData.daily || {},
            tags: sourceData.tags || []
        });
        
        console.log('✅ 目标账号数据清理完成，字段数:', Object.keys(targetAccountData).length);
        
        console.log('💾 步骤 5: 保存目标账号数据');
        const saveDataResponse = await sendCPMRequest(
            `${CPM_BASE_URL}/SavePlayerRecordsIOS`,
            { data: JSON.stringify(targetAccountData) },
            {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${targetAuth}`,
                "Content-Type": "application/json"
            }
        );
        
        console.log('💾 保存账号数据响应:', saveDataResponse);
        
        if (!saveDataResponse) {
            console.error('❌ 保存账号数据失败：无响应');
            return res.json({
                ok: false,
                error: 500,
                message: "保存目标账号数据失败：服务器无响应"
            });
        }
        
        const resultValue = saveDataResponse.result;
        const isSuccess = resultValue === 1 || resultValue === "1" || 
                         resultValue === '{"result":1}' || 
                         (typeof resultValue === 'string' && resultValue.includes('"result":1'));
        
        if (!isSuccess) {
            console.error('❌ 保存账号数据失败，响应:', resultValue);
            return res.json({
                ok: false,
                error: 500,
                message: `保存目标账号数据失败。响应: ${JSON.stringify(resultValue)}`
            });
        }
        
        console.log('✅ 目标账号数据保存成功');
        
        console.log('🚗 步骤 6: 克隆车辆数据');
        let clonedCars = 0;
        let failedCars = 0;
        
        if (Array.isArray(sourceCars) && sourceCars.length > 0) {
            console.log(`🔄 开始克隆 ${sourceCars.length} 辆车...`);
            
            for (let i = 0; i < sourceCars.length; i++) {
                const car = sourceCars[i];
                
                try {
                    let carCopy = deepCleanObject(car);
                    
                    // 替换Local ID
                    if (from_id) {
                        const carStr = JSON.stringify(carCopy);
                        let newCarStr = carStr;
                        
                        if (from_id) {
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(from_id), 'g'), to_id);
                        }
                        if (clean_from_id && clean_from_id !== from_id) {
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(clean_from_id), 'g'), to_id);
                        }
                        
                        try { 
                            carCopy = JSON.parse(newCarStr); 
                        } catch (parseError) {
                            console.log('⚠️ 车辆解析错误，使用原始数据');
                        }
                    }
                    
                    // 更新CarID字段
                    if (carCopy.CarID && typeof carCopy.CarID === 'string') {
                        if (from_id && carCopy.CarID.includes(from_id)) {
                            carCopy.CarID = carCopy.CarID.replace(new RegExp(escapeRegExp(from_id), 'g'), to_id);
                        }
                        if (clean_from_id && carCopy.CarID.includes(clean_from_id)) {
                            carCopy.CarID = carCopy.CarID.replace(new RegExp(escapeRegExp(clean_from_id), 'g'), to_id);
                        }
                    }
                    
                    const saveCarResponse = await sendCPMRequest(
                        `${CPM_BASE_URL}/SaveCars`,
                        { data: JSON.stringify(carCopy) },
                        {
                            "Host": "us-central1-cp-multiplayer.cloudfunctions.net",
                            "Authorization": `Bearer ${targetAuth}`,
                            "firebase-instance-id-token": "fdEMFcKoR2iSrZAzViyFkh:APA91bEQsP8kAGfBuPTL_ATg25AmnqpssGTkc7IAS2CgLiILjBbneFuSEzOJr2a97eDvQOPGxlphSIV7gCk2k4Wl0UxMK5x298LrJYa5tJmVRqdyz0j3KDSKLCtCbldkRFwNnjU3lwfP",
                            "Content-Type": "application/json; charset=utf-8",
                            "User-Agent": `Dalvik/2.1.0 (Linux; U; Android 8.1.0; ASUS_X00TD MIUI/16.2017.2009.087-20${Math.floor(Math.random() * (888889 - 111111) + 111111)})`
                        }
                    );
                    
                    if (saveCarResponse && (saveCarResponse.success === true || saveCarResponse.result === 1 || saveCarResponse.result === "1")) {
                        clonedCars++;
                        console.log(`✅ 车辆 ${i+1}/${sourceCars.length} 克隆成功`);
                    } else {
                        failedCars++;
                        console.log(`❌ 车辆 ${i+1}/${sourceCars.length} 克隆失败:`, saveCarResponse);
                    }
                    
                    // 添加延迟
                    if (i < sourceCars.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    
                } catch (carError) {
                    console.error(`❌ 处理车辆 ${i + 1} 错误:`, carError.message);
                    failedCars++;
                }
            }
            
            console.log(`📊 克隆完成: 成功 ${clonedCars} 辆，失败 ${failedCars} 辆`);
            
            res.json({
                ok: true,
                error: 0,
                message: "账号克隆成功！",
                details: {
                    targetAccount: targetEmail,
                    carsCloned: clonedCars,
                    carsFailed: failedCars,
                    newLocalId: to_id,
                    totalCars: sourceCars.length
                }
            });
            
        } else {
            console.log('ℹ️ 无车辆需要克隆');
            res.json({
                ok: true,
                error: 0,
                message: "账号克隆成功（无车辆需要克隆）！",
                details: {
                    targetAccount: targetEmail,
                    carsCloned: 0,
                    carsFailed: 0,
                    newLocalId: to_id,
                    totalCars: 0
                }
            });
        }
        
    } catch (error) {
        console.error('❌ 克隆过程错误:', error);
        res.json({
            ok: false,
            error: 500,
            message: `克隆失败: ${error.message}`
        });
    }
});

// 6. Token验证端点
app.post('/api/validate-token', async (req, res) => {
    const { authToken } = req.body;
    
    if (!authToken) {
        return res.json({ ok: false, valid: false, message: "缺少Token" });
    }
    
    try {
        const url = `${CPM_BASE_URL}/GetPlayerRecords2`;
        const response = await sendCPMRequest(url, { data: null }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json"
        });
        
        if (response && response.result) {
            res.json({ ok: true, valid: true, message: "Token有效" });
        } else {
            res.json({ ok: false, valid: false, message: "Token无效或已过期" });
        }
    } catch (error) {
        res.json({ ok: false, valid: false, message: "验证失败：" + error.message });
    }
});

// 辅助函数
function generateRandomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 测试端点
app.get('/api/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'cpmcy API正常运行',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        firebase_key: FIREBASE_API_KEY ? 'Set' : 'Not set',
        access_key: ACCESS_KEY ? 'Set' : 'Not set'
    });
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'cpmcy克隆服务',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '2.3.0'
    });
});

// 主页
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: '未找到', path: req.path });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('❌ 服务器错误:', err);
    res.status(500).json({ 
        error: '内部服务器错误', 
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

app.listen(PORT, () => {
    console.log(`🚀 服务器运行在端口 ${PORT}`);
    console.log(`🌐 访问地址: http://localhost:${PORT}`);
    console.log(`🏥 健康检查: http://localhost:${PORT}/health`);
    console.log(`🔑 Firebase API Key: ${FIREBASE_API_KEY ? '已设置 ✓' : '未设置 ✗'}`);
    console.log(`🔐 Access Key: ${ACCESS_KEY ? '已设置 ✓' : '未设置 ✗'}`);
    console.log(`⚡ 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✨ 版本: 2.3.0 - 修复克隆认证失败问题`);
});
