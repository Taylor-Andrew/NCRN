import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import type { ThemeDefinition } from 'vuetify'
import '@mdi/font/css/materialdesignicons.css'

const lightTheme: ThemeDefinition = {
  dark: false,
  colors: {
    primary: '#1976D2',
    secondary: '#424242',
  },
}

const darkTheme: ThemeDefinition = {
  dark: true,
  colors: {
    primary: '#2196F3',
  },
}

// Component and directive registration is handled by vite-plugin-vuetify
// with autoImport: true — no need to import them manually here.
export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: { light: lightTheme, dark: darkTheme },
  },
  icons: {
    defaultSet: 'mdi',
  },
})
