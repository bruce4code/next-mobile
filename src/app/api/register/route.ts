import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const { userId, email } = await request.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'User ID and email are required' }, { status: 400 })
    }

    await prisma.user.create({
      data: {
        id: userId,
        email: email,
      },
    })

    return NextResponse.json({ message: 'User data synced successfully' }, { status: 200 })
  } catch (error) {
    console.error('Error syncing user data:', error)
    return NextResponse.json({ error: 'Failed to sync user data' }, { status: 500 })
  }
}