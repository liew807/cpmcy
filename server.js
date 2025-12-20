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

// 2. 获取账号数据（包括比赛场数）
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
            
            // 尝试从不同地方获取比赛场数
            // 方式1: 从账号数据本身获取
            let wins = 0;
            let losses = 0;
            
            // 检查账号数据中是否有比赛场数
            if (data.totalWins !== undefined) wins = data.totalWins;
            else if (data.wins !== undefined) wins = data.wins;
            else if (data.victories !== undefined) wins = data.victories;
            
            if (data.totalLosses !== undefined) losses = data.totalLosses;
            else if (data.losses !== undefined) losses = data.losses;
            else if (data.defeats !== undefined) losses = data.defeats;
            
            // 方式2: 尝试从专门的比赛API获取
            try {
                console.log('尝试获取比赛场数数据...');
                
                // 获取本地ID
                const localID = data.localID || data.localId;
                if (localID) {
                    console.log('从比赛API获取场数，localID:', localID);
                    
                    // 使用专门的比赛场数API
                    const ratingResponse = await axios.post(RATING_BASE_URL, {
                        action: 'get_stats',
                        local_id: localID,
                        auth_token: authToken
                    }, {
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${authToken}`
                        },
                        timeout: 10000
                    });
                    
                    if (ratingResponse.data && ratingResponse.data.ok) {
                        console.log('从比赛API获取到数据:', ratingResponse.data);
                        wins = ratingResponse.data.wins || wins;
                        losses = ratingResponse.data.losses || losses;
                    }
                }
            } catch (ratingError) {
                console.log('比赛API获取失败，使用账号数据:', ratingError.message);
            }
            
            // 添加到返回数据中
            data.totalWins = wins;
            data.totalLosses = losses;
            data.wins = wins;
            data.losses = losses;
            
            res.json({ 
                ok: true, 
                error: 0, 
                message: "SUCCESSFUL", 
                data: data,
                stats: {
                    wins: wins,
                    losses: losses
                }
            });
        } else {
            res.json({ ok: false, error: 404, message: "UNKNOWN_ERROR", data: [] });
        }
    } catch (error) {
        console.error('获取账号数据错误:', error);
        res.json({ ok: false, error: 500, message: "Server error: " + error.message });
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

// 4. 获取比赛场数API
app.post('/api/rating', async (req, res) => {
    const { authToken, action, data, local_id } = req.body;
    
    if (!authToken) {
        return res.json({ ok: false, error: 401, message: "Missing auth token" });
    }
    
    try {
        if (action === 'get' || action === 'get_stats') {
            // 获取比赛场数
            try {
                console.log('调用外部比赛API获取场数...');
                
                const ratingResponse = await axios.post(RATING_BASE_URL, {
                    action: 'get_stats',
                    local_id: local_id,
                    auth_token: authToken
                }, {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${authToken}`
                    },
                    timeout: 10000
                });
                
                if (ratingResponse.data && ratingResponse.data.ok) {
                    console.log('比赛API返回:', ratingResponse.data);
                    res.json({ 
                        ok: true, 
                        data: ratingResponse.data 
                    });
                } else {
                    // 如果外部API失败，从账号数据中获取
                    console.log('外部API失败，从账号数据获取...');
                    
                    const accountResponse = await sendCPMRequest(`${CPM_BASE_URL}/GetPlayerRecords2`, 
                        { data: null }, 
                        {
                            "User-Agent": "okhttp/3.12.13",
                            "Authorization": `Bearer ${authToken}`,
                            "Content-Type": "application/json"
                        }
                    );
                    
                    if (accountResponse?.result) {
                        let accountData;
                        try { accountData = JSON.parse(accountResponse.result); } catch (e) { 
                            accountData = accountResponse.result; 
                        }
                        
                        // 提取比赛场数
                        let wins = 0;
                        let losses = 0;
                        
                        if (accountData.totalWins !== undefined) wins = accountData.totalWins;
                        else if (accountData.wins !== undefined) wins = accountData.wins;
                        else if (accountData.victories !== undefined) wins = accountData.victories;
                        
                        if (accountData.totalLosses !== undefined) losses = accountData.totalLosses;
                        else if (accountData.losses !== undefined) losses = accountData.losses;
                        else if (accountData.defeats !== undefined) losses = accountData.defeats;
                        
                        res.json({ 
                            ok: true, 
                            data: {
                                wins: wins,
                                losses: losses,
                                totalWins: wins,
                                totalLosses: losses,
                                localID: accountData.localID || accountData.localId
                            }
                        });
                    } else {
                        res.json({ 
                            ok: true, 
                            data: {
                                wins: 0,
                                losses: 0,
                                totalWins: 0,
                                totalLosses: 0
                            }
                        });
                    }
                }
                
            } catch (error) {
                console.log('比赛API错误:', error.message);
                // 返回默认值
                res.json({ 
                    ok: true, 
                    data: {
                        wins: 0,
                        losses: 0,
                        totalWins: 0,
                        totalLosses: 0
                    }
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
            
            try {
                console.log('调用外部比赛API更新场数...');
                
                const updateResponse = await axios.post(RATING_BASE_URL, {
                    action: 'update_stats',
                    data: data,
                    auth_token: authToken
                }, {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${authToken}`
                    },
                    timeout: 10000
                });
                
                if (updateResponse.data && updateResponse.data.ok) {
                    res.json({ 
                        ok: true, 
                        message: "Rating updated successfully",
                        data: updateResponse.data 
                    });
                } else {
                    res.json({ 
                        ok: false, 
                        error: 500, 
                        message: updateResponse.data?.message || "Failed to update rating" 
                    });
                }
                
            } catch (error) {
                console.log('更新比赛场数错误:', error.message);
                
                // 尝试更新到账号数据中
                try {
                    const accountResponse = await sendCPMRequest(`${CPM_BASE_URL}/GetPlayerRecords2`, 
                        { data: null }, 
                        {
                            "User-Agent": "okhttp/3.12.13",
                            "Authorization": `Bearer ${authToken}`,
                            "Content-Type": "application/json"
                        }
                    );
                    
                    if (accountResponse?.result) {
                        let accountData;
                        try { accountData = JSON.parse(accountResponse.result); } catch (e) { 
                            accountData = accountResponse.result; 
                        }
                        
                        // 更新比赛场数
                        if (data.wins !== undefined) {
                            accountData.wins = data.wins;
                            accountData.totalWins = data.wins;
                        }
                        if (data.losses !== undefined) {
                            accountData.losses = data.losses;
                            accountData.totalLosses = data.losses;
                        }
                        
                        // 保存更新后的账号数据
                        delete accountData._id;
                        delete accountData.id;
                        delete accountData.createdAt;
                        delete accountData.updatedAt;
                        delete accountData.__v;
                        
                        const saveResponse = await sendCPMRequest(`${CPM_BASE_URL}/SavePlayerRecordsIOS`, 
                            { data: JSON.stringify(accountData) }, 
                            {
                                "User-Agent": "okhttp/3.12.13",
                                "Authorization": `Bearer ${authToken}`,
                                "Content-Type": "application/json"
                            }
                        );
                        
                        if (saveResponse && (saveResponse.result === "1" || saveResponse.result === 1)) {
                            res.json({ 
                                ok: true, 
                                message: "Rating updated in account data",
                                data: data 
                            });
                        } else {
                            res.json({ 
                                ok: false, 
                                error: 500, 
                                message: "Failed to save updated account data" 
                            });
                        }
                    } else {
                        res.json({ 
                            ok: false, 
                            error: 404, 
                            message: "Cannot update rating - account data not found" 
                        });
                    }
                } catch (updateError) {
                    res.json({ 
                        ok: false, 
                        error: 500, 
                        message: `Update failed: ${updateError.message}` 
                    });
                }
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

// 5. 修改当前账号ID（集成比赛场数功能）
app.post('/api/change-localid', async (req, res) => {
    console.log('Change local ID request received');
    const { authToken, newLocalId, customWins, customLosses } = req.body;
    
    if (!authToken || !newLocalId) {
        return res.json({ ok: false, result: 0, message: "Missing required parameters" });
    }
    
    try {
        // 获取当前账号数据
        const accountResponse = await sendCPMRequest(`${CPM_BASE_URL}/GetPlayerRecords2`, 
            { data: null }, 
            {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            }
        );
        
        if (!accountResponse?.result) {
            return res.json({ ok: false, result: 0, message: "Failed to get account data" });
        }
        
        let accountData;
        try { accountData = JSON.parse(accountResponse.result); } catch (e) { accountData = accountResponse.result; }
        
        const oldLocalId = accountData.localID || accountData.localId;
        const cleanOldLocalId = removeColorCodes(oldLocalId);
        
        if (newLocalId === cleanOldLocalId) {
            return res.json({ ok: false, result: 0, message: "New ID is same as old ID" });
        }
        
        // 更新账号数据
        accountData.localID = newLocalId;
        if (accountData.localId) accountData.localId = newLocalId;
        
        // 如果需要更新比赛场数
        if (customWins !== undefined || customLosses !== undefined) {
            if (customWins !== undefined) {
                accountData.wins = parseInt(customWins);
                accountData.totalWins = parseInt(customWins);
            }
            if (customLosses !== undefined) {
                accountData.losses = parseInt(customLosses);
                accountData.totalLosses = parseInt(customLosses);
            }
        }
        
        // 清理数据
        delete accountData._id;
        delete accountData.id;
        delete accountData.createdAt;
        delete accountData.updatedAt;
        delete accountData.__v;
        
        // 保存账号数据
        const saveResponse = await sendCPMRequest(`${CPM_BASE_URL}/SavePlayerRecordsIOS`, 
            { data: JSON.stringify(accountData) }, 
            {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            }
        );
        
        if (!saveResponse || (saveResponse.result !== "1" && saveResponse.result !== 1)) {
            return res.json({ ok: false, result: 0, message: "Failed to save account data" });
        }
        
        // 更新车辆数据
        const carsResponse = await sendCPMRequest(`${CPM_BASE_URL}/TestGetAllCars`, 
            { data: null }, 
            {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            }
        );
        
        let updatedCars = 0;
        let failedCars = 0;
        
        if (carsResponse?.result) {
            let carsData;
            try { carsData = JSON.parse(carsResponse.result); } catch (e) { carsData = carsResponse.result; }
            
            if (Array.isArray(carsData) && carsData.length > 0) {
                for (const car of carsData) {
                    try {
                        let carCopy = JSON.parse(JSON.stringify(car));
                        
                        // 替换Local ID
                        if (oldLocalId && cleanOldLocalId) {
                            const carStr = JSON.stringify(carCopy);
                            let newCarStr = carStr.replace(new RegExp(escapeRegExp(oldLocalId), 'g'), newLocalId);
                            newCarStr = newCarStr.replace(new RegExp(escapeRegExp(cleanOldLocalId), 'g'), newLocalId);
                            try { carCopy = JSON.parse(newCarStr); } catch (e) {}
                        }
                        
                        // 清理数据
                        delete carCopy._id;
                        delete carCopy.createdAt;
                        delete carCopy.updatedAt;
                        delete carCopy.__v;
                        
                        // 保存车辆
                        const saveCarResponse = await sendCPMRequest(`${CPM_BASE_URL}/SaveCars`, 
                            { data: JSON.stringify(carCopy) }, 
                            {
                                "Authorization": `Bearer ${authToken}`,
                                "Content-Type": "application/json"
                            }
                        );
                        
                        if (saveCarResponse && (saveCarResponse.success || saveCarResponse.result)) {
                            updatedCars++;
                        } else {
                            failedCars++;
                        }
                    } catch (error) {
                        failedCars++;
                    }
                }
            }
        }
        
        // 如果需要，更新外部比赛API
        let ratingUpdated = false;
        if (customWins !== undefined || customLosses !== undefined) {
            try {
                const updateData = {};
                if (customWins !== undefined) updateData.wins = parseInt(customWins);
                if (customLosses !== undefined) updateData.losses = parseInt(customLosses);
                updateData.localID = newLocalId;
                
                await axios.post(RATING_BASE_URL, {
                    action: 'update_stats',
                    data: updateData,
                    auth_token: authToken
                }, {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${authToken}`
                    },
                    timeout: 5000
                });
                
                ratingUpdated = true;
            } catch (ratingError) {
                console.log('更新外部比赛API失败:', ratingError.message);
            }
        }
        
        res.json({
            ok: true,
            result: 1,
            message: ratingUpdated ? "Local ID and rating updated successfully!" : "Local ID changed successfully!",
            details: {
                oldLocalId: cleanOldLocalId,
                newLocalId: newLocalId,
                carsUpdated: updatedCars,
                carsFailed: failedCars,
                ratingUpdated: ratingUpdated,
                newWins: customWins !== undefined ? parseInt(customWins) : null,
                newLosses: customLosses !== undefined ? parseInt(customLosses) : null
            }
        });
        
    } catch (error) {
        console.error('Change local ID error:', error);
        res.json({ ok: false, result: 0, message: `Process failed: ${error.message}` });
    }
});

