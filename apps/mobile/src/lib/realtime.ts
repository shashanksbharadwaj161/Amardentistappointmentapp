import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

type RealtimeClient = Pick<SupabaseClient, 'channel' | 'removeChannel'>

const clientInstanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
let subscriptionSequence = 0

function uniqueChannelTopic(topic: string): string {
  subscriptionSequence += 1
  return `${topic}:${clientInstanceId}:${subscriptionSequence}`
}

export function isExplicitDemoMode(): boolean {
  return process.env.EXPO_PUBLIC_DEMO_MODE === 'true'
}

export function subscribeToRealtimeChannel(
  client: RealtimeClient,
  topic: string,
  registerCallbacks: (channel: RealtimeChannel) => RealtimeChannel,
): () => void {
  const channel = registerCallbacks(client.channel(uniqueChannelTopic(topic)))
  channel.subscribe()

  let removed = false
  return () => {
    if (removed) return
    removed = true
    void client.removeChannel(channel).catch(() => undefined)
  }
}
