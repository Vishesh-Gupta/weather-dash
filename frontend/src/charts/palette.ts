// Validated categorical palette (fixed order, never cycled) with steps chosen per
// surface. Series keep their color everywhere: temperature is always slot 1.
export interface ChartPalette {
  series1: string
  series2: string
  series3: string
  band: string
}

export const palettes: Record<'light' | 'dark', ChartPalette> = {
  light: { series1: '#2a78d6', series2: '#eb6834', series3: '#1baf7a', band: '#2a78d6' },
  dark: { series1: '#3987e5', series2: '#d95926', series3: '#199e70', band: '#3987e5' },
}
