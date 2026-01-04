# MTB Trail Status

Real-time mountain bike trail status aggregator for Ohio trails. Displays open/closed status by scraping multiple data sources and provides weather-based predictions.

## Architecture

```
trail-status/
├── index.html                           # Single-page frontend
├── css/styles.css                       # Dark theme, responsive cards
├── js/app.js                            # Frontend fetch logic, 5-min refresh
├── netlify/functions/                   # Serverless backend
│   ├── momba-status.js                  # Google Calendar iCal parser
│   ├── johnbryan-status.js              # Facebook profile pic color detection
│   ├── caesarcreek-status.js            # Facebook profile pic color detection
│   ├── troy-status.js                   # Facebook profile pic color detection
│   └── weather-prediction.js            # OpenWeatherMap-based predictions
├── netlify.toml                         # Netlify config
└── package.json                         # Dependencies for functions
```

## Data Sources

### MoMBA Trail
- **Source:** Google Calendar iCal feed
- **URL:** `https://calendar.google.com/calendar/ical/mombastatus%40gmail.com/public/basic.ics`
- **Method:** Parse iCal for today's event, extract status from event title
- **Statuses:** Open, Closed (from calendar event titles)

### Facebook-Based Trails (John Bryan, Caesar Creek, Troy)
- **Method:** Fetch profile picture via Facebook Graph API, analyze dominant color
- **Page IDs:**
  - John Bryan: `128228967211438`
  - Caesar Creek: `576124532419546`
  - Troy: `322521698109617`
- **Color Mapping:**
  - Green (hue 60-180) → Open
  - Red (hue 0-30 or 330-360) → Closed
  - Yellow (hue 30-60) → Caution/Wet
  - Blue (hue 180-260) → Freeze/Thaw
- **Library:** Jimp v1.x for image processing

### Weather Predictions
- **API:** OpenWeatherMap Current Weather API
- **Coordinates:** Hardcoded lat/lon for each trail location
- **Prediction Logic:**
  - 28-35°F → Freeze/Thaw
  - <28°F → Frozen ground
  - Rain in last 1-3 hours → Closed
  - Current rain/drizzle → Closed
  - Snow → Freeze/Thaw
  - High humidity (>85%) + moderate temp → Caution
  - >45°F, <70% humidity, no rain → Open

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENWEATHER_API_KEY` | No | OpenWeatherMap API key for weather predictions. Feature disabled if not set. |

## Status Types

| Status | CSS Class | Badge Color | Meaning |
|--------|-----------|-------------|---------|
| Open | `.open` | Green (#10b981) | Trail is rideable |
| Closed | `.closed` | Red (#ef4444) | Trail is closed |
| Caution | `.caution` | Yellow (#f59e0b) | Rideable but wet/soft |
| Freeze/Thaw | `.freeze-thaw` | Blue (#3b82f6) | Freeze/thaw cycle, avoid |
| Unknown | `.unknown` | Gray (#6b7280) | Status undetermined |
| Error | `.error` | Purple (#7c3aed) | Fetch failed |

## Development

```bash
# Install dependencies
npm install

# Run locally with Netlify Dev
npx netlify dev

# Test individual function
npx netlify functions:invoke momba-status
```

## Deployment

- **Hosting:** Netlify (auto-deploys from GitHub)
- **Repo:** https://github.com/MAbdeldayem0/mtb-trail-status
- **Live Site:** https://snazzy-tulumba-55e0f0.netlify.app

## Key Implementation Details

### Jimp v1.x API
The project uses Jimp v1.x which has a different API than v0.x:
```javascript
const { Jimp, intToRGBA } = require('jimp');
const image = await Jimp.read(buffer);
const pixel = image.getPixelColor(x, y);
const { r, g, b } = intToRGBA(pixel);
```

### Facebook Profile Picture URL
```
https://graph.facebook.com/{PAGE_ID}/picture?type=large&redirect=true
```

### iCal Parsing
Manual parsing without external library. Looks for VEVENT blocks, extracts DTSTART and SUMMARY fields, filters for today's events.

## Common Issues

1. **Facebook returns gray silhouette:** Wrong page ID or page has no profile picture
2. **Jimp.read is not a function:** Using v0.x syntax with v1.x - use destructured import
3. **Weather not showing:** OPENWEATHER_API_KEY not configured in Netlify environment
4. **EPERM errors locally:** OneDrive sync conflict - delete `.netlify` folder and retry

## Future Enhancements

- Custom domain setup
- Discord webhook notifications on status changes
- Historical status tracking
- Additional trails
