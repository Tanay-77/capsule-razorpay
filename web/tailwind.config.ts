import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#11120f',
        paper: '#f4f1e8',
        signal: '#ff5c35',
        moss: '#4b6544',
      },
      boxShadow: {
        card: '0 24px 80px rgba(17, 18, 15, 0.10)',
      },
    },
  },
  plugins: [],
};

export default config;
