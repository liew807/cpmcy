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

// 通用请求函数
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
    console.log('Login attempt:', { email: req.body.email });
    
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
            console.log('Login successful for:', email);
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
            console.log('Login failed:', error);
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
    console.log('Change local ID request received');
    const { sourceEmail, sourcePassword, newLocalId, authToken: providedToken } = req.body;
    
    if (!newLocalId) {
        return res.json({ ok: false, result: 0, message: "Missing new local ID" });
    }
    
    let authToken = providedToken;
    let loginNeeded = !authToken;

    try {
        // 步骤 1: 验证或获取 Token
        console.log('Step 1: Authenticating...');
        
        if (authToken) {
            const checkUrl = `${CPM_BASE_URL}/GetPlayerRecords2`;
            const checkRes = await sendCPMRequest(checkUrl, { data: null }, {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            });
            if (!checkRes || !checkRes.result) {
                console.log('Provided token is invalid or expired, falling back to credentials');
                loginNeeded = true;
            } else {
                console.log('Token is valid, skipping re-login');
            }
        }

        if (loginNeeded) {
            if (!sourceEmail || !sourcePassword) {
                return res.json({ ok: false, result: 0, message: "Token expired and no credentials provided" });
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
                return res.json({ ok: false, result: 0, message: "Login failed. Check credentials." });
            }
            authToken = loginResponse.idToken;
            console.log('Re-login successful');
        }
        
        // 步骤 2: 获取账号数据
        console.log('Step 2: Getting source account data');
        const url1 = `${CPM_BASE_URL}/GetPlayerRecords2`;
        const headers1 = {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json"
        };
        
        const accountResponse = await sendCPMRequest(url1, { data: null }, headers1);
        if (!accountResponse?.result) {
            return res.json({ ok: false, result: 0, message: "Failed to get account data" });
        }
        
        let accountData;
        try { 
            accountData = JSON.parse(accountResponse.result); 
        } catch (e) { 
            console.error('Parse account data error:', e);
            return res.json({ ok: false, result: 0, message: "Invalid account data format" });
        }
        
        let oldLocalId = accountData.localID || accountData.localId;
        const cleanOldLocalId = removeColorCodes(oldLocalId);
        
        if (newLocalId === cleanOldLocalId) {
            return res.json({ ok: false, result: 0, message: "New ID is same as old ID" });
        }
        
        // 步骤 3: 获取所有车辆
        console.log('Step 3: Getting all cars');
        const url2 = `${CPM_BASE_URL}/TestGetAllCars`;
        const carsResponse = await sendCPMRequest(url2, { data: null }, headers1);
        let carsData = [];
        if (carsResponse?.result) {
            try { 
                carsData = JSON.parse(carsResponse.result); 
            } catch (e) { 
                console.error('Parse cars data error:', e);
                carsData = [];
            }
        }
        console.log(`Account has ${Array.isArray(carsData) ? carsData.length : '0'} cars`);
        
        // 步骤 4: 更新账号ID - 关键修复！
        console.log('Step 4: Updating account data with new local ID');
        
        // 深度清理账号数据
        const cleanAccountData = {
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
        };
        
        // 删除所有可能的数据库字段
        const databaseFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '$__', 'isNew', '_doc', 'errors', 'schema'];
        databaseFields.forEach(field => {
            delete cleanAccountData[field];
        });
        
        console.log('Cleaned account data structure:', Object.keys(cleanAccountData));
        
        const url3 = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
        const payload3 = { data: JSON.stringify(cleanAccountData) };
        
        const saveAccountResponse = await sendCPMRequest(url3, payload3, headers1);
        console.log('Save account data response:', saveAccountResponse);
        
        // 检查保存结果
        if (!saveAccountResponse) {
            return res.json({
                ok: false,
                result: 0,
                message: "Failed to save account data: No response from server"
            });
        }
        
        // 处理不同的响应格式
        const resultValue = saveAccountResponse.result;
        if (resultValue === 1 || resultValue === "1" || 
            resultValue === '{"result":1}' || 
            (typeof resultValue === 'string' && resultValue.includes('"result":1'))) {
            console.log('Account data saved successfully');
        } else {
            console.error('Save account data failed, response:', resultValue);
            return res.json({
                ok: false,
                result: 0,
                message: `Failed to save account data. Server returned: ${JSON.stringify(resultValue)}`
            });
        }
        
        // 步骤 5: 更新车辆
        let updatedCars = 0;
        let failedCars = 0;
        
        if (Array.isArray(carsData) && carsData.length > 0) {
            console.log(`Updating ${carsData.length} cars...`);
            
            for (let i = 0; i < carsData.length; i++) {
                const car = carsData[i];
                
                try {
                    // 深度复制并清理车辆数据
                    let carCopy = JSON.parse(JSON.stringify(car));
                    
                    // 清理数据库字段
                    databaseFields.forEach(field => {
                        delete carCopy[field];
                    });
                    
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
                            console.log('Car parse after replace, using original');
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
                        console.log(`Car ${i+1}/${carsData.length} updated successfully`);
                    } else {
                        failedCars++;
                        console.log(`Car ${i+1}/${carsData.length} failed:`, saveCarResponse);
                    }
                    
                    // 添加延迟避免请求过多
                    if (i < carsData.length - 1) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                    
                } catch (e) {
                    failedCars++;
                    console.error(`Error processing car ${i+1}:`, e.message);
                }
            }
        }
        
        res.json({
            ok: true,
            result: 1,
            message: "Local ID changed successfully!",
            details: {
                oldLocalId: cleanOldLocalId,
                newLocalId: newLocalId,
                carsUpdated: updatedCars,
                carsFailed: failedCars,
                totalCars: Array.isArray(carsData) ? carsData.length : 0
            }
        });
        
    } catch (error) {
        console.error('Change local ID process error:', error);
        res.json({ 
            ok: false, 
            result: 0, 
            message: `Process failed: ${error.message}` 
        });
    }
});

