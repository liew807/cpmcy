// server.js - 完整功能后端
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 数据文件
const DATA_FILE = path.join(__dirname, 'data.json');

// ========== 数据操作函数 ==========

// 初始化数据
async function initData() {
    try {
        await fs.access(DATA_FILE);
        console.log('✅ 数据文件已存在');
    } catch {
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        const initialData = {
            users: [{ 
                id: 1,
                username: 'admin', 
                password: hashedPassword,
                isAdmin: true,
                is_admin: true 
            }],
            products: [
                {
                    id: 1,
                    name: '示例商品1',
                    price: 99.99,
                    description: '这是一个示例商品',
                    image: 'https://via.placeholder.com/300x200?text=商品1',
                    createdAt: new Date().toISOString()
                },
                {
                    id: 2,
                    name: '示例商品2',
                    price: 199.99,
                    description: '这是另一个示例商品',
                    image: 'https://via.placeholder.com/300x200?text=商品2',
                    createdAt: new Date().toISOString()
                }
            ],
            orders: [],
            settings: {
                storeName: 'CPMCY商城',
                kuaishouLink: 'https://v.kuaishou.com/JGv00n48',
                contactInfo: 'FB账号GH Tree',
                welcomeMessage: '欢迎选购！点击购买扫码完成付款'
            }
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ 创建初始数据');
    }
}

// 读取所有数据
async function readAllData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取数据失败:', error);
        return null;
    }
}

// 保存所有数据
async function saveAllData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('保存数据失败:', error);
        return false;
    }
}

// ========== 商品功能 ==========
async function getProducts() {
    const data = await readAllData();
    return data?.products || [];
}

async function addProduct(product) {
    const data = await readAllData();
    if (!data) return null;
    
    const newProduct = {
        id: Date.now(),
        name: product.name || '',
        price: parseFloat(product.price) || 0,
        description: product.description || '',
        image: product.image || product.image_url || 'https://via.placeholder.com/300x200?text=商品',
        createdAt: new Date().toISOString()
    };
    
    data.products.push(newProduct);
    await saveAllData(data);
    return newProduct;
}

async function deleteProduct(id) {
    const data = await readAllData();
    if (!data) return false;
    
    data.products = data.products.filter(p => p.id != id);
    await saveAllData(data);
    return true;
}

// ========== 订单功能 ==========
async function getOrders() {
    const data = await readAllData();
    return data?.orders || [];
}

async function addOrder(order) {
    const data = await readAllData();
    if (!data) return null;
    
    const newOrder = {
        id: Date.now(),
        orderNumber: order.orderNumber || ('DD' + Date.now().toString().slice(-8)),
        userId: order.userId || '',
        productId: order.productId || 0,
        productName: order.productName || '',
        productPrice: order.productPrice || 0,
        totalAmount: order.totalAmount || 0,
        paymentMethod: order.paymentMethod || 'tng',
        status: order.status || 'pending',
        createdAt: new Date().toISOString()
    };
    
    data.orders.push(newOrder);
    await saveAllData(data);
    return newOrder;
}

async function updateOrderStatus(orderId, status) {
    const data = await readAllData();
    if (!data) return false;
    
    const order = data.orders.find(o => o.id == orderId);
    if (order) {
        order.status = status;
        await saveAllData(data);
        return true;
    }
    return false;
}

// ========== 用户功能 ==========
async function authenticateUser(username, password) {
    const data = await readAllData();
    if (!data) return null;
    
    const user = data.users.find(u => u.username === username);
    if (user && bcrypt.compareSync(password, user.password)) {
        return {
            id: user.id,
            username: user.username,
            isAdmin: user.isAdmin || user.is_admin,
            is_admin: user.isAdmin || user.is_admin
        };
    }
    return null;
}

async function registerUser(username, password) {
    const data = await readAllData();
    if (!data) return null;
    
    // 检查用户是否存在
    const userExists = data.users.some(u => u.username === username);
    if (userExists) return null;
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = {
        id: Date.now(),
        username,
        password: hashedPassword,
        isAdmin: false,
        is_admin: false
    };
    
    data.users.push(newUser);
    await saveAllData(data);
    return newUser;
}

// ========== 设置功能 ==========
async function getSettings() {
    const data = await readAllData();
    return data?.settings || {};
}

async function updateSettings(newSettings) {
    const data = await readAllData();
    if (!data) return false;
    
    data.settings = {
        ...data.settings,
        ...newSettings
    };
    
    await saveAllData(data);
    return data.settings;
}

