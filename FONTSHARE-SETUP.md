# Fontshare Premium Fonts Setup

Premium fonts for your YouTube channels. **100% free, lifetime commercial rights, no subscription lock-in.**

## Fonts included

| Font | Use | License |
|------|-----|---------|
| Satoshi | PayRanked body text | Free, lifetime commercial |
| Clash Display | Display/ranking numbers | Free, lifetime commercial |
| General Sans | Quiz body text | Free, lifetime commercial |
| Cabinet Grotesk | Quiz headings | Free, lifetime commercial |
| Plus Jakarta Sans | Headings (Google) | OFL, lifetime commercial |
| JetBrains Mono | Numbers (Google) | OFL, lifetime commercial |

## Setup

1. Install Google Fonts package:
   ```bash
   npm install @remotion/google-fonts
   ```

2. Import in your root composition:
   ```tsx
   import "./fontshare/load-fonts";
   ```

3. Use fonts in components:
   ```tsx
   import { PAYRANKED_FONTS, QUIZ_FONTS } from "./fontshare/load-fonts";
   
   <div style={{ fontFamily: PAYRANKED_FONTS.body }}>Body text</div>
   <div style={{ fontFamily: PAYRANKED_FONTS.numbers }}>$78,400</div>
   <div style={{ fontFamily: PAYRANKED_FONTS.display }}>#1</div>
   ```

## Font files location

```
public/fonts/fontshare/
├── satoshi/
│   ├── Satoshi-Variable.woff2
│   └── Satoshi-VariableItalic.woff2
├── clash-display/
│   └── ClashDisplay-Variable.woff2
├── general-sans/
│   ├── GeneralSans-Variable.woff2
│   └── GeneralSans-VariableItalic.woff2
└── cabinet-grotesk/
    ├── CabinetGrotesk-Variable.woff2
    ├── CabinetGrotesk-Extrabold.woff2
    └── CabinetGrotesk-Black.woff2
```

## Why Fontshare, not Adobe Fonts

Adobe Fonts lock you into a $20+/month subscription forever. If you cancel, you can't make new videos. Fontshare gives you the same premium quality with **lifetime rights** — zero subscription risk.

Source: https://www.fontshare.com
