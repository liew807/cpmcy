const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 验证必要的环境变量
const REQUIRED_ENV_VARS = ['FIREBASE_API_KEY', 'CPM_BASE_URL', 'RATING_BASE_URL'];

for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
        console.error(`❌ 缺少必要的环境变量: ${envVar}`);
        console.error(`请设置环境变量 ${envVar} 在 .env 文件中`);
        process.exit(1);
    }
}

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const CPM_BASE_URL = process.env.CPM_BASE_URL;
const RATING_BASE_URL = process.env.RATING_BASE_URL;

console.log('✅ 环境变量验证通过');
console.log(`🔑 Firebase API Key: 已设置`);
console.log(`🎮 CPM Base URL: ${CPM_BASE_URL}`);
console.log(`🏆 Rating Base URL: ${RATING_BASE_URL}`);

// 详细的CORS配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
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
            
            // 尝试获取比赛场数统计
            try {
                const ratingResponse = await sendCPMRequest(`${RATING_BASE_URL}/api/rating`, { 
                    authToken: authToken 
                }, headers);
                
                if (ratingResponse?.ok && ratingResponse.data) {
                    // 合并比赛场数数据
                    data.totalWins = ratingResponse.data.totalWins || data.totalWins || 0;
                    data.totalLosses = ratingResponse.data.totalLosses || data.totalLosses || 0;
                    data.wins = ratingResponse.data.wins || data.wins || data.totalWins || 0;
                    data.losses = ratingResponse.data.losses || data.losses || data.totalLosses || 0;
                }
            } catch (ratingError) {
                console.log('Failed to get rating data:', ratingError.message);
            }
            
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

