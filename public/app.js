const authToken = localStorage.getItem('authToken');
if (!authToken) {
  window.location.href = 'index.html';
}

// 页面加载时获取账号信息
window.onload = async () => {
  await fetchAccountInfo().catch(err => {
    showMessage('页面加载时获取账号信息失败，可手动刷新', 'error');
  });
};

// 打开弹窗
function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

// 关闭所有弹窗
function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.style.display = 'none';
  });
}

// 显示消息提示
function showMessage(text, type) {
  const message = document.getElementById('message');
  message.textContent = text;
  message.className = `message ${type}`;
  message.style.display = 'block';
  setTimeout(() => {
    message.style.display = 'none';
  }, 3000);
}

// 获取账号信息
async function fetchAccountInfo() {
  try {
    const response = await fetch('/api/account-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authToken })
    });
    const data = await response.json();
    if (data.ok) {
      document.getElementById('email').textContent = data.data.email || '未设置';
      document.getElementById('localId').textContent = data.data.localId || '未获取';
      document.getElementById('nickname').textContent = data.data.nickname || '未设置';
      document.getElementById('gold').textContent = data.data.gold || 0;
      document.getElementById('money').textContent = data.data.money || 0;
      document.getElementById('carCount').textContent = data.data.carCount || 0;
    } else {
      showMessage('获取账号信息失败: ' + data.message, 'error');
    }
  } catch (error) {
    throw new Error('网络错误: ' + error.message);
  }
}

// 修改LocalID
async function modifyLocalId() {
  const customLocalId = document.getElementById('customLocalIdInput').value.trim();
  if (!customLocalId) {
    showMessage('请输入自定义LocalID', 'error');
    return;
  }
  try {
    const response = await fetch('/api/modify-localid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authToken, customLocalId })
    });
    const data = await response.json();
    if (data.ok) {
      showMessage(`LocalID修改成功！新ID: ${data.newLocalId}`, 'success');
      closeAllModals();
      // 刷新信息（失败不影响修改结果）
      fetchAccountInfo().catch(err => {
        showMessage('修改成功，但刷新账号信息失败', 'warning');
      });
    } else {
      showMessage('修改失败: ' + data.message, 'error');
    }
  } catch (error) {
    showMessage('网络错误: ' + error.message, 'error');
  }
}

// 克隆账号表单提交
document.getElementById('cloneForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const targetEmail = document.getElementById('targetEmail').value.trim();
  const targetPassword = document.getElementById('targetPassword').value;
  if (!targetEmail || !targetPassword) {
    showMessage('请输入目标账号邮箱和密码', 'error');
    return;
  }
  if (!confirm('⚠️ 确认克隆到已注册账号？会覆盖目标账号所有数据！')) {
    return;
  }
  try {
    const response = await fetch('/api/clone-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceAuth: authToken,
        targetEmail,
        targetPassword
      })
    });
    const data = await response.json();
    if (data.ok) {
      showMessage(`克隆成功！目标账号: ${data.targetEmail}，克隆车辆数: ${data.carsCloned}`, 'success');
      closeAllModals();
      document.getElementById('cloneForm').reset();
    } else {
      showMessage('克隆失败: ' + data.message, 'error');
    }
  } catch (error) {
    showMessage('网络错误: ' + error.message, 'error');
  }
});

// 修改金币表单提交（修复前端报错：优化错误处理）
document.getElementById('goldForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const goldAmount = document.getElementById('goldAmount').value.trim();
  if (!goldAmount) {
    showMessage('请输入金币数量', 'error');
    return;
  }
  try {
    const response = await fetch('/api/modify-gold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authToken, goldAmount })
    });
    const data = await response.json();
    if (data.ok) {
      showMessage(`金币修改成功！当前金币: ${data.goldAmount}`, 'success');
      closeAllModals();
      // 刷新信息（失败不覆盖成功消息）
      fetchAccountInfo().catch(err => {
        showMessage('金币修改成功，但刷新账号信息失败', 'warning');
      });
      document.getElementById('goldForm').reset();
    } else {
      showMessage('修改失败: ' + data.message, 'error');
    }
  } catch (error) {
    showMessage('网络错误: ' + error.message, 'error');
  }
});

// 修改绿钞表单提交（修复前端报错：优化错误处理）
document.getElementById('moneyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const moneyAmount = document.getElementById('moneyAmount').value.trim();
  if (!moneyAmount) {
    showMessage('请输入绿钞数量', 'error');
    return;
  }
  try {
    const response = await fetch('/api/modify-money', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authToken, moneyAmount })
    });
    const data = await response.json();
    if (data.ok) {
      showMessage(`绿钞修改成功！当前绿钞: ${data.moneyAmount}`, 'success');
      closeAllModals();
      // 刷新信息（失败不覆盖成功消息）
      fetchAccountInfo().catch(err => {
        showMessage('绿钞修改成功，但刷新账号信息失败', 'warning');
      });
      document.getElementById('moneyForm').reset();
    } else {
      showMessage('修改失败: ' + data.message, 'error');
    }
  } catch (error) {
    showMessage('网络错误: ' + error.message, 'error');
  }
});

// 点击空白处关闭弹窗
window.onclick = (e) => {
  if (e.target.classList.contains('modal')) {
    closeAllModals();
  }
};
