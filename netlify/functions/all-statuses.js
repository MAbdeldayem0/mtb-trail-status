const fetch = require('node-fetch');
const { Jimp, intToRGBA } = require('jimp');
const { getStore } = require('@netlify/blobs');

// ============ CONFIGURATION ============

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1457517860401184769/LwE3w91flTOPOXi-TwxE1J-A4KifmqKyKpTjmlRMSCLr6peW6_6xfi619hIqy-fs7Bu1';

const TRAILS = {
    momba: {
        name: 'MoMBA',
        type: 'ical',
        source: 'https://calendar.google.com/calendar/ical/mombastatus%40gmail.com/public/basic.ics',
        lat: 40.05,
        lon: -84.22,
        trailheads: [
            { name: 'Main Entrance', address: '4485 Union Rd, Dayton, OH 45424' }
        ]
    },
    johnbryan: {
        name: 'John Bryan',
        type: 'facebook',
        pageId: '128228967211438',
        lat: 39.79,
        lon: -83.89,
        trailheads: [
            { name: 'Trailhead', address: 'John Bryan Mountain Bike Trail, Yellow Springs, OH 45387' }
        ]
    },
    caesarcreek: {
        name: 'Caesar Creek',
        type: 'facebook',
        pageId: '576124532419546',
        lat: 39.49,
        lon: -84.06,
        trailheads: [
            { name: 'Ward Trailhead', address: 'Caesar Creek Ward Rd MTB Trail Head, Waynesville, OH 45068' },
            { name: 'Campground', address: 'Caesar Creek Campground Loop MTB Trailhead, Wilmington, OH 45177' },
            { name: 'Harveysburg', address: '5563-5679 Harveysburg Rd, Waynesville, OH 45068' }
        ]
    },
    troy: {
        name: 'Troy MTB',
        type: 'facebook',
        pageId: '322521698109617',
        lat: 40.04,
        lon: -84.20,
        trailheads: [
            { name: 'Main Entrance', address: '1670 Troy-Sidney Rd, Troy, OH 45373', note: 'Open sunrise to sunset' }
        ]
    }
};

// ============ RETRY WITH BACKOFF ============

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);

            // Handle rate limiting specifically
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
                const error = new Error('Rate limited');
                error.status = 429;
                throw error;
            }

            return response;
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries - 1 && !error.status) {
                // Exponential backoff for network errors (not HTTP errors)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
            }
        }
    }
    throw lastError;
}

// ============ ICAL PARSING (MoMBA) ============

function parseICalDate(dateStr) {
    if (!dateStr) return null;
    const cleaned = dateStr.replace(/[^0-9T]/g, '');
    if (cleaned.length >= 8) {
        const year = cleaned.substring(0, 4);
        const month = cleaned.substring(4, 6);
        const day = cleaned.substring(6, 8);
        if (cleaned.length >= 15) {
            const hour = cleaned.substring(9, 11);
            const minute = cleaned.substring(11, 13);
            return new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
        }
        return new Date(`${year}-${month}-${day}T00:00:00`);
    }
    return null;
}

function parseICalEvents(icalText) {
    const events = [];
    const eventBlocks = icalText.split('BEGIN:VEVENT');
    for (let i = 1; i < eventBlocks.length; i++) {
        const block = eventBlocks[i].split('END:VEVENT')[0];
        const event = {};
        const summaryMatch = block.match(/SUMMARY:(.+?)(?:\r?\n|\r)/);
        if (summaryMatch) event.summary = summaryMatch[1].trim();
        const dtstartMatch = block.match(/DTSTART[^:]*:(\d+T?\d*Z?)/);
        if (dtstartMatch) event.start = parseICalDate(dtstartMatch[1]);
        const descMatch = block.match(/DESCRIPTION:(.+?)(?=\r?\n[A-Z]|\r?\nEND)/s);
        if (descMatch) {
            event.description = descMatch[1]
                .replace(/\\n/g, ' ')
                .replace(/\\,/g, ',')
                .replace(/\r?\n /g, '')
                .trim();
        }
        if (event.summary && event.start) events.push(event);
    }
    return events;
}