// 5. 克隆账号功能（修复版）
app.post('/api/clone-account', async (req, res) => {
    console.log('Clone account request received');
    const { sourceAuth, targetEmail, targetPassword, customLocalId } = req.body;
    
    if (!sourceAuth || !targetEmail || !targetPassword) {
        return res.json({
            ok: false,
            error: 400,
            message: "Missing required parameters"
        });
    }
    
    try {
        console.log('Step 1: Getting source account data');
        const url1 = `${CPM_BASE_URL}/GetPlayerRecords2`;
        const accountResponse = await sendCPMRequest(url1, { data: null }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${sourceAuth}`,
            "Content-Type": "application/json"
        });
        
        if (!accountResponse?.result) {
            return res.json({
                ok: false,
                error: 404,
                message: "Failed to get source account data"
            });
        }
        
        let sourceData;
        try { 
            sourceData = JSON.parse(accountResponse.result); 
        } catch (e) { 
            console.error('Parse source data error:', e);
            return res.json({
                ok: false,
                error: 500,
                message: "Invalid source account data format"
            });
        }
        
        let from_id = sourceData.localID || sourceData.localId;
        console.log(`Source account localID (raw): ${from_id}`);
        
        const clean_from_id = removeColorCodes(from_id);
        console.log(`Source account localID (cleaned): ${clean_from_id}`);
        
        console.log('Step 2: Getting source cars');
        const url2 = `${CPM_BASE_URL}/TestGetAllCars`;
        const carsResponse = await sendCPMRequest(url2, { data: null }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${sourceAuth}`,
            "Content-Type": "application/json"
        });
        
        let sourceCars = [];
        if (carsResponse?.result) {
            try { 
                sourceCars = JSON.parse(carsResponse.result); 
            } catch (e) { 
                console.error('Parse source cars error:', e);
                sourceCars = [];
            }
        }
        
        console.log(`Source account has ${Array.isArray(sourceCars) ? sourceCars.length : 0} cars`);
        
        console.log('Step 3: Logging into target account');
        const url3 = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword";
        const loginResponse = await sendCPMRequest(url3, {
            email: targetEmail,
            password: targetPassword,
            returnSecureToken: true,
            clientType: "CLIENT_TYPE_ANDROID"
        }, {
            "Content-Type": "application/json"
        }, { key: FIREBASE_API_KEY });
        
        if (!loginResponse?.idToken) {
            const error = loginResponse?.error?.message || "UNKNOWN_ERROR";
            return res.json({
                ok: false,
                error: 401,
                message: `Failed to login to target account: ${error}`
            });
        }
        
        const targetAuth = loginResponse.idToken;
        const targetLocalId = loginResponse.localId;
        console.log(`Target account logged in, localId: ${targetLocalId}`);
        
        console.log('Step 4: Preparing target account data');
        let to_id;
        if (customLocalId && customLocalId.trim() !== '') {
            to_id = customLocalId.trim();
            console.log(`Using custom localID: ${to_id}`);
        } else {
            to_id = generateRandomId().toUpperCase();
            console.log(`Generated random localID: ${to_id}`);
        }
        
        // 清理目标账号数据
        const targetAccountData = {
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
        };
        
        console.log('Step 5: Saving target account data');
        const url5 = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
        const saveDataResponse = await sendCPMRequest(url5, { data: JSON.stringify(targetAccountData) }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${targetAuth}`,
            "Content-Type": "application/json"
        });
        
        console.log('Save account data response:', saveDataResponse);
        
        if (!saveDataResponse) {
            return res.json({
                ok: false,
                error: 500,
                message: "Failed to save target account data: No response"
            });
        }
        
        const resultValue = saveDataResponse.result;
        if (!(resultValue === 1 || resultValue === "1" || 
              resultValue === '{"result":1}' || 
              (typeof resultValue === 'string' && resultValue.includes('"result":1')))) {
            return res.json({
                ok: false,
                error: 500,
                message: `Failed to save target account data. Response: ${JSON.stringify(resultValue)}`
            });
        }
        
        console.log('Step 6: Cloning cars');
        let clonedCars = 0;
        let failedCars = 0;
        
        if (Array.isArray(sourceCars) && sourceCars.length > 0) {
            console.log(`Cloning ${sourceCars.length} cars...`);
            
            const databaseFields = ['_id', 'id', 'createdAt', 'updatedAt', '__v', '$__', 'isNew', '_doc', 'errors', 'schema'];
            
            for (let i = 0; i < sourceCars.length; i++) {
                const car = sourceCars[i];
                
                try {
                    let carCopy = JSON.parse(JSON.stringify(car));
                    
                    // 清理数据库字段
                    databaseFields.forEach(field => {
                        delete carCopy[field];
                    });
                    
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
                            console.log('Car parse after replace, using original');
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
                    
                    const url6 = `${CPM_BASE_URL}/SaveCars`;
                    const randomNum = Math.floor(Math.random() * (888889 - 111111) + 111111);
                    const saveCarResponse = await sendCPMRequest(url6, { data: JSON.stringify(carCopy) }, {
                        "Host": "us-central1-cp-multiplayer.cloudfunctions.net",
                        "Authorization": `Bearer ${targetAuth}`,
                        "firebase-instance-id-token": "fdEMFcKoR2iSrZAzViyFkh:APA91bEQsP8kAGfBuPTL_ATg25AmnqpssGTkc7IAS2CgLiILjBbneFuSEzOJr2a97eDvQOPGxlphSIV7gCk2k4Wl0UxMK5x298LrJYa5tJmVRqdyz0j3KDSKLCtCbldkRFwNnjU3lwfP",
                        "Content-Type": "application/json; charset=utf-8",
                        "User-Agent": `Dalvik/2.1.0 (Linux; U; Android 8.1.0; ASUS_X00TD MIUI/16.2017.2009.087-20${randomNum})`
                    });
                    
                    if (saveCarResponse && (saveCarResponse.success === true || saveCarResponse.result === 1 || saveCarResponse.result === "1")) {
                        clonedCars++;
                        console.log(`Car ${i+1}/${sourceCars.length} cloned successfully`);
                    } else {
                        failedCars++;
                        console.log(`Car ${i+1}/${sourceCars.length} failed:`, saveCarResponse);
                    }
                    
                    // 添加延迟
                    if (i < sourceCars.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                    
                } catch (carError) {
                    console.error(`Error processing car ${i + 1}:`, carError.message);
                    failedCars++;
                }
            }
            
            console.log(`Successfully cloned ${clonedCars} cars, failed: ${failedCars}`);
            
            res.json({
                ok: true,
                error: 0,
                message: "Account cloned successfully!",
                details: {
                    targetAccount: targetEmail,
                    carsCloned: clonedCars,
                    carsFailed: failedCars,
                    newLocalId: to_id,
                    totalCars: sourceCars.length
                }
            });
            
        } else {
            console.log('No cars to clone');
            res.json({
                ok: true,
                error: 0,
                message: "Account cloned successfully (no cars to clone)!",
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
        console.error('Clone process error:', error);
        res.json({
            ok: false,
            error: 500,
            message: `Clone failed: ${error.message}`
        });
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
        message: 'cpmcy API is working',
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
        service: 'cpmcy Clone Service',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '2.2.0'
    });
});

// 主页
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
});

// 错误处理
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal Server Error', 
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/health`);
    console.log(`🔑 Firebase API Key: ${FIREBASE_API_KEY ? 'Set ✓' : 'Not set ✗'}`);
    console.log(`🔐 Access Key: ${ACCESS_KEY ? 'Set ✓' : 'Not set ✗'}`);
    console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✨ Version: 2.2.0 - Enhanced security with access key verification`);
});
