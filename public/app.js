class cpmcylone {
    constructor() {
        this.baseUrl = window.location.origin;
        this.sourceAuth = null;
        this.sourceAccountInfo = null;
        this.isProcessing = false;
        this.cloneTimeout = null;
        this.startTime = null;
        this.currentUser = null;
        this.isAdminUser = false; // 新增：是否是管理员标识
        console.log('🎯 CPM克隆工具初始化成功. 基础URL:', this.baseUrl);
    }

    init(userInfo = null) {
        this.currentUser = userInfo;
        console.log('🎯 初始化CPM克隆工具，用户:', this.currentUser);
        
        // 检查是否有用户信息
        if (!this.currentUser || !this.currentUser.verified) {
            console.error('❌ 用户未验证或未登录');
            this.showStatus('error', '请先完成系统验证', 'login-status');
            return;
        }
        
        // 设置管理员标识
        this.isAdminUser = this.currentUser.userType === 'admin';
        console.log('👤 用户权限:', this.isAdminUser ? '管理员' : '普通用户');
        
        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeComponents();
            });
        } else {
            this.initializeComponents();
        }
    }

    initializeComponents() {
        console.log('🔄 初始化组件...');
        
        // 绑定所有按钮事件
        this.bindEvents();
        
        // 根据用户类型设置权限
        this.setupUserPermissions();
        
        // 检查是否有保存的会话
        this.checkSession();
        
        // 测试API连接
        this.testConnection();
        
        // 初始化步骤指示器
        this.initStepIndicator();
        
        // 初始化操作类型选择
        this.initOperationType();
        
        console.log('✅ CPM克隆工具初始化完成');
    }

    setupUserPermissions() {
        if (!this.currentUser) return;
        
        console.log('🔧 设置用户权限，类型:', this.currentUser.userType, '卡片类型:', this.currentUser.cardType);
        
        // 延迟设置，确保DOM已加载
        setTimeout(() => {
            const option2Radio = document.getElementById('op-type2');
            const label2 = document.querySelector('label[for="op-type2"]');
            const adminFeatures = document.querySelectorAll('.admin-only'); // 新增：管理员专属功能
            
            // 首先隐藏所有管理员专属功能
            adminFeatures.forEach(element => {
                if (element) {
                    element.style.display = 'none';
                    element.classList.add('hidden');
                }
            });
            
            if (this.currentUser.cardType === 'hour') {
                // 小时卡用户只能使用选项1（修改ID）
                console.log('⏰ 小时卡用户，限制功能');
                
                if (option2Radio) {
                    option2Radio.disabled = true;
                    option2Radio.checked = false;
                    const option1Radio = document.getElementById('op-type1');
                    if (option1Radio) option1Radio.checked = true;
                }
                
                if (label2) {
                    label2.style.opacity = '0.5';
                    label2.style.cursor = 'not-allowed';
                    const smallText = label2.querySelector('small');
                    if (smallText) {
                        smallText.textContent = '（小时卡用户无法使用此功能）';
                    }
                }
                
                this.addLog('小时卡用户登录，仅可使用修改ID功能');
                
            } else if (this.currentUser.cardType === 'full' || this.isAdminUser) {
                // 全功能卡用户和管理员可以使用所有功能
                if (option2Radio) {
                    option2Radio.disabled = false;
                }
                
                if (label2) {
                    label2.style.opacity = '1';
                    label2.style.cursor = 'pointer';
                    const smallText = label2.querySelector('small');
                    if (smallText) {
                        smallText.textContent = '复制当前账号所有数据到另一个账号（覆盖目标账号）';
                    }
                }
                
                // 如果是管理员，显示管理员专属功能
                if (this.isAdminUser) {
                    console.log('🔓 管理员登录，显示管理员功能');
                    adminFeatures.forEach(element => {
                        if (element) {
                            element.style.display = '';
                            element.classList.remove('hidden');
                        }
                    });
                    this.addLog('管理员登录，可使用所有功能');
                } else {
                    this.addLog('全功能卡用户登录，可使用所有功能');
                }
            } else {
                // 其他用户类型，限制功能
                console.log('🔒 其他用户类型，限制功能');
                if (option2Radio) {
                    option2Radio.disabled = true;
                    option2Radio.checked = false;
                }
                
                if (label2) {
                    label2.style.opacity = '0.5';
                    label2.style.cursor = 'not-allowed';
                    const smallText = label2.querySelector('small');
                    if (smallText) {
                        smallText.textContent = '（您没有使用此功能的权限）';
                    }
                }
                
                this.addLog('普通用户登录，功能受限');
            }
            
            // 更新操作类型UI
            this.updateOperationUI('modify-id');
        }, 100);
    }

    initStepIndicator() {
        setTimeout(() => {
            const cloneSection = document.getElementById('clone-section');
            if (cloneSection && !document.querySelector('.step-indicator')) {
                const stepHtml = `
                    <div class="step-indicator">
                        <div class="step active" id="step-1">
                            <div class="step-number">1</div>
                            <div class="step-text">登录源账号</div>
                        </div>
                        <div class="step" id="step-2">
                            <div class="step-number">2</div>
                            <div class="step-text">选择操作类型</div>
                        </div>
                        <div class="step" id="step-3">
                            <div class="step-number">3</div>
                            <div class="step-text">开始执行</div>
                        </div>
                    </div>
                `;
                cloneSection.insertAdjacentHTML('afterbegin', stepHtml);
            }
        }, 200);
    }

    updateStep(stepNumber) {
        for (let i = 1; i <= 3; i++) {
            const step = document.getElementById(`step-${i}`);
            if (step) {
                step.classList.remove('active', 'completed');
            }
        }

        for (let i = 1; i <= stepNumber; i++) {
            const step = document.getElementById(`step-${i}`);
            if (step) {
                if (i < stepNumber) {
                    step.classList.add('completed');
                } else {
                    step.classList.add('active');
                }
            }
        }
    }

    initOperationType() {
        setTimeout(() => {
            const operationRadios = document.querySelectorAll('input[name="operation-type"]');
            if (operationRadios.length > 0) {
                operationRadios.forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        this.updateOperationUI(e.target.value);
                    });
                });
                
                // 初始化为修改ID模式
                this.updateOperationUI('modify-id');
                console.log('✅ 操作类型选择初始化完成');
            }
        }, 200);
    }

    updateOperationUI(operationType) {
        const targetCredentials = document.getElementById('target-credentials');
        const warning = document.querySelector('.warning');
        const cloneBtn = document.getElementById('clone-btn');
        
        if (operationType === 'modify-id') {
            if (targetCredentials) {
                targetCredentials.classList.add('hidden');
            }
            
            if (warning) {
                warning.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>警告：</strong> 这将修改当前账号的Local ID！请确保新ID的唯一性！
                `;
            }
            
            if (cloneBtn) {
                cloneBtn.innerHTML = '<i class="fas fa-user-edit"></i> 修改当前账号ID';
                cloneBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)';
            }
            
        } else if (operationType === 'clone-to-new') {
            if (targetCredentials) {
                targetCredentials.classList.remove('hidden');
            }
            
            if (warning) {
                warning.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>警告：</strong> 这将覆盖目标账号的所有数据！请谨慎操作！
                `;
            }
            
            if (cloneBtn) {
                cloneBtn.innerHTML = '<i class="fas fa-clone"></i> 开始克隆';
                cloneBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)';
            }
        }
    }

    // ========== 修复按钮绑定 ==========
    bindEvents() {
        console.log('🔗 绑定按钮事件...');
        
        // 绑定登录按钮
        this.bindLoginButton();
        
        // 绑定克隆按钮
        this.bindCloneButton();
        
        // 绑定退出按钮
        this.bindLogoutButtons();
        
        // 绑定Enter键事件
        this.bindEnterKeys();
        
        console.log('✅ 按钮事件绑定完成');
    }

    bindLoginButton() {
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            // 移除旧的事件监听器
            loginBtn.removeEventListener('click', this.login);
            // 添加新的事件监听器
            loginBtn.addEventListener('click', () => this.login());
            console.log('✅ 登录按钮绑定成功');
        } else {
            console.error('❌ 找不到登录按钮！');
        }
    }

    bindCloneButton() {
        const cloneBtn = document.getElementById('clone-btn');
        if (cloneBtn) {
            // 移除旧的事件监听器
            cloneBtn.removeEventListener('click', this.cloneAccount);
            // 添加新的事件监听器
            cloneBtn.addEventListener('click', () => this.cloneAccount());
            console.log('✅ 克隆按钮绑定成功');
        } else {
            console.error('❌ 找不到克隆按钮！');
        }
    }

    bindLogoutButtons() {
        // CPM账号退出按钮
        const logoutBtnClone = document.getElementById('logout-btn-clone');
        if (logoutBtnClone) {
            logoutBtnClone.addEventListener('click', () => this.logoutCPM());
            console.log('✅ CPM退出按钮绑定成功');
        }
        
        // 系统退出按钮已经在验证系统中处理
    }

    bindEnterKeys() {
        const addEnterHandler = (input, nextInput, callback) => {
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (nextInput) {
                            nextInput.focus();
                        }
                        if (callback) {
                            callback();
                        }
                    }
                });
            }
        };
        
        const sourceEmail = document.getElementById('source-email');
        const sourcePass = document.getElementById('source-password');
        const targetEmail = document.getElementById('target-email');
        const targetPass = document.getElementById('target-password');
        const customLocalId = document.getElementById('custom-localid');
        
        if (sourceEmail) addEnterHandler(sourceEmail, sourcePass);
        if (sourcePass) addEnterHandler(sourcePass, null, () => this.login());
        if (targetEmail) addEnterHandler(targetEmail, targetPass);
        if (targetPass) addEnterHandler(targetPass, customLocalId);
        if (customLocalId) addEnterHandler(customLocalId, null, () => this.cloneAccount());
        
        console.log('✅ Enter键绑定完成');
    }

    async testConnection() {
        try {
            console.log('🔌 测试API连接...');
            this.addLog('正在测试API连接...');
            
            // 创建AbortController用于超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
                // 测试常见的API端点
                const response = await fetch(this.baseUrl + '/api/test', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (data.status === 'ok' || data.ok || data.success) {
                    this.addLog('✅ API连接正常');
                    console.log('✅ API连接测试成功:', data);
                    return true;
                } else {
                    throw new Error(data.message || 'API返回错误状态');
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                
                // 尝试测试服务器根路径
                try {
                    const healthResponse = await fetch(this.baseUrl + '/api/health', {
                        method: 'GET',
                        signal: AbortSignal.timeout(3000)
                    });
                    
                    if (healthResponse.ok) {
                        const healthData = await healthResponse.json();
                        this.addLog('✅ API连接正常 (健康检查通过)');
                        console.log('✅ API健康检查通过:', healthData);
                        return true;
                    }
                } catch (healthError) {
                    // 继续尝试其他方法
                }
                
                // 最后尝试OPTIONS方法测试端点可用性
                try {
                    const optionsResponse = await fetch(this.baseUrl + '/api/login', {
                        method: 'OPTIONS',
                        signal: AbortSignal.timeout(3000)
                    });
                    
                    if (optionsResponse.status === 200 || optionsResponse.status === 204) {
                        this.addLog('⚠ API端点可访问，但测试接口无响应');
                        console.log('⚠ API端点可访问');
                        return true;
                    }
                } catch (optionsError) {
                    // 所有测试都失败
                }
                
                this.addLog('❌ API连接失败');
                console.error('❌ API连接测试失败:', fetchError);
                return false;
            }
        } catch (error) {
            console.error('❌ API连接测试失败:', error);
            this.addLog('⚠ API连接测试失败，请检查后端服务');
            return false;
        }
    }

    checkSession() {
        const savedAuth = localStorage.getItem('jbcacc_auth');
        if (savedAuth && this.currentUser) {
            this.sourceAuth = savedAuth;
            this.showStatus('info', '检测到上次登录会话，正在验证...', 'login-status');
            console.log('🔍 从localStorage恢复CPM会话');
            
            // 验证会话
            this.verifyAndLoadAccount(savedAuth);
        }
    }

    async verifyAndLoadAccount(authToken) {
        try {
            this.updateStep(1);
            
            // 创建超时控制器
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(this.baseUrl + '/api/get-account-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ authToken }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const data = await response.json();
            if (data.ok) {
                this.sourceAccountInfo = data.data;
                this.displayAccountInfo(data.data);
                this.showStatus('success', '会话验证成功！', 'login-status');
                this.updateStep(2);
                
                // 获取车辆数量
                await this.loadCarsCount(authToken);
                
                // 显示克隆界面
                this.hideElement('login-section');
                this.showElement('account-info-section');
                this.showElement('clone-section');
                
                this.addLog('✅ CPM会话验证成功');
            } else {
                this.logoutCPM();
                this.showStatus('error', '会话已过期，请重新登录', 'login-status');
                this.addLog('❌ CPM会话已过期');
            }
        } catch (error) {
            console.log('❌ 会话验证失败:', error);
            this.logoutCPM();
            this.showStatus('error', '会话验证失败，请重新登录', 'login-status');
            this.addLog('❌ CPM会话验证失败');
        }
    }

    async loadCarsCount(authToken) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            const response = await fetch(this.baseUrl + '/api/get-all-cars', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ authToken }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const data = await response.json();
            if (data.ok && Array.isArray(data.data)) {
                const carsCount = data.data.length;
                document.getElementById('account-cars').textContent = carsCount;
            }
        } catch (error) {
            console.log('❌ 获取车辆数量失败:', error);
            document.getElementById('account-cars').textContent = '--';
        }
    }

    displayAccountInfo(accountData) {
        if (!accountData) return;
        
        const name = accountData.Name || accountData.username || accountData.email || '未知';
        document.getElementById('account-name').textContent = name;
        
        const money = accountData.money || accountData.Money || accountData.balance || 0;
        document.getElementById('account-money').textContent = this.formatNumber(money);
        
        const localID = accountData.localID || accountData.localId || accountData.local_id || '未知';
        document.getElementById('account-localid').textContent = localID;
        
        const statusBadge = document.getElementById('account-status');
        if (statusBadge) {
            statusBadge.textContent = '已登录';
            statusBadge.className = 'status-badge status-active';
        }
    }

    formatNumber(num) {
        return Number(num).toLocaleString('zh-CN');
    }

    // ========== 修复的登录函数 ==========
    async login() {
        console.log('🟢 登录按钮被点击！');
        
        // 检查用户是否有权限
        if (!this.currentUser || !this.currentUser.verified) {
            this.showStatus('error', '请先完成系统验证', 'login-status');
            return;
        }
        
        if (this.isProcessing) {
            this.showStatus('error', '请等待，另一个操作正在进行中', 'login-status');
            return;
        }

        const emailInput = document.getElementById('source-email');
        const passwordInput = document.getElementById('source-password');
        
        if (!emailInput || !passwordInput) {
            console.error('❌ 邮箱或密码输入框未找到');
            this.showStatus('error', '页面元素加载失败，请刷新页面', 'login-status');
            return;
        }

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            this.showStatus('error', '请输入邮箱和密码', 'login-status');
            return;
        }

        // 更宽松的邮箱验证
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showStatus('error', '请输入有效的邮箱地址', 'login-status');
            return;
        }

        if (password.length < 6) {
            this.showStatus('error', '密码长度至少为6位', 'login-status');
            return;
        }

        this.isProcessing = true;
        this.updateButtonState('login-btn', true, '验证中...');
        this.showStatus('info', '正在连接服务器...', 'login-status');
        this.addLog('正在登录CPM账号...');

        try {
            console.log('📡 发送登录请求到服务器:', email);
            this.updateStep(1);
            
            // 创建超时控制器
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(this.baseUrl + '/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    email: email,
                    password: password,
                    timestamp: Date.now() // 添加时间戳防止缓存
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            // 检查响应状态
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('📥 登录响应:', data);

            if (data.ok || data.success) {
                const authToken = data.auth || data.token || data.authToken;
                this.sourceAuth = authToken;
                this.sourceAccountInfo = null;
                
                if (authToken) {
                    localStorage.setItem('jbcacc_auth', authToken);
                }
                
                this.showStatus('success', '登录成功！正在获取账号信息...', 'login-status');
                this.hideElement('login-section');
                this.showElement('clone-section');
                this.showElement('account-info-section');
                this.updateProgress('登录成功', 25);
                this.addLog('✅ CPM账号登录成功');
                this.updateStep(2);
                
                // 验证并加载账户信息
                if (authToken) {
                    await this.verifyAndLoadAccount(authToken);
                } else if (data.data) {
                    // 如果直接返回了账户数据
                    this.sourceAccountInfo = data.data;
                    this.displayAccountInfo(data.data);
                    this.updateStep(2);
                }
                
                // 自动填充目标邮箱
                const targetEmailInput = document.getElementById('target-email');
                if (targetEmailInput && !targetEmailInput.value) {
                    targetEmailInput.value = email;
                    targetEmailInput.focus();
                }
                
            } else {
                let errorMsg = data.message || '登录失败，未知错误';
                
                // 处理各种错误码
                if (data.error === 100 || data.error === 'email_not_found') {
                    errorMsg = '邮箱未找到 - 请检查邮箱地址';
                } else if (data.error === 101 || data.error === 'wrong_password') {
                    errorMsg = '密码错误 - 请检查密码';
                } else if (data.error === 107 || data.error === 'invalid_email') {
                    errorMsg = '邮箱格式无效';
                } else if (data.error === 108 || data.error === 'email_required') {
                    errorMsg = '请输入邮箱';
                } else if (data.error === 106 || data.error === 'password_required') {
                    errorMsg = '请输入密码';
                } else if (data.error === 109 || data.error === 'account_locked') {
                    errorMsg = '账号已被锁定';
                } else if (data.error === 110 || data.error === 'too_many_attempts') {
                    errorMsg = '登录尝试次数过多，请稍后再试';
                } else if (data.error === 500 || data.error === 'server_error') {
                    errorMsg = '服务器内部错误，请稍后再试';
                }
                
                this.showStatus('error', `登录失败: ${errorMsg}`, 'login-status');
                this.addLog(`❌ CPM账号登录失败: ${errorMsg}`);
                
                if (data.error === 101 || data.error === 'wrong_password') {
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            }
        } catch (error) {
            console.error('❌ 登录错误:', error);
            
            let errorMessage = error.message;
            
            if (error.name === 'AbortError') {
                errorMessage = '请求超时，请检查网络连接或稍后再试';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage = '网络连接失败，请检查网络连接';
            } else if (error.message.includes('NetworkError')) {
                errorMessage = '网络错误，请检查网络连接';
            } else if (error.message.includes('CORS')) {
                errorMessage = '跨域请求被阻止，请检查服务器配置';
            }
            
            this.showStatus('error', `登录失败: ${errorMessage}`, 'login-status');
            this.addLog(`❌ 登录错误: ${errorMessage}`);
        } finally {
            this.isProcessing = false;
            this.updateButtonState('login-btn', false, '登录并验证账号');
        }
    }

    logoutCPM() {
        this.sourceAuth = null;
        this.sourceAccountInfo = null;
        localStorage.removeItem('jbcacc_auth');
        
        this.showElement('login-section');
        this.hideElement('clone-section');
        this.hideElement('account-info-section');
        
        const emailInput = document.getElementById('source-email');
        const passwordInput = document.getElementById('source-password');
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        
        document.getElementById('account-name').textContent = '--';
        document.getElementById('account-money').textContent = '--';
        document.getElementById('account-cars').textContent = '--';
        document.getElementById('account-localid').textContent = '--';
        
        const statusBadge = document.getElementById('account-status');
        if (statusBadge) {
            statusBadge.textContent = '未登录';
            statusBadge.className = 'status-badge';
        }
        
        this.showStatus('info', '已退出CPM账号登录', 'login-status');
        this.addLog('已退出CPM账号登录');
        this.updateStep(1);
    }

    // ========== 修复的克隆函数 ==========
    async cloneAccount() {
        console.log('🟢 克隆按钮被点击！');
        
        // 检查用户是否有权限
        if (!this.currentUser || !this.currentUser.verified) {
            this.showStatus('error', '请先完成系统验证', 'clone-status');
            return;
        }
        
        // 检查小时卡用户是否尝试使用克隆功能
        if (this.currentUser.cardType === 'hour') {
            const operationType = document.querySelector('input[name="operation-type"]:checked');
            if (operationType && operationType.value === 'clone-to-new') {
                this.showStatus('error', '小时卡用户无法使用克隆功能', 'clone-status');
                return;
            }
        }

        if (this.isProcessing) {
            this.showStatus('error', '请等待，另一个操作正在进行中', 'clone-status');
            return;
        }

        if (!this.sourceAuth) {
            this.showStatus('error', '请先登录源账号', 'clone-status');
            this.addLog('❌ 未找到CPM认证令牌');
            return;
        }

        const operationType = document.querySelector('input[name="operation-type"]:checked');
        if (!operationType) {
            this.showStatus('error', '请选择操作类型', 'clone-status');
            return;
        }

        const customLocalId = document.getElementById('custom-localid').value.trim();
        
        if (!customLocalId) {
            this.showStatus('error', '请输入自定义的Local ID', 'clone-status');
            return;
        }

        if (operationType.value === 'clone-to-new') {
            await this.cloneToNewAccount(customLocalId);
        } else if (operationType.value === 'modify-id') {
            await this.modifyCurrentAccountId(customLocalId);
        }
    }

    async cloneToNewAccount(customLocalId) {
        const targetEmailInput = document.getElementById('target-email');
        const targetPasswordInput = document.getElementById('target-password');
        
        if (!targetEmailInput || !targetPasswordInput) {
            console.error('❌ 目标邮箱或密码输入框未找到');
            this.showStatus('error', '页面元素加载失败，请刷新页面', 'clone-status');
            return;
        }

        const targetEmail = targetEmailInput.value.trim();
        const targetPassword = targetPasswordInput.value;

        if (!targetEmail || !targetPassword) {
            this.showStatus('error', '请输入目标账号的凭据', 'clone-status');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(targetEmail)) {
            this.showStatus('error', '请输入有效的目标邮箱地址', 'clone-status');
            return;
        }

        if (targetPassword.length < 6) {
            this.showStatus('error', '目标账号密码长度至少为6位', 'clone-status');
            return;
        }

        const confirmMessage = `⚠️ 警告：这将完全覆盖目标账号的所有数据！\n\n` +
                              `目标账号: ${targetEmail}\n` +
                              `新Local ID: ${customLocalId}\n\n` +
                              `源账号车辆: ${document.getElementById('account-cars').textContent} 辆\n` +
                              `源账号金币: ${document.getElementById('account-money').textContent}\n\n` +
                              `你确定要继续吗？`;
        
        if (!confirm(confirmMessage)) {
            this.addLog('❌ 用户取消操作');
            return;
        }

        this.isProcessing = true;
        this.startTime = Date.now();
        this.updateButtonState('clone-btn', true, '克隆中...');
        this.clearStatusLog();
        this.updateProgress('开始克隆流程...', 5);
        this.updateTimeEstimate();
        this.addLog('开始克隆到新账号...');
        this.addLog(`新Local ID: ${customLocalId}`);
        this.updateStep(3);

        this.cloneTimeout = setTimeout(() => {
            if (this.isProcessing) {
                this.addLog('⚠ 克隆请求超时，但可能仍在后台处理中...');
                this.updateTimeEstimate('超时，但可能仍在处理');
            }
        }, 120000);

        try {
            this.addLog('1. 正在向服务器发送克隆请求...');
            this.updateProgress('正在发送请求到服务器...', 10);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);
            
            const response = await fetch(this.baseUrl + '/api/clone-account', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sourceAuth: this.sourceAuth,
                    targetEmail: targetEmail,
                    targetPassword: targetPassword,
                    customLocalId: customLocalId,
                    timestamp: Date.now()
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            this.updateProgress('正在处理克隆请求...', 30);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📥 克隆响应:', data);

            clearTimeout(this.cloneTimeout);

            if (data.ok || data.success) {
                const elapsedTime = Math.round((Date.now() - this.startTime) / 1000);
                this.updateProgress('克隆完成！', 100);
                this.addLog('✅ 克隆成功！');
                this.addLog(`目标账号: ${targetEmail}`);
                this.addLog(`新Local ID: ${customLocalId}`);
                this.addLog(`已克隆车辆: ${data.details?.carsCloned || data.carsCloned || '未知'} 辆`);
                this.addLog(`总耗时: ${elapsedTime} 秒`);
                this.showStatus('success', `账号克隆成功！耗时 ${elapsedTime} 秒`, 'clone-status');
                this.updateTimeEstimate('已完成');
                
                this.showSuccessAnimation();
                
                targetEmailInput.value = '';
                targetPasswordInput.value = '';
                document.getElementById('custom-localid').value = '';
                
                this.addLog('5秒后刷新页面...');
                setTimeout(() => {
                    window.location.reload();
                }, 5000);
            } else {
                let errorMsg = data.message || '克隆失败，未知错误';
                if (data.error === 100) errorMsg = '目标账号邮箱未找到';
                if (data.error === 101) errorMsg = '目标账号密码错误';
                if (data.error === 400) errorMsg = '缺少必要参数';
                if (data.error === 401) errorMsg = '认证失败';
                if (data.error === 500) errorMsg = '克隆过程中服务器错误';
                
                throw new Error(errorMsg);
            }

        } catch (error) {
            clearTimeout(this.cloneTimeout);
            console.error('❌ 克隆错误:', error);
            
            if (error.name === 'AbortError') {
                this.addLog('⚠ 请求超时，但克隆可能仍在后台进行中');
                this.addLog('⚠ 请等待几分钟后检查目标账号');
                this.showStatus('warning', '请求超时，但克隆可能仍在后台进行中。请稍后检查目标账号。', 'clone-status');
            } else {
                this.addLog(`❌ 错误: ${error.message}`);
                this.showStatus('error', `克隆失败: ${error.message}`, 'clone-status');
            }
            
            this.updateProgress('克隆中断', 0);
            this.updateTimeEstimate('已中断');
            this.showErrorAnimation();
        } finally {
            this.isProcessing = false;
            this.updateButtonState('clone-btn', false, '开始克隆');
        }
    }

    async modifyCurrentAccountId(customLocalId) {
        const currentLocalId = document.getElementById('account-localid').textContent;
        const confirmMessage = `⚠️ 确认修改当前账号Local ID？\n\n` +
                              `当前Local ID: ${currentLocalId}\n` +
                              `新的Local ID: ${customLocalId}\n\n` +
                              `此操作会更新所有车辆数据中的Local ID引用。`;
        
        if (!confirm(confirmMessage)) {
            this.addLog('❌ 用户取消操作');
            return;
        }

        this.isProcessing = true;
        this.startTime = Date.now();
        this.updateButtonState('clone-btn', true, '修改中...');
        this.clearStatusLog();
        this.updateProgress('开始修改ID流程...', 5);
        this.updateTimeEstimate();
        this.addLog('开始修改当前账号ID...');
        this.addLog(`新Local ID: ${customLocalId}`);
        this.updateStep(3);

        this.cloneTimeout = setTimeout(() => {
            if (this.isProcessing) {
                this.addLog('⚠ 修改请求超时，但可能仍在后台处理中...');
                this.updateTimeEstimate('超时，但可能仍在处理');
            }
        }, 120000);

        try {
            this.addLog('1. 正在向服务器发送修改请求...');
            this.updateProgress('正在发送请求到服务器...', 10);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);
            
            const response = await fetch(this.baseUrl + '/api/change-localid', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    authToken: this.sourceAuth,
                    newLocalId: customLocalId,
                    timestamp: Date.now()
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            this.updateProgress('正在处理修改请求...', 30);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📥 修改响应:', data);

            clearTimeout(this.cloneTimeout);

            if (data.ok || data.success) {
                const elapsedTime = Math.round((Date.now() - this.startTime) / 1000);
                this.updateProgress('修改完成！', 100);
                this.addLog('✅ ID修改成功！');
                this.addLog(`旧Local ID: ${currentLocalId}`);
                this.addLog(`新Local ID: ${customLocalId}`);
                this.addLog(`更新车辆: ${data.details?.carsUpdated || data.carsUpdated || '未知'} 辆`);
                this.addLog(`总耗时: ${elapsedTime} 秒`);
                this.showStatus('success', `ID修改成功！耗时 ${elapsedTime} 秒`, 'clone-status');
                this.updateTimeEstimate('已完成');
                
                this.showSuccessAnimation();
                
                document.getElementById('account-localid').textContent = customLocalId;
                document.getElementById('custom-localid').value = '';
                
                this.addLog('5秒后刷新页面...');
                setTimeout(() => {
                    window.location.reload();
                }, 5000);
            } else {
                let errorMsg = data.message || '修改失败，未知错误';
                throw new Error(errorMsg);
            }

        } catch (error) {
            clearTimeout(this.cloneTimeout);
            console.error('❌ 修改错误:', error);
            
            this.addLog(`❌ 错误: ${error.message}`);
            this.showStatus('error', `修改失败: ${error.message}`, 'clone-status');
            
            this.updateProgress('修改中断', 0);
            this.updateTimeEstimate('已中断');
            this.showErrorAnimation();
        } finally {
            this.isProcessing = false;
            this.updateButtonState('clone-btn', false, '修改当前账号ID');
        }
    }

    updateTimeEstimate(text) {
        const timeEstimate = document.getElementById('time-estimate');
        if (!timeEstimate) return;
        
        if (text) {
            timeEstimate.textContent = `预计时间: ${text}`;
        } else if (this.startTime && this.isProcessing) {
            const elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            timeEstimate.textContent = `已用时: ${minutes}分${seconds}秒`;
        }
    }

    showSuccessAnimation() {
        try {
            const successDiv = document.createElement('div');
            successDiv.innerHTML = '✅';
            successDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 80px;
                color: #22c55e;
                z-index: 1000;
                animation: successPulse 1.5s ease-out;
            `;
            
            const style = document.createElement('style');
            style.textContent = `
                @keyframes successPulse {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
                    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
                }
            `;
            
            document.head.appendChild(style);
            document.body.appendChild(successDiv);
            
            setTimeout(() => {
                document.body.removeChild(successDiv);
            }, 1500);
        } catch (e) {
            console.log('无法显示成功动画');
        }
    }

    showErrorAnimation() {
        try {
            const errorDiv = document.createElement('div');
            errorDiv.innerHTML = '❌';
            errorDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 80px;
                color: #ef4444;
                z-index: 1000;
                animation: errorShake 0.5s ease-out;
            `;
            
            const style = document.createElement('style');
            style.textContent = `
                @keyframes errorShake {
                    0%, 100% { transform: translate(-50%, -50%) translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translate(-50%, -50%) translateX(-5px); }
                    20%, 40%, 60%, 80% { transform: translate(-50%, -50%) translateX(5px); }
                }
            `;
            
            document.head.appendChild(style);
            document.body.appendChild(errorDiv);
            
            setTimeout(() => {
                document.body.removeChild(errorDiv);
            }, 1000);
        } catch (e) {
            console.log('无法显示错误动画');
        }
    }

    showStatus(type, message, elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.error(`未找到元素: ${elementId}`);
            return;
        }
        
        element.textContent = message;
        element.className = `status ${type}`;
        element.style.display = 'block';
        
        console.log(`${type.toUpperCase()}: ${message}`);
        
        if (type === 'success') {
            setTimeout(() => {
                element.style.display = 'none';
            }, 8000);
        }
    }

    addLog(message) {
        const logContainer = document.getElementById('status-log');
        if (!logContainer) {
            console.log('日志:', message);
            return;
        }
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        let iconClass = 'fa-info-circle';
        if (message.startsWith('✅') || message.includes('成功')) iconClass = 'fa-check-circle';
        else if (message.startsWith('❌') || message.includes('失败')) iconClass = 'fa-times-circle';
        else if (message.startsWith('⚠')) iconClass = 'fa-exclamation-triangle';
        else if (/^\d+\./.test(message)) iconClass = 'fa-arrow-right';
        
        logEntry.innerHTML = `<i class="fas ${iconClass}"></i> ${message}`;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        console.log('📝 日志:', message);
        
        if (this.isProcessing) {
            this.updateTimeEstimate();
        }
    }

    clearStatusLog() {
        const logContainer = document.getElementById('status-log');
        if (logContainer) {
            logContainer.innerHTML = '<div class="log-entry"><i class="fas fa-info-circle"></i> 系统已就绪</div>';
        }
    }

    updateProgress(message, percentage) {
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.style.transition = 'width 0.5s ease';
        }
        
        if (progressText) {
            progressText.textContent = message;
            progressText.style.fontWeight = 'bold';
        }
    }

    updateButtonState(buttonId, disabled, text) {
        const button = document.getElementById(buttonId);
        if (!button) {
            console.error(`未找到按钮: ${buttonId}`);
            return;
        }
        
        button.disabled = disabled;
        if (disabled) {
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
            button.style.opacity = '0.7';
            button.style.cursor = 'not-allowed';
        } else {
            const icon = buttonId === 'login-btn' ? 'fa-key' : 
                        buttonId === 'clone-btn' ? 'fa-clone' : 'fa-sign-out-alt';
            button.innerHTML = `<i class="fas ${icon}"></i> ${text}`;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    }

    hideElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('hidden');
            element.style.display = 'none';
        }
    }

    showElement(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('hidden');
            element.style.display = 'block';
        }
    }
}