// 4. 修改当前账号ID（集成比赛场数功能）
app.post('/api/change-localid', async (req, res) => {
    console.log('Change local ID request received');
    const { authToken, newLocalId, customWins, customLosses } = req.body;
    
    if (!newLocalId) {
        return res.json({ ok: false, result: 0, message: "Missing new local ID" });
    }
    
    try {
        console.log('Step 1: Getting source account data');
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
        try { accountData = JSON.parse(accountResponse.result); } catch (e) { accountData = accountResponse.result; }
        
        let oldLocalId = accountData.localID || accountData.localId;
        const cleanOldLocalId = removeColorCodes(oldLocalId);
        
        if (newLocalId === cleanOldLocalId) {
            return res.json({ ok: false, result: 0, message: "New ID is same as old ID" });
        }
        
        // 步骤 2: 获取比赛场数数据（如果需要修改）
        let ratingData = null;
        if (customWins !== undefined || customLosses !== undefined) {
            try {
                console.log('Step 2: Getting current rating data');
                const ratingResponse = await sendCPMRequest(`${RATING_BASE_URL}/api/rating`, {
                    authToken: authToken
                }, headers1);
                
                if (ratingResponse?.ok && ratingResponse.data) {
                    ratingData = ratingResponse.data;
                    console.log('Current rating data:', {
                        wins: ratingData.wins,
                        losses: ratingData.losses,
                        totalWins: ratingData.totalWins,
                        totalLosses: ratingData.totalLosses
                    });
                }
            } catch (ratingError) {
                console.log('Failed to get rating data:', ratingError.message);
            }
        }
        
        console.log('Step 3: Getting all cars');
        const url2 = `${CPM_BASE_URL}/TestGetAllCars`;
        const carsResponse = await sendCPMRequest(url2, { data: null }, headers1);
        let carsData = [];
        if (carsResponse?.result) {
            try { carsData = JSON.parse(carsResponse.result); } catch (e) { carsData = carsResponse.result; }
        }
        console.log(`Account has ${Array.isArray(carsData) ? carsData.length : '0'} cars`);
        
        // 步骤 4: 更新账号数据
        console.log('Step 4: Updating account data with new local ID');
        accountData.localID = newLocalId;
        if (accountData.localId) accountData.localId = newLocalId;
        
        // 删除数据库字段
        delete accountData._id;
        delete accountData.id;
        delete accountData.createdAt;
        delete accountData.updatedAt;
        delete accountData.__v;
        
        const url3 = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
        const payload3 = { data: JSON.stringify(accountData) };
        
        const saveAccountResponse = await sendCPMRequest(url3, payload3, headers1);
        console.log('Save account data response:', saveAccountResponse);
        
        if (!saveAccountResponse || 
            (saveAccountResponse.result !== "1" && 
             saveAccountResponse.result !== 1 && 
             saveAccountResponse.result !== '{"result":1}')) {
            return res.json({
                ok: false,
                result: 0,
                message: `Failed to save account data (Result: ${saveAccountResponse?.result})`
            });
        }
        
        // 步骤 5: 更新比赛场数（如果指定了自定义值）
        let ratingUpdated = false;
        let newWins = null;
        let newLosses = null;
        
        if (customWins !== undefined || customLosses !== undefined) {
            try {
                console.log('Step 5: Updating rating statistics');
                const updateData = {};
                
                if (customWins !== undefined) {
                    updateData.wins = parseInt(customWins);
                    updateData.totalWins = parseInt(customWins);
                    newWins = updateData.wins;
                }
                
                if (customLosses !== undefined) {
                    updateData.losses = parseInt(customLosses);
                    updateData.totalLosses = parseInt(customLosses);
                    newLosses = updateData.losses;
                }
                
                // 使用新的local ID
                updateData.localID = newLocalId;
                
                const ratingUpdateResponse = await sendCPMRequest(`${RATING_BASE_URL}/api/rating`, {
                    authToken: authToken,
                    action: 'update',
                    data: updateData
                }, headers1);
                
                if (ratingUpdateResponse?.ok) {
                    ratingUpdated = true;
                    console.log('Rating updated successfully:', updateData);
                } else {
                    console.log('Failed to update rating:', ratingUpdateResponse?.message);
                }
            } catch (ratingUpdateError) {
                console.log('Error updating rating:', ratingUpdateError.message);
            }
        }
        
        // 步骤 6: 更新车辆
        let updatedCars = 0;
        let failedCars = 0;
        
        if (Array.isArray(carsData) && carsData.length > 0) {
            console.log(`Step 6: Updating ${carsData.length} cars...`);
            
            const batchSize = 5;
            for (let i = 0; i < carsData.length; i += batchSize) {
                const batch = carsData.slice(i, Math.min(i + batchSize, carsData.length));
                
                const batchPromises = batch.map(async (car) => {
                    try {
                        let carCopy = JSON.parse(JSON.stringify(car));
                        
                        // 替换ID逻辑
                        if (oldLocalId && cleanOldLocalId) {
                            const carStr = JSON.stringify(carCopy);
                            let newCarStr = carStr.replace(new RegExp(escapeRegExp(oldLocalId), 'g'), newLocalId);
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(cleanOldLocalId), 'g'), newLocalId);
                            try { carCopy = JSON.parse(newCarStr); } catch (e) {}
                        }
                        
                        // 清理车辆数据中的数据库字段
                        delete carCopy._id;
                        delete carCopy.createdAt;
                        delete carCopy.updatedAt;
                        delete carCopy.__v;

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
                        if (saveCarResponse && (saveCarResponse.success || saveCarResponse.result)) {
                            updatedCars++;
                            return true;
                        } else {
                            failedCars++;
                            return false;
                        }
                    } catch (e) {
                        failedCars++;
                        return false;
                    }
                });
                
                await Promise.all(batchPromises);
                if (i + batchSize < carsData.length) await new Promise(r => setTimeout(r, 500));
            }
        }
        
        const responseData = {
            ok: true,
            result: 1,
            message: "Local ID changed successfully!",
            details: {
                oldLocalId: cleanOldLocalId,
                newLocalId: newLocalId,
                carsUpdated: updatedCars,
                carsFailed: failedCars
            }
        };
        
        // 添加比赛场数更新信息
        if (ratingUpdated) {
            responseData.ratingUpdated = true;
            responseData.newWins = newWins;
            responseData.newLosses = newLosses;
            responseData.message = "Local ID and rating statistics updated successfully!";
        }
        
        res.json(responseData);
        
    } catch (error) {
        console.error('Change local ID process error:', error);
        res.json({ ok: false, result: 0, message: `Process failed: ${error.message}` });
    }
});

