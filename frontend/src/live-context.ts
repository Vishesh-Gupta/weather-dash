import { createContext, use } from 'react'

import type { LiveStatus } from './lib/live'

export const LiveContext = createContext<LiveStatus>('connecting')

export const useLiveStatus = () => use(LiveContext)