function determineICalStatus(summary) {
    const lower = summary.toLowerCase();
    if (lower.includes('closed')) return 'closed';
    if (lower.includes('open')) return 'open';
    return 'unknown';
}

async function fetchMombaStatus(url) {
    try {
        const response = await fetchWithRetry(url);
        if (!response.ok) throw new Error(`Failed to fetch calendar: ${response.status}`);

        const icalText = await response.text();
        const events = parseICalEvents(icalText);

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayEvents = events.filter(event => {
            if (!event.start) return false;
            const eventDate = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate());
            return eventDate >= today && eventDate < tomorrow;
        });

        if (todayEvents.length > 0) {
            const latest = todayEvents.sort((a, b) => b.start - a.start)[0];
            return {
                status: determineICalStatus(latest.summary),
                description: latest.description || latest.summary
            };
        }

        const sortedEvents = events.filter(e => e.start).sort((a, b) => b.start - a.start);
        if (sortedEvents.length > 0) {
            const mostRecent = sortedEvents[0];
            return {
                status: determineICalStatus(mostRecent.summary),
                description: `Last update: ${mostRecent.summary}${mostRecent.description ? ' - ' + mostRecent.description : ''}`
            };
        }

        return { status: 'unknown', description: 'No status updates found' };
    } catch (error) {
        console.error('MoMBA fetch error:', error);
        return { status: 'error', description: 'Unable to fetch trail status' };
    }
}

// ============ FACEBOOK COLOR DETECTION ============

function classifyByDominantChannel(r, g, b) {
    const avg = (r + g + b) / 3;
    const rDiff = r - avg;
    const gDiff = g - avg;
    const bDiff = b - avg;

    if (bDiff > 3 && bDiff > rDiff && bDiff > gDiff) return 'blue';
    if (gDiff > 5 && gDiff > rDiff && gDiff > bDiff) return 'green';
    if (rDiff > 5 && rDiff > bDiff) {
        if (gDiff > 0 && bDiff < -5) return 'yellow';
        return 'red';
    }
    return 'unknown';
}

function colorToStatus(color) {
    const statusMap = { green: 'open', red: 'closed', yellow: 'caution', blue: 'freeze-thaw' };
    return statusMap[color] || 'unknown';
}

function colorToDescription(color) {
    const descMap = {
        green: 'Trails are open and in good condition',
        red: 'Trails are currently closed',
        yellow: 'Caution - Trails may be wet or have hazards',
        blue: 'Freeze/Thaw conditions - Exercise caution'
    };
    return descMap[color] || 'Unable to determine trail status. Check the Facebook page directly.';
}

