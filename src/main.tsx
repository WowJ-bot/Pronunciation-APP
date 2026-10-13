import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from '@/App'
import { AuthProvider } from '@/contexts/AuthContext'
import { captureAuthRedirectError } from '@/utils/authRedirectError'
import { registerServiceWorker } from '@/utils/pwa'
import '@/index.css'

// 必须在渲染前：读走邮件链接带回的错误并把 hash 清掉，
// 否则路由守卫一跳转，这段信息就丢了
captureAuthRedirectError()

// 生产构建里注册离线外壳；开发时不注册，避免干扰热更新
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