// ========== 数据统计 ==========
async function getStats() {
    const data = await readAllData();
    if (!data) return {};
    
    const products = data.products || [];
    const orders = data.orders || [];
    
    const today = new Date().toDateString();
    const todayOrders = orders.filter(order => 
        new Date(order.createdAt).toDateString() === today
    );
    
    return {
        totalProducts: products.length,
        totalOrders: orders.length,
        todayOrders: todayOrders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        paidOrders: orders.filter(o => o.status === 'paid').length,
        completedOrders: orders.filter(o => o.status === 'completed').length
    };
}

// ========== API路由 ==========

// 1. 商品API
app.get('/api/products', async (req, res) => {
    const products = await getProducts();
    res.json({ success: true, data: products });
});

app.post('/api/products', async (req, res) => {
    const product = req.body;
    const saved = await addProduct(product);
    
    if (saved) {
        res.json({ success: true, data: saved });
    } else {
        res.json({ success: false, error: '添加失败' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    const success = await deleteProduct(req.params.id);
    res.json({ success: success });
});

// 2. 订单API
app.get('/api/orders', async (req, res) => {
    const orders = await getOrders();
    res.json({ success: true, data: orders });
});

app.post('/api/orders', async (req, res) => {
    const order = req.body;
    const saved = await addOrder(order);
    
    if (saved) {
        res.json({ success: true, data: saved });
    } else {
        res.json({ success: false, error: '创建订单失败' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const success = await updateOrderStatus(id, status);
    res.json({ success: success });
});

// 3. 用户API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await authenticateUser(username, password);
    
    if (user) {
        res.json({ 
            success: true, 
            data: {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                is_admin: user.is_admin
            }
        });
    } else {
        res.json({ success: false, error: '用户名或密码错误' });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const user = await registerUser(username, password);
    
    if (user) {
        res.json({ 
            success: true, 
            data: {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                is_admin: user.is_admin
            }
        });
    } else {
        res.json({ success: false, error: '用户名已存在' });
    }
});

// 4. 设置API
app.get('/api/settings', async (req, res) => {
    const settings = await getSettings();
    res.json({ 
        success: true, 
        data: {
            storeName: settings.storeName || 'CPMCY商城',
            kuaishouLink: settings.kuaishouLink || 'https://v.kuaishou.com/JGv00n48',
            contactInfo: settings.contactInfo || 'FB账号GH Tree',
            welcomeMessage: settings.welcomeMessage || '欢迎选购！点击购买扫码完成付款'
        }
    });
});

app.put('/api/settings', async (req, res) => {
    const settings = req.body;
    const updated = await updateSettings(settings);
    res.json({ success: true, data: updated });
});

// 5. 数据统计API
app.get('/api/stats', async (req, res) => {
    const stats = await getStats();
    res.json({ success: true, data: stats });
});

// 6. 系统状态API
app.get('/api/status', async (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'running',
            storageType: 'file',
            port: PORT,
            timestamp: new Date().toISOString()
        }
    });
});

// 7. 备份数据API
app.get('/api/backup', async (req, res) => {
    try {
        const data = await readAllData();
        res.setHeader('Content-Disposition', 'attachment; filename="cpmcy-backup.json"');
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(data, null, 2));
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// ========== 首页 ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            res.send(`
                <html>
                    <head><title>CPMCY商城</title></head>
                    <body style="font-family: Arial; padding: 50px; text-align: center;">
                        <h1>🚀 CPMCY商城后端运行中</h1>
                        <p>端口: ${PORT}</p>
                        <p>存储: 本地文件存储</p>
                        <p>默认管理员: admin / admin123</p>
                        <p>前端页面加载失败，请确保 public/index.html 文件存在</p>
                    </body>
                </html>
            `);
        }
    });
});

// ========== 启动服务器 ==========
async function startServer() {
    await initData();
    
    app.listen(PORT, () => {
        console.log(`
        🚀 CPMCY商城已启动！
        📍 端口: ${PORT}
        📍 地址: http://localhost:${PORT}/
        📍 存储: 本地文件
        
        ✅ 完整功能:
        1. 商品管理（添加、删除、查看）
        2. 订单管理（创建、状态更新、查看）
        3. 用户系统（登录、注册）
        4. 系统设置
        5. 数据统计
        6. 数据备份
        
        🔗 默认管理员: admin / admin123
        `);
    });
}

startServer().catch(console.error);