async function fetchFacebookStatus(pageId) {
    try {
        const imageUrl = `https://graph.facebook.com/${pageId}/picture?type=large`;
        const response = await fetchWithRetry(imageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

        const buffer = await response.buffer();
        const image = await Jimp.read(buffer);

        const width = image.bitmap.width;
        const height = image.bitmap.height;
        let redSum = 0, greenSum = 0, blueSum = 0, sampleCount = 0;

        for (let x = 0; x < width; x += 2) {
            for (let y = 0; y < height; y += 2) {
                const pixelColor = image.getPixelColor(x, y);
                const rgba = intToRGBA(pixelColor);
                redSum += rgba.r;
                greenSum += rgba.g;
                blueSum += rgba.b;
                sampleCount++;
            }
        }

        const avgR = Math.round(redSum / sampleCount);
        const avgG = Math.round(greenSum / sampleCount);
        const avgB = Math.round(blueSum / sampleCount);
        const color = classifyByDominantChannel(avgR, avgG, avgB);

        return {
            status: colorToStatus(color),
            description: colorToDescription(color),
            detectedColor: color,
            rgb: { r: avgR, g: avgG, b: avgB }
        };
    } catch (error) {
        console.error('Facebook fetch error:', error);
        if (error.status === 429) {
            return { status: 'error', description: 'Rate limited - please try again later.' };
        }
        return { status: 'unknown', description: 'Unable to determine trail status. Check the Facebook page directly.' };
    }
}

// ============ WEATHER PREDICTIONS ============

function predictTomorrowStatus(forecasts) {
    let minTemp = Infinity, maxTemp = -Infinity;
    let totalRain = 0, totalSnow = 0;
    let hasRain = false, hasSnow = false;
    let avgHumidity = 0;

    for (const f of forecasts) {
        minTemp = Math.min(minTemp, f.temp);
        maxTemp = Math.max(maxTemp, f.temp);
        totalRain += f.rain || 0;
        totalSnow += f.snow || 0;
        avgHumidity += f.humidity;

        const desc = f.description.toLowerCase();
        if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower')) hasRain = true;
        if (desc.includes('snow')) hasSnow = true;
    }

    avgHumidity = Math.round(avgHumidity / forecasts.length);

    let prediction = 'open', confidence = 'medium', reason = '';

    if (hasSnow || totalSnow > 0) {
        prediction = 'freeze-thaw'; confidence = 'high'; reason = 'Snow expected tomorrow';
    } else if (hasRain || totalRain > 0.1) {
        prediction = 'closed'; confidence = 'high'; reason = `Rain expected (~${totalRain.toFixed(1)}" total)`;
    } else if (minTemp <= 35 && maxTemp >= 32) {
        prediction = 'freeze-thaw'; confidence = 'high'; reason = `Temps ${Math.round(minTemp)}°F-${Math.round(maxTemp)}°F (freeze/thaw range)`;
    } else if (maxTemp < 28) {
        prediction = 'freeze-thaw'; confidence = 'medium'; reason = `Cold temps (high of ${Math.round(maxTemp)}°F) - ground frozen`;
    } else if (avgHumidity > 85 && minTemp > 35 && maxTemp < 55) {
        prediction = 'caution'; confidence = 'low'; reason = `High humidity (${avgHumidity}%) - trails may be soft`;
    } else if (minTemp > 40 && avgHumidity < 75 && !hasRain) {
        prediction = 'open'; confidence = 'high'; reason = `Good conditions: ${Math.round(minTemp)}°F-${Math.round(maxTemp)}°F, dry`;
    } else {
        prediction = 'open'; confidence = 'low'; reason = `Temps ${Math.round(minTemp)}°F-${Math.round(maxTemp)}°F`;
    }

    return { prediction, confidence, reason, tempLow: Math.round(minTemp), tempHigh: Math.round(maxTemp) };
}

async function fetchWeatherPrediction(lat, lon, apiKey) {
    if (!apiKey) return null;

    try {
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`;
        const response = await fetchWithRetry(url);

        if (response.status === 401) {
            console.error('OpenWeatherMap API key invalid or not yet activated');
            return null;
        }
        if (!response.ok) throw new Error(`Forecast API error: ${response.status}`);

        const data = await response.json();
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);

        let forecasts = data.list.filter(item => {
            const forecastTime = new Date(item.dt * 1000);
            const hour = forecastTime.getUTCHours() - 5;
            return forecastTime >= tomorrow && forecastTime < dayAfter && hour >= 6 && hour <= 21;
        }).map(item => ({
            temp: item.main.temp,
            humidity: item.main.humidity,
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            rain: item.rain?.['3h'] || 0,
            snow: item.snow?.['3h'] || 0,
            wind_speed: Math.round(item.wind.speed)
        }));

        if (forecasts.length === 0) {
            forecasts = data.list.filter(item => {
                const forecastTime = new Date(item.dt * 1000);
                return forecastTime >= tomorrow && forecastTime < dayAfter;
            }).map(item => ({
                temp: item.main.temp,
                humidity: item.main.humidity,
                description: item.weather[0].description,
                icon: item.weather[0].icon,
                rain: item.rain?.['3h'] || 0,
                snow: item.snow?.['3h'] || 0,
                wind_speed: Math.round(item.wind.speed)
            }));
        }

        if (forecasts.length === 0) return null;

        const result = predictTomorrowStatus(forecasts);
        const midday = forecasts[Math.floor(forecasts.length / 2)];

        return {
            tomorrow: {
                tempHigh: result.tempHigh,
                tempLow: result.tempLow,
                description: midday.description,
                icon: midday.icon,
                humidity: midday.humidity,
                wind_speed: midday.wind_speed
            },
            prediction: result.prediction,
            confidence: result.confidence,
            reason: result.reason
        };
    } catch (error) {
        console.error('Weather fetch error:', error);
        if (error.status === 429) {
            return { error: 'rate_limited', message: 'Weather API rate limited' };
        }
        return null;
    }
}

// ============ DISCORD NOTIFICATIONS ============

const STATUS_COLORS = {
    open: 0x22c55e,       // Green
    closed: 0xef4444,     // Red
    caution: 0xf59e0b,    // Yellow
    'freeze-thaw': 0x3b82f6, // Blue
    unknown: 0x6b7280,    // Gray
    error: 0x7c3aed       // Purple
};

const STATUS_EMOJIS = {
    open: '🟢',
    closed: '🔴',
    caution: '🟡',
    'freeze-thaw': '🔵',
    unknown: '⚪',
    error: '🟣'
};

async function sendDiscordNotification(trailName, oldStatus, newStatus) {
    if (!DISCORD_WEBHOOK_URL) return;

    const emoji = STATUS_EMOJIS[newStatus] || '⚪';
    const oldEmoji = STATUS_EMOJIS[oldStatus] || '⚪';

    const embed = {
        title: `${emoji} ${trailName} Status Changed`,
        description: `**${oldEmoji} ${oldStatus?.toUpperCase() || 'UNKNOWN'}** → **${emoji} ${newStatus.toUpperCase()}**`,
        color: STATUS_COLORS[newStatus] || STATUS_COLORS.unknown,
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Miami Valley MTB Trail Status'
        }
    };

    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
        console.log(`Discord notification sent for ${trailName}: ${oldStatus} -> ${newStatus}`);
    } catch (error) {
        console.error('Discord webhook error:', error);
    }
}

async function checkAndNotifyStatusChanges(currentStatuses, context) {
    try {
        const store = getStore({ name: 'trail-statuses', siteID: context.site?.id, token: context.token });

        // Get previous statuses
        let previousStatuses = {};
        try {
            const stored = await store.get('statuses', { type: 'json' });
            if (stored) previousStatuses = stored;
        } catch (e) {
            console.log('No previous statuses found, initializing...');
        }

        // Check for changes and send notifications
        for (const [trailId, data] of Object.entries(currentStatuses)) {
            const currentStatus = data.status;
            const previousStatus = previousStatuses[trailId];

            if (previousStatus && previousStatus !== currentStatus && currentStatus !== 'error') {
                await sendDiscordNotification(data.name, previousStatus, currentStatus);
            }
        }

        // Store current statuses
        const statusesToStore = {};
        for (const [trailId, data] of Object.entries(currentStatuses)) {
            if (data.status !== 'error') {
                statusesToStore[trailId] = data.status;
            }
        }
        await store.setJSON('statuses', statusesToStore);

    } catch (error) {
        console.error('Status change notification error:', error);
    }
}

// ============ MAIN HANDLER ============

exports.handler = async function(event, context) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const results = {};

    try {
        // Fetch all trail statuses in parallel
        const fetchPromises = Object.entries(TRAILS).map(async ([id, trail]) => {
            let status;
            if (trail.type === 'ical') {
                status = await fetchMombaStatus(trail.source);
            } else if (trail.type === 'facebook') {
                status = await fetchFacebookStatus(trail.pageId);
            }

            // Fetch weather prediction for this specific trail location
            const weather = await fetchWeatherPrediction(trail.lat, trail.lon, apiKey);

            return [id, { name: trail.name, ...status, weather, trailheads: trail.trailheads }];
        });

        const trailResults = await Promise.all(fetchPromises);
        trailResults.forEach(([id, data]) => { results[id] = data; });

        // Check for status changes and send Discord notifications
        await checkAndNotifyStatusChanges(results, context);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=7200, max-age=7200'
            },
            body: JSON.stringify({
                trails: results,
                lastUpdated: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('All statuses error:', error);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=300, max-age=300'
            },
            body: JSON.stringify({
                error: 'Failed to fetch trail statuses',
                trails: {},
                lastUpdated: new Date().toISOString()
            })
        };
    }
};
