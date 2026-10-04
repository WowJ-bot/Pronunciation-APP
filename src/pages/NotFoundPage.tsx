import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">页面不存在</h1>
      <p className="mt-1 text-sm text-slate-500">链接可能已失效，或者你输错了地址。</p>
      <Link to="/" className="mt-6">
        <Button>回到首页</Button>
      </Link>
    </div>
  )
}