// 6. 克隆账号功能（简化版）
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
        // 获取源账号数据
        const sourceResponse = await sendCPMRequest(`${CPM_BASE_URL}/GetPlayerRecords2`, 
            { data: null }, 
            {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${sourceAuth}`,
                "Content-Type": "application/json"
            }
        );
        
        if (!sourceResponse?.result) {
            return res.json({ ok: false, error: 404, message: "Failed to get source account data" });
        }
        
        let sourceData;
        try { sourceData = JSON.parse(sourceResponse.result); } catch (e) { sourceData = sourceResponse.result; }
        
        const sourceLocalId = sourceData.localID || sourceData.localId;
        
        // 登录目标账号
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
            return res.json({ ok: false, error: 401, message: "Failed to login to target account" });
        }
        
        const targetAuth = loginResponse.idToken;
        
        // 准备目标账号数据
        const newLocalId = customLocalId?.trim() || generateRandomId().toUpperCase();
        const targetData = {
            ...sourceData,
            localID: newLocalId,
            localId: newLocalId,
            Name: sourceData.Name || "TELMunn",
            money: sourceData.money || 500000000
        };
        
        // 更新比赛场数
        if (customWins !== undefined) {
            targetData.wins = parseInt(customWins);
            targetData.totalWins = parseInt(customWins);
        }
        if (customLosses !== undefined) {
            targetData.losses = parseInt(customLosses);
            targetData.totalLosses = parseInt(customLosses);
        }
        
        // 清理数据
        delete targetData._id;
        delete targetData.id;
        delete targetData.createdAt;
        delete targetData.updatedAt;
        delete targetData.__v;
        
        // 保存目标账号数据
        const saveResponse = await sendCPMRequest(`${CPM_BASE_URL}/SavePlayerRecordsIOS`, 
            { data: JSON.stringify(targetData) }, 
            {
                "User-Agent": "okhttp/3.12.13",
                "Authorization": `Bearer ${targetAuth}`,
                "Content-Type": "application/json"
            }
        );
        
        if (!saveResponse || (saveResponse.result !== "1" && saveResponse.result !== 1)) {
            return res.json({ ok: false, error: 500, message: "Failed to save target account data" });
        }
        
        res.json({
            ok: true,
            error: 0,
            message: "Account cloned successfully!",
            details: {
                targetAccount: targetEmail,
                newLocalId: newLocalId,
                wins: customWins !== undefined ? parseInt(customWins) : sourceData.wins || sourceData.totalWins || 0,
                losses: customLosses !== undefined ? parseInt(customLosses) : sourceData.losses || sourceData.totalLosses || 0
            }
        });
        
    } catch (error) {
        console.error('Clone error:', error);
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
