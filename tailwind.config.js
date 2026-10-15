/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        discord: {
          darkest: '#1e1f22',
          sidebar: '#2b2d31',
          main: '#313338',
          card: '#2b2d31',
          hover: '#35373c',
          input: '#1e1f22',
          border: '#383a40',
          borderSubtle: '#2e3035',
          text: '#dbdee1',
          header: '#f2f3f5',
          muted: '#949ba4',
        }
      }
    },
  },
  plugins: [],
}
