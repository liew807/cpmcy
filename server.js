// server.js - 完整功能版（包含所有API）
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// ========== 中间件配置 ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== 静态文件服务 ==========
const publicDir = path.join(__dirname, 'public');
fs.mkdir(publicDir, { recursive: true }).catch(console.error);

app.use(express.static(publicDir, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// ========== 重定向根目录 ==========
app.get('/', (req, res) => {
    const indexPath = path.join(publicDir, 'index.html');
    fs.access(indexPath)
        .then(() => res.redirect('/index.html'))
        .catch(() => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>CPMCY商城</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 50px; text-align: center; }
                        h1 { color: #333; }
                        .box { background: #f5f5f5; padding: 30px; border-radius: 10px; margin: 20px auto; max-width: 800px; }
                        .endpoint { background: white; padding: 10px; margin: 5px 0; border-radius: 5px; text-align: left; }
                        .method { display: inline-block; padding: 3px 8px; border-radius: 3px; margin-right: 10px; font-weight: bold; }
                        .get { background: #61affe; color: white; }
                        .post { background: #49cc90; color: white; }
                        .put { background: #fca130; color: white; }
                        .delete { background: #f93e3e; color: white; }
                    </style>
                </head>
                <body>
                    <h1>🚀 CPMCY商城后端运行正常！</h1>
                    <div class="box">
                        <h2>✅ 所有API接口</h2>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/products</strong> - 获取商品列表
                        </div>
                        
                        <div class="endpoint">
                            <span class="method post">POST</span>
                            <strong>/api/products</strong> - 添加商品
                        </div>
                        
                        <div class="endpoint">
                            <span class="method delete">DELETE</span>
                            <strong>/api/products/:id</strong> - 删除商品
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/orders</strong> - 获取订单列表
                        </div>
                        
                        <div class="endpoint">
                            <span class="method post">POST</span>
                            <strong>/api/orders</strong> - 创建订单
                        </div>
                        
                        <div class="endpoint">
                            <span class="method put">PUT</span>
                            <strong>/api/orders/:id/status</strong> - 更新订单状态
                        </div>
                        
                        <div class="endpoint">
                            <span class="method post">POST</span>
                            <strong>/api/login</strong> - 用户登录
                        </div>
                        
                        <div class="endpoint">
                            <span class="method post">POST</span>
                            <strong>/api/register</strong> - 用户注册
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/settings</strong> - 获取系统设置
                        </div>
                        
                        <div class="endpoint">
                            <span class="method put">PUT</span>
                            <strong>/api/settings</strong> - 更新系统设置
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/backup</strong> - 备份数据
                        </div>
                        
                        <div class="endpoint">
                            <span class="method get">GET</span>
                            <strong>/api/status</strong> - 系统状态
                        </div>
                        
                        <p style="margin-top: 20px;">
                            <strong>前端页面:</strong> 
                            <a href="/index.html">/index.html</a>
                        </p>
                    </div>
                </body>
                </html>
            `);
        });
});

// ========== 数据文件配置 ==========
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'mall-data.json');

// 确保数据目录存在
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        try {
            await fs.access(DATA_FILE);
        } catch {
            // 创建初始数据
            const initialData = {
                users: [
                    { username: 'admin', password: 'admin123', isAdmin: true }
                ],
                products: [],
                orders: [],
                settings: {
                    storeName: 'CPMCY商城',
                    kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                    contactInfo: 'FB账号GH Tree',
                    welcomeMessage: '欢迎选购！点击购买扫码完成付款'
                },
                lastUpdated: new Date().toISOString()
            };
            
            await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
            console.log('✅ 数据文件初始化完成');
        }
    } catch (error) {
        console.error('❌ 初始化数据目录失败:', error);
    }
}

// 读取数据
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ 读取数据失败:', error);
        return null;
    }
}

// 保存数据
async function saveData(data) {
    try {
        data.lastUpdated = new Date().toISOString();
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ 保存数据失败:', error);
        return false;
    }
}

// ========== API路由 ==========

// 1. 商品API
app.get('/api/products', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: data.products || [],
            lastUpdated: data.lastUpdated
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取商品失败' });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const product = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        product.id = Date.now();
        product.createdAt = new Date().toISOString();
        product.updatedAt = new Date().toISOString();
        
        data.products.push(product);
        await saveData(data);
        
        res.json({
            success: true,
            data: product,
            message: '商品添加成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '添加商品失败' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const productId = Number(id);
        data.products = data.products.filter(p => p.id !== productId);
        await saveData(data);
        
        res.json({ success: true, message: '商品删除成功' });
    } catch (error) {
        res.status(500).json({ success: false, error: '删除商品失败' });
    }
});

// 2. 订单API
app.get('/api/orders', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 支持过滤
        const { status, userId } = req.query;
        let orders = data.orders || [];
        
        if (status) {
            orders = orders.filter(o => o.status === status);
        }
        
        if (userId) {
            orders = orders.filter(o => o.userId === userId);
        }
        
        // 按时间倒序
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取订单失败' });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 生成订单号
        const now = new Date();
        const dateStr = now.getFullYear().toString().substr(2) + 
                      (now.getMonth() + 1).toString().padStart(2, '0') + 
                      now.getDate().toString().padStart(2, '0');
        const timeStr = now.getHours().toString().padStart(2, '0') + 
                       now.getMinutes().toString().padStart(2, '0') + 
                       now.getSeconds().toString().padStart(2, '0');
        
        order.id = Date.now();
        order.orderNumber = `DD${dateStr}${timeStr}`;
        order.createdAt = now.toISOString();
        order.updatedAt = now.toISOString();
        order.status = order.status || 'pending';
        
        data.orders.push(order);
        await saveData(data);
        
        res.json({
            success: true,
            data: order,
            message: '订单创建成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '创建订单失败' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const orderId = Number(id);
        const order = data.orders.find(o => o.id === orderId);
        
        if (order) {
            order.status = status;
            order.updatedAt = new Date().toISOString();
            await saveData(data);
            
            res.json({
                success: true,
                data: order,
                message: '订单状态更新成功'
            });
        } else {
            res.status(404).json({ success: false, error: '订单不存在' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '更新订单失败' });
    }
});

// 3. 用户API
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const user = data.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            const { password: _, ...userWithoutPassword } = user;
            res.json({
                success: true,
                data: userWithoutPassword,
                message: '登录成功'
            });
        } else {
            res.status(401).json({ success: false, error: '用户名或密码错误' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: '登录失败' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        if (data.users.some(u => u.username === username)) {
            return res.status(400).json({ success: false, error: '用户名已存在' });
        }
        
        const newUser = {
            username,
            password,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };
        
        data.users.push(newUser);
        await saveData(data);
        
        const { password: _, ...userWithoutPassword } = newUser;
        
        res.json({
            success: true,
            data: userWithoutPassword,
            message: '注册成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '注册失败' });
    }
});

// 4. 系统设置API
app.get('/api/settings', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: data.settings || {}
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取设置失败' });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        const data = await readData();
        
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        data.settings = {
            ...data.settings,
            ...settings,
            updatedAt: new Date().toISOString()
        };
        
        await saveData(data);
        
        res.json({
            success: true,
            data: data.settings,
            message: '设置更新成功'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '更新设置失败' });
    }
});

// 5. 数据备份API
app.get('/api/backup', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        // 添加备份信息
        const backupData = {
            ...data,
            backupAt: new Date().toISOString(),
            backupVersion: '1.0',
            note: 'CPMCY商城数据备份'
        };
        
        // 设置响应头，让浏览器下载文件
        res.setHeader('Content-Disposition', 'attachment; filename="cpmcy-backup.json"');
        res.setHeader('Content-Type', 'application/json');
        
        res.send(JSON.stringify(backupData, null, 2));
    } catch (error) {
        res.status(500).json({ success: false, error: '备份失败' });
    }
});

// 6. 数据统计API
app.get('/api/stats', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        const today = new Date().toDateString();
        const todayOrders = (data.orders || []).filter(order => 
            new Date(order.createdAt).toDateString() === today
        );
        
        const stats = {
            totalProducts: data.products.length,
            totalOrders: data.orders.length,
            totalUsers: data.users.length,
            todayOrders: todayOrders.length,
            todayRevenue: todayOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
            pendingOrders: data.orders.filter(o => o.status === 'pending').length,
            paidOrders: data.orders.filter(o => o.status === 'paid').length,
            completedOrders: data.orders.filter(o => o.status === 'completed').length,
            lastUpdated: data.lastUpdated
        };
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取统计失败' });
    }
});

// 7. 系统状态API
app.get('/api/status', async (req, res) => {
    try {
        const data = await readData();
        if (!data) {
            return res.status(500).json({ success: false, error: '系统错误' });
        }
        
        res.json({
            success: true,
            data: {
                status: 'running',
                serverTime: new Date().toISOString(),
                uptime: process.uptime(),
                port: PORT,
                dataFile: DATA_FILE,
                publicDir: publicDir,
                hasPublicDir: fs.existsSync(publicDir),
                hasIndexHtml: fs.existsSync(path.join(publicDir, 'index.html')),
                productsCount: data.products.length,
                ordersCount: data.orders.length,
                usersCount: data.users.length,
                lastUpdated: data.lastUpdated
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: '获取状态失败' });
    }
});

// ========== 404处理 ==========
app.use((req, res) => {
    res.status(404).json({ success: false, error: '接口不存在' });
});

// ========== 错误处理 ==========
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ success: false, error: err.message || '服务器内部错误' });
});

// ========== 启动服务器 ==========
async function startServer() {
    await ensureDataDir();
    
    app.listen(PORT, () => {
        console.log(`
        🚀 CPMCY商城后端已启动！
        📍 本地访问: http://localhost:${PORT}
        📍 前端页面: http://localhost:${PORT}/index.html
        📍 API基础: http://localhost:${PORT}/api
        
        📁 数据文件: ${DATA_FILE}
        📁 静态目录: ${publicDir}
        
        ✅ 可用API:
        - GET    /api/products     获取商品
        - POST   /api/products     添加商品
        - DELETE /api/products/:id 删除商品
        - GET    /api/orders       获取订单
        - POST   /api/orders       创建订单
        - PUT    /api/orders/:id/status 更新订单状态
        - POST   /api/login        用户登录
        - POST   /api/register     用户注册
        - GET    /api/settings     获取设置
        - PUT    /api/settings     更新设置
        - GET    /api/backup       数据备份
        - GET    /api/stats        数据统计
        - GET    /api/status       系统状态
        `);
    });
}

startServer().catch(console.error);