// 5. 克隆账号功能（集成比赛场数）
app.post('/api/clone-account', async (req, res) => {
    console.log('Clone account request received');
    const { sourceAuth, targetEmail, targetPassword, customLocalId, customWins, customLosses } = req.body;
    
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
        try { sourceData = JSON.parse(accountResponse.result); } catch (e) { sourceData = accountResponse.result; }
        
        let from_id = sourceData.localID || sourceData.localId;
        console.log(`Source account localID (raw): ${from_id}`);
        
        const clean_from_id = removeColorCodes(from_id);
        console.log(`Source account localID (cleaned): ${clean_from_id}`);
        
        // 获取源账号的比赛场数
        let sourceRatingData = null;
        try {
            console.log('Getting source rating data');
            const ratingResponse = await sendCPMRequest(`${RATING_BASE_URL}/api/rating`, {
                authToken: sourceAuth
            }, {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${sourceAuth}`,
                "Content-Type": "application/json"
            });
            
            if (ratingResponse?.ok && ratingResponse.data) {
                sourceRatingData = ratingResponse.data;
                console.log('Source rating data:', {
                    wins: sourceRatingData.wins,
                    losses: sourceRatingData.losses
                });
            }
        } catch (ratingError) {
            console.log('Failed to get source rating data:', ratingError.message);
        }
        
        console.log('Step 2: Getting source cars');
        const url2 = `${CPM_BASE_URL}/TestGetAllCars`;
        const carsResponse = await sendCPMRequest(url2, { data: null }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${sourceAuth}`,
            "Content-Type": "application/json"
        });
        
        if (!carsResponse?.result) {
            return res.json({
                ok: false,
                error: 404,
                message: "Failed to get source cars"
            });
        }
        
        let sourceCars;
        try { sourceCars = JSON.parse(carsResponse.result); } catch (e) { sourceCars = carsResponse.result; }
        
        console.log(`Source account has ${Array.isArray(sourceCars) ? sourceCars.length : 'unknown'} cars`);
        
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
        
        const targetAccountData = {
            ...sourceData,
            localID: to_id,
            Name: sourceData.Name || "TELMunn",
            money: sourceData.money || 500000000,
            allData: sourceData.allData || {},
            platesData: sourceData.platesData || {}
        };
        
        // 删除数据库字段
        delete targetAccountData._id;
        delete targetAccountData.id;
        delete targetAccountData.createdAt;
        delete targetAccountData.updatedAt;
        delete targetAccountData.__v;
        
        console.log('Step 5: Saving target account data');
        const url5 = `${CPM_BASE_URL}/SavePlayerRecordsIOS`;
        const saveDataResponse = await sendCPMRequest(url5, { data: JSON.stringify(targetAccountData) }, {
            "User-Agent": "okhttp/3.12.13",
            "Authorization": `Bearer ${targetAuth}`,
            "Content-Type": "application/json"
        });
        
        console.log('Save account data response:', saveDataResponse);
        
        if (!saveDataResponse || 
            (saveDataResponse.result !== "1" && 
             saveDataResponse.result !== 1 && 
             saveDataResponse.result !== '{"result":1}')) {
            return res.json({
                ok: false,
                error: 500,
                message: `Failed to save target account data. Response: ${JSON.stringify(saveDataResponse)}`
            });
        }
        
        // 步骤 6: 更新比赛场数到目标账号
        let ratingCloned = false;
        let targetWins = null;
        let targetLosses = null;
        
        try {
            console.log('Step 6: Cloning rating statistics');
            let ratingData = {};
            
            // 如果有自定义场数，使用自定义值
            if (customWins !== undefined) {
                ratingData.wins = parseInt(customWins);
                ratingData.totalWins = parseInt(customWins);
                targetWins = ratingData.wins;
            } else if (sourceRatingData) {
                // 否则使用源账号的数据
                ratingData.wins = sourceRatingData.wins || 0;
                ratingData.totalWins = sourceRatingData.totalWins || sourceRatingData.wins || 0;
                targetWins = ratingData.wins;
            }
            
            if (customLosses !== undefined) {
                ratingData.losses = parseInt(customLosses);
                ratingData.totalLosses = parseInt(customLosses);
                targetLosses = ratingData.losses;
            } else if (sourceRatingData) {
                ratingData.losses = sourceRatingData.losses || 0;
                ratingData.totalLosses = sourceRatingData.totalLosses || sourceRatingData.losses || 0;
                targetLosses = ratingData.losses;
            }
            
            // 添加local ID
            ratingData.localID = to_id;
            
            if (Object.keys(ratingData).length > 1) { // 不只是localID
                const ratingCloneResponse = await sendCPMRequest(`${RATING_BASE_URL}/api/rating`, {
                    authToken: targetAuth,
                    action: 'update',
                    data: ratingData
                }, {
                    "User-Agent": "okhttp/3.12.13",
                    "Authorization": `Bearer ${targetAuth}`,
                    "Content-Type": "application/json"
                });
                
                if (ratingCloneResponse?.ok) {
                    ratingCloned = true;
                    console.log('Rating cloned successfully:', ratingData);
                } else {
                    console.log('Failed to clone rating:', ratingCloneResponse?.message);
                }
            }
        } catch (ratingError) {
            console.log('Error cloning rating:', ratingError.message);
        }
        
        console.log('Step 7: Cloning cars');
        let clonedCars = 0;
        let failedCars = 0;
        
        if (Array.isArray(sourceCars) && sourceCars.length > 0) {
            console.log(`Cloning ${sourceCars.length} cars...`);
            
            const batchSize = 3;
            for (let i = 0; i < sourceCars.length; i += batchSize) {
                const batch = sourceCars.slice(i, Math.min(i + batchSize, sourceCars.length));
                
                const batchPromises = batch.map(async (car, index) => {
                    try {
                        let carCopy = JSON.parse(JSON.stringify(car));
                        
                        if (from_id && clean_from_id) {
                            const carStr = JSON.stringify(carCopy);
                            let newCarStr = carStr.replace(new RegExp(escapeRegExp(from_id), 'g'), to_id);
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(clean_from_id), 'g'), to_id);
                            try { carCopy = JSON.parse(newCarStr); } catch (parseError) {}
                        }
                        
                        // 清理车辆数据中的数据库字段
                        delete carCopy._id;
                        delete carCopy.createdAt;
                        delete carCopy.updatedAt;
                        delete carCopy.__v;
                        
                        if (carCopy.CarID && typeof carCopy.CarID === 'string') {
                            if (carCopy.CarID.includes(from_id)) {
                                carCopy.CarID = carCopy.CarID.replace(new RegExp(escapeRegExp(from_id), 'g'), to_id);
                            } else if (carCopy.CarID.includes(clean_from_id)) {
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
                        
                        if (saveCarResponse && (saveCarResponse.success || saveCarResponse.result)) {
                            clonedCars++;
                            return true;
                        } else {
                            failedCars++;
                            return false;
                        }
                    } catch (carError) {
                        console.error(`Error processing car ${i + index + 1}:`, carError.message);
                        failedCars++;
                        return false;
                    }
                });
                
                await Promise.all(batchPromises);
                if (i + batchSize < sourceCars.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            console.log(`Successfully cloned ${clonedCars} cars, failed: ${failedCars}`);
        } else {
            console.log('No cars to clone');
        }
        
        const responseData = {
            ok: true,
            error: 0,
            message: "Account cloned successfully!",
            details: {
                targetAccount: targetEmail,
                carsCloned: clonedCars,
                carsFailed: failedCars,
                newLocalId: to_id,
                totalCars: Array.isArray(sourceCars) ? sourceCars.length : 0
            }
        };
        
        // 添加比赛场数克隆信息
        if (ratingCloned) {
            responseData.ratingCloned = true;
            responseData.targetWins = targetWins;
            responseData.targetLosses = targetLosses;
            responseData.message = "Account and rating statistics cloned successfully!";
        }
        
        res.json(responseData);
        
    } catch (error) {
        console.error('Clone process error:', error);
        res.json({
            ok: false,
            error: 500,
            message: `Clone failed: ${error.message}`
        });
    }
});

// 6. 比赛场数管理API
app.post('/api/rating', async (req, res) => {
    const { authToken, action, data } = req.body;
    
    if (!authToken) {
        return res.json({ ok: false, error: 401, message: "Missing auth token" });
    }
    
    try {
        if (action === 'get') {
            // 获取比赛场数
            const url = `${RATING_BASE_URL}/api/rating`;
            const headers = {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            };
            
            const response = await sendCPMRequest(url, { 
                authToken: authToken 
            }, headers);
            
            if (response?.ok) {
                res.json({ 
                    ok: true, 
                    data: response.data 
                });
            } else {
                res.json({ 
                    ok: false, 
                    error: 404, 
                    message: "Failed to get rating data" 
                });
            }
            
        } else if (action === 'update') {
            // 更新比赛场数
            if (!data) {
                return res.json({ 
                    ok: false, 
                    error: 400, 
                    message: "Missing rating data" 
                });
            }
            
            const url = `${RATING_BASE_URL}/api/rating`;
            const headers = {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            };
            
            const updateData = {
                authToken: authToken,
                action: 'update',
                data: data
            };
            
            const response = await sendCPMRequest(url, updateData, headers);
            
            if (response?.ok) {
                res.json({ 
                    ok: true, 
                    message: "Rating updated successfully",
                    data: response.data 
                });
            } else {
                res.json({ 
                    ok: false, 
                    error: 500, 
                    message: response?.message || "Failed to update rating" 
                });
            }
            
        } else {
            res.json({ 
                ok: false, 
                error: 400, 
                message: "Invalid action" 
            });
        }
        
    } catch (error) {
        console.error('Rating API error:', error);
        res.json({ 
            ok: false, 
            error: 500, 
            message: `Rating API error: ${error.message}` 
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
        cpm_url: CPM_BASE_URL,
        rating_url: RATING_BASE_URL
    });
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'cpmcy Clone Service',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '2.3.0',
        features: ['account-cloning', 'local-id-modification', 'rating-statistics']
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
    console.log(`🎮 CPM Base URL: ${CPM_BASE_URL}`);
    console.log(`🏆 Rating Base URL: ${RATING_BASE_URL}`);
    console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✨ Version: 2.3.0 - Added rating statistics support`);
});
