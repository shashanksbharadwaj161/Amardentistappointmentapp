import { AppState, type AppStateStatus } from 'react-native'
import { subscribeToAccessRefresh } from './access-refresh'

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })

it('refreshes every thirty seconds and on foreground, and cleans up', () => {
  jest.useFakeTimers()
  let onChange!: (state: AppStateStatus) => void
  const remove = jest.fn()
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { onChange = callback; return { remove } })
  const refresh = jest.fn()
  const stop = subscribeToAccessRefresh(refresh)
  jest.advanceTimersByTime(30_000)
  expect(refresh).toHaveBeenCalledTimes(1)
  onChange('background')
  expect(refresh).toHaveBeenCalledTimes(1)
  onChange('active')
  expect(refresh).toHaveBeenCalledTimes(2)
  stop(); jest.advanceTimersByTime(30_000)
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(remove).toHaveBeenCalledTimes(1)
})
