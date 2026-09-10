import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { subscribeToAppointmentChanges } from './phase2'
import { subscribeToChatMessages } from './phase3'
import { subscribeToRealtimeChannel } from './realtime'
import { supabase } from './supabase'

jest.mock('./supabase', () => ({ supabase: { channel: jest.fn(), removeChannel: jest.fn() } }))

const mockSupabase = supabase as unknown as {
  channel: jest.Mock
  removeChannel: jest.Mock
}

type Binding = {
  type: string
  filter: Record<string, string>
  callback: (payload: { new: Record<string, string> }) => void
}

class FakeChannel {
  readonly bindings: Binding[] = []
  subscribed = false

  constructor(readonly topic: string) {}

  on(type: string, filter: Record<string, string>, callback: Binding['callback']): this {
    if (this.subscribed) throw new Error(`cannot add callbacks for ${this.topic} after subscribe()`)
    this.bindings.push({ type, filter, callback })
    return this
  }

  subscribe(): this {
    this.subscribed = true
    return this
  }
}

function createReusingClient(removeChannel = jest.fn().mockResolvedValue('ok')) {
  const channels = new Map<string, FakeChannel>()
  const channel = jest.fn((topic: string) => {
    const existing = channels.get(topic)
    if (existing) return existing
    const created = new FakeChannel(topic)
    channels.set(topic, created)
    return created
  })
  return {
    channels,
    client: { channel, removeChannel } as unknown as SupabaseClient,
    channel,
    removeChannel,
  }
}

describe('realtime subscription lifecycle', () => {
  const originalDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE

  afterEach(() => {
    if (originalDemoMode === undefined) delete process.env.EXPO_PUBLIC_DEMO_MODE
    else process.env.EXPO_PUBLIC_DEMO_MODE = originalDemoMode
    jest.clearAllMocks()
  })

  it('isolates simultaneous consumers while preserving their callbacks', () => {
    const { client, channel, channels } = createReusingClient()
    const firstCallback = jest.fn()
    const secondCallback = jest.fn()

    const firstCleanup = subscribeToRealtimeChannel(client, 'schedule:dentist-1', (value) => value
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, firstCallback))
    const secondCleanup = subscribeToRealtimeChannel(client, 'schedule:dentist-1', (value) => value
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, secondCallback))

    expect(channel).toHaveBeenCalledTimes(2)
    expect(channel.mock.calls[0]?.[0]).not.toBe(channel.mock.calls[1]?.[0])
    expect(channels.size).toBe(2)
    for (const value of channels.values()) {
      value.bindings[0]?.callback({ new: {} })
    }
    expect(firstCallback).toHaveBeenCalledTimes(1)
    expect(secondCallback).toHaveBeenCalledTimes(1)

    firstCleanup()
    secondCleanup()
  })

  it('can resubscribe before asynchronous channel removal finishes', async () => {
    let finishRemoval: ((status: string) => void) | undefined
    const pendingRemoval = new Promise<string>((resolve) => { finishRemoval = resolve })
    const removeChannel = jest.fn().mockReturnValue(pendingRemoval)
    const { client, channel } = createReusingClient(removeChannel)

    const cleanup = subscribeToRealtimeChannel(client, 'chat:thread-1', (value) => value
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, jest.fn()))
    cleanup()

    expect(() => subscribeToRealtimeChannel(client, 'chat:thread-1', (value) => value
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, jest.fn()))).not.toThrow()
    expect(channel.mock.calls[0]?.[0]).not.toBe(channel.mock.calls[1]?.[0])

    finishRemoval?.('ok')
    await pendingRemoval
  })

  it('removes exactly the subscribed channel and makes cleanup idempotent', () => {
    const { client, channels, removeChannel } = createReusingClient()
    const cleanup = subscribeToRealtimeChannel(client, 'schedule:dentist-2', (value) => value
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_holds' }, jest.fn()))
    const [subscribedChannel] = channels.values()

    cleanup()
    cleanup()

    expect(removeChannel).toHaveBeenCalledTimes(1)
    expect(removeChannel).toHaveBeenCalledWith(subscribedChannel)
  })

  it('does not create schedule or chat channels in explicit demo mode', () => {
    process.env.EXPO_PUBLIC_DEMO_MODE = 'true'

    const scheduleCleanup = subscribeToAppointmentChanges('20000000-0000-4000-8000-000000000002', jest.fn())
    const chatCleanup = subscribeToChatMessages('70000000-0000-4000-8000-000000000001', jest.fn())
    scheduleCleanup()
    chatCleanup()

    expect(mockSupabase.channel).not.toHaveBeenCalled()
    expect(mockSupabase.removeChannel).not.toHaveBeenCalled()
  })

  it('keeps the schedule and chat filters and payload mapping intact', () => {
    process.env.EXPO_PUBLIC_DEMO_MODE = 'false'
    const created: FakeChannel[] = []
    mockSupabase.channel.mockImplementation((topic: string) => {
      const channel = new FakeChannel(topic)
      created.push(channel)
      return channel as unknown as RealtimeChannel
    })
    mockSupabase.removeChannel.mockResolvedValue('ok')
    const scheduleChange = jest.fn()
    const chatMessage = jest.fn()

    const scheduleCleanup = subscribeToAppointmentChanges('dentist-9', scheduleChange)
    const chatCleanup = subscribeToChatMessages('thread-4', chatMessage)

    expect(created[0]?.bindings.map(({ filter }) => filter)).toEqual([
      { event: '*', schema: 'public', table: 'appointments', filter: 'dentist_id=eq.dentist-9' },
      { event: '*', schema: 'public', table: 'appointment_holds', filter: 'dentist_id=eq.dentist-9' },
    ])
    expect(created[1]?.bindings[0]?.filter).toEqual({ event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'thread_id=eq.thread-4' })

    created[0]?.bindings[0]?.callback({ new: {} })
    created[1]?.bindings[0]?.callback({ new: { id: 'message-1', sender_id: 'user-2', body: 'Hello', created_at: '2026-09-10T00:00:00Z' } })
    expect(scheduleChange).toHaveBeenCalledTimes(1)
    expect(chatMessage).toHaveBeenCalledWith({ id: 'message-1', senderId: 'user-2', body: 'Hello', createdAt: '2026-09-10T00:00:00Z' })

    scheduleCleanup()
    chatCleanup()
  })
})
