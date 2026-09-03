import { fireEvent, render, screen } from '@testing-library/react-native'
import { Button } from './Button'

describe('Button', () => {
  it('exposes an accessible label and handles activation', async () => {
    const onPress = jest.fn()
    await render(<Button label="Continue" onPress={onPress} />)

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('prevents activation while loading', async () => {
    const onPress = jest.fn()
    await render(<Button label="Continue" loading onPress={onPress} />)

    const button = screen.getByRole('button')
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
  })
})
