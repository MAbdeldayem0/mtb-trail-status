# Miami Valley MTB Trail Status

Real-time mountain bike trail status aggregator for Miami Valley, Ohio trails. Displays open/closed status by scraping multiple data sources and provides weather-based predictions for tomorrow.

## Architecture

```
trail-status/
├── index.html                           # Single-page frontend
├── css/styles.css                       # Dark theme, responsive cards
├── js/app.js                            # Frontend fetch logic, manual refresh
├── netlify/functions/                   # Serverless backend
│   └── all-statuses.js                  # Combined endpoint (all trails + weather)
├── netlify.toml                         # Netlify config
└── package.json                         # Dependencies for functions
```

**Note:** All trail status and weather logic is combined into a single function (`all-statuses.js`) to minimize Netlify function invocations. One page load = 1 function call instead of 5.

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

### Trail Directions
Each trail card displays Google Maps directions links for trailhead parking:
- **MoMBA:** 4485 Union Rd, Dayton, OH 45424
- **John Bryan:** Yellow Springs, OH 45387
- **Troy:** 1670 Troy-Sidney Rd, Troy, OH 45373 (sunrise to sunset)
- **Caesar Creek:** 3 trailheads
  - Ward Trailhead (Waynesville)
  - Campground (Wilmington)
  - Harveysburg Rd (Waynesville)

### Tomorrow's Weather Predictions
- **API:** OpenWeatherMap 5-Day Forecast API (`/data/2.5/forecast`)
- **Purpose:** Predict tomorrow's trail status (today's status comes from official sources)
- **Coordinates:** Per-trail coordinates for location-specific forecasts
- **Display:** Shows "Tomorrow (Prediction):" with disclaimer "*Weather-based estimate, not official*"
- **Prediction Logic (analyzes all of tomorrow's daytime forecasts):**
  - Snow expected → Freeze/Thaw
  - Rain expected (>0.1" total) → Closed
  - Temps cross freezing (low ≤35°F, high ≥32°F) → Freeze/Thaw
  - Max temp <28°F → Freeze/Thaw (frozen ground)
  - High humidity (>85%) + moderate temps → Caution
  - Temps >40°F, humidity <75%, no rain → Open

## Caching & Rate Limiting

- **CDN cache:** 2 hours (`s-maxage=7200`) - reduces API calls significantly
- **Error cache:** 5 minutes (`s-maxage=300`)
- **Auto-refresh:** Disabled (to reduce function invocations)

### API Rate Limit Protections
- **Retry with backoff:** All API calls retry up to 3x with exponential backoff
- **429 handling:** Rate limit responses trigger retries with Retry-After header support

This ensures the "Updated" timestamp reflects when data was actually fetched, not the current request time.

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
- **Live Site:** https://ohmtb.netlify.app

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
https://graph.facebook.com/{PAGE_ID}/picture?type=large
```

### iCal Parsing
Manual parsing without external library. Looks for VEVENT blocks, extracts DTSTART and SUMMARY fields, filters for today's events.

### Tomorrow's Forecast Filtering
Filters 5-day forecast data for tomorrow's daytime hours (6am-9pm EST approximation), then analyzes min/max temps, total rain/snow, and weather descriptions.

## Common Issues

1. **Facebook returns gray silhouette:** Wrong page ID or page has no profile picture
2. **Jimp.read is not a function:** Using v0.x syntax with v1.x - use destructured import
3. **Weather not showing:** OPENWEATHER_API_KEY not configured in Netlify environment
4. **OpenWeatherMap 401 error:** New API keys take up to 2 hours to activate after account creation
5. **EPERM errors locally:** OneDrive sync conflict - delete `.netlify` folder and retry

## Future Enhancements

- Custom domain setup
- Discord webhook notifications on status changes
- Historical status tracking
- Additional trails