// ========== 全局初始化函数 ==========
window.initCPMClone = function(userInfo) {
    console.log('🚀 初始化CPM克隆工具，用户信息:', userInfo);
    
    try {
        window.cpmcyCloneApp = new cpmcylone();
        window.cpmcyCloneApp.init(userInfo);
        console.log('✅ cpmcy Clone应用初始化成功');
        
        // 添加步骤指示器样式
        const style = document.createElement('style');
        style.textContent = `
            .step-indicator {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 30px 0;
                position: relative;
            }
            
            .step-indicator::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 10%;
                right: 10%;
                height: 4px;
                background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
                z-index: 1;
                transform: translateY(-50%);
            }
            
            .step {
                display: flex;
                flex-direction: column;
                align-items: center;
                position: relative;
                z-index: 2;
                flex: 1;
            }
            
            .step-number {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: white;
                border: 3px solid #3b82f6;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                color: #3b82f6;
                margin-bottom: 10px;
                transition: all 0.3s ease;
            }
            
            .step.active .step-number {
                background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
                color: white;
                border-color: transparent;
                box-shadow: 0 5px 15px rgba(59, 130, 246, 0.3);
                transform: scale(1.1);
            }
            
            .step.completed .step-number {
                background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
                color: white;
                border-color: transparent;
            }
            
            .step-text {
                font-size: 0.9rem;
                font-weight: 600;
                color: #93c5fd;
                text-align: center;
                transition: all 0.3s ease;
            }
            
            .step.active .step-text {
                color: #60a5fa;
                font-weight: 700;
            }
            
            .step.completed .step-text {
                color: #10b981;
            }
            
            .status {
                padding: 15px;
                border-radius: 15px;
                margin-top: 15px;
                font-weight: 600;
                display: none;
            }
            
            .status.success {
                background: rgba(34, 197, 94, 0.1);
                border: 1px solid rgba(34, 197, 94, 0.3);
                color: #22c55e;
            }
            
            .status.error {
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.3);
                color: #ef4444;
            }
            
            .status.info {
                background: rgba(59, 130, 246, 0.1);
                border: 1px solid rgba(59, 130, 246, 0.3);
                color: #3b82f6;
            }
            
            .status.warning {
                background: rgba(245, 158, 11, 0.1);
                border: 1px solid rgba(245, 158, 11, 0.3);
                color: #f59e0b;
            }
            
            /* 管理员专属功能样式 */
            .admin-only {
                display: none !important;
                opacity: 0.7;
                border-left: 3px solid #ef4444;
                padding-left: 10px;
                margin: 10px 0;
            }
            
            .admin-label {
                background: #ef4444;
                color: white;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 0.8em;
                margin-left: 5px;
            }
        `;
        document.head.appendChild(style);
        
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ef4444;
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 10000;
            max-width: 500px;
            text-align: center;
        `;
        errorDiv.innerHTML = `
            <strong>应用错误</strong><br>
            CPM克隆工具初始化失败，请刷新页面。<br>
            <small>错误: ${error.message}</small>
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            document.body.removeChild(errorDiv);
        }, 10000);
    }
};

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cpmcylone, initCPMClone };
}
