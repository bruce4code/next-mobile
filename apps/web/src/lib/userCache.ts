import { User } from '@supabase/supabase-js'

interface CachedUser {
  user: User
  timestamp: number
  expiresIn: number // 缓存过期时间（毫秒）
}

const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

export const userCache = {
  // 获取缓存的用户信息
  get(): User | null {
    try {
      const cached = localStorage.getItem('cached_user')
      if (!cached) return null

      const data: CachedUser = JSON.parse(cached)
      const now = Date.now()

      // 检查是否过期
      if (now - data.timestamp > data.expiresIn) {
        localStorage.removeItem('cached_user')
        return null
      }

      return data.user
    } catch (error) {
      console.error('Error reading cached user:', error)
      localStorage.removeItem('cached_user')
      return null
    }
  },

  // 设置用户缓存
  set(user: User): void {
    try {
      const data: CachedUser = {
        user,
        timestamp: Date.now(),
        expiresIn: CACHE_DURATION
      }
      localStorage.setItem('cached_user', JSON.stringify(data))
    } catch (error) {
      console.error('Error setting cached user:', error)
    }
  },

  // 清除缓存
  clear(): void {
    localStorage.removeItem('cached_user')
  },

  // 检查缓存是否有效
  isValid(): boolean {
    return this.get() !== null
  }
} 