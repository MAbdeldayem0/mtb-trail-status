const fetch = require('node-fetch');

// Trail locations (latitude, longitude)
const TRAIL_LOCATIONS = {
    momba: { name: 'MoMBA', lat: 40.05, lon: -84.22 },
    johnbryan: { name: 'John Bryan', lat: 39.79, lon: -83.89 },
    caesarcreek: { name: 'Caesar Creek', lat: 39.49, lon: -84.06 },
    troy: { name: 'Troy MTB', lat: 40.04, lon: -84.20 }
};

function predictTomorrowStatus(forecasts) {
    // Analyze all of tomorrow's forecasts
    let minTemp = Infinity;
    let maxTemp = -Infinity;
    let totalRain = 0;
    let totalSnow = 0;
    let hasRain = false;
    let hasSnow = false;
    let avgHumidity = 0;
    let descriptions = [];

    for (const f of forecasts) {
        minTemp = Math.min(minTemp, f.temp);
        maxTemp = Math.max(maxTemp, f.temp);
        totalRain += f.rain || 0;
        totalSnow += f.snow || 0;
        avgHumidity += f.humidity;

        const desc = f.description.toLowerCase();
        descriptions.push(desc);
        if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower')) {
            hasRain = true;
        }
        if (desc.includes('snow')) {
            hasSnow = true;
        }
    }

    avgHumidity = Math.round(avgHumidity / forecasts.length);

    let prediction = 'open';
    let confidence = 'medium';
    let reason = '';

    // Snow expected
    if (hasSnow || totalSnow > 0) {
        prediction = 'freeze-thaw';
        confidence = 'high';
        reason = `Snow expected tomorrow`;
    }
    // Rain expected - trails will be muddy
    else if (hasRain || totalRain > 0.1) {
        prediction = 'closed';
        confidence = 'high';
        const rainAmount = totalRain.toFixed(1);
        reason = `Rain expected (~${rainAmount}" total)`;
    }
    // Freeze/Thaw - temps crossing freezing point
    else if (minTemp <= 35 && maxTemp >= 32) {
        prediction = 'freeze-thaw';
        confidence = 'high';
        reason = `Temps ${Math.round(minTemp)}°F-${Math.round(maxTemp)}°F (freeze/thaw range)`;
    }
    // Frozen solid - too cold
    else if (maxTemp < 28) {
        prediction = 'freeze-thaw';
        confidence = 'medium';
        reason = `Cold temps (high of ${Math.round(maxTemp)}°F) - ground frozen`;
    }
    // High humidity + moderate temps = potentially soft trails
    else if (avgHumidity > 85 && minTemp > 35 && maxTemp < 55) {
        prediction = 'caution';
        confidence = 'low';
        reason = `High humidity (${avgHumidity}%) - trails may be soft`;
    }
    // Good conditions expected
    else if (minTemp > 40 && avgHumidity < 75 && !hasRain) {
        prediction = 'open';
        confidence = 'high';
        reason = `Good conditions: ${Math.round(minTemp)}°F-${Math.round(maxTemp)}°F, dry`;
    }
    // Default - seems okay
    else {
        prediction = 'open';
        confidence = 'low';
        reason = `Temps ${Math.round(minTemp)}°F-${Math.round(maxTemp)}°F`;
    }

    return {
        prediction,
        confidence,
        reason,
        tempLow: Math.round(minTemp),
        tempHigh: Math.round(maxTemp),
        rainTotal: totalRain,
        snowTotal: totalSnow
    };
}

async function getForecastForLocation(lat, lon, apiKey) {
    // Use 5-day forecast API (free tier includes this)
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Forecast API error: ${response.status}`);
    }

    const data = await response.json();

    // Get tomorrow's date range (local time approximation using UTC offset)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    // Filter forecasts for tomorrow (daytime: 6am - 9pm)
    const tomorrowForecasts = data.list.filter(item => {
        const forecastTime = new Date(item.dt * 1000);
        const hour = forecastTime.getUTCHours() - 5; // Approximate EST offset
        return forecastTime >= tomorrow &&
               forecastTime < dayAfter &&
               hour >= 6 && hour <= 21;
    }).map(item => ({
        time: new Date(item.dt * 1000),
        temp: item.main.temp,
        feels_like: item.main.feels_like,
        humidity: item.main.humidity,
        description: item.weather[0].description,
        icon: item.weather[0].icon,
        rain: item.rain?.['3h'] || 0,
        snow: item.snow?.['3h'] || 0,
        wind_speed: Math.round(item.wind.speed)
    }));

    // If we don't have daytime forecasts, just use all tomorrow forecasts
    if (tomorrowForecasts.length === 0) {
        const allTomorrow = data.list.filter(item => {
            const forecastTime = new Date(item.dt * 1000);
            return forecastTime >= tomorrow && forecastTime < dayAfter;
        }).map(item => ({
            time: new Date(item.dt * 1000),
            temp: item.main.temp,
            feels_like: item.main.feels_like,
            humidity: item.main.humidity,
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            rain: item.rain?.['3h'] || 0,
            snow: item.snow?.['3h'] || 0,
            wind_speed: Math.round(item.wind.speed)
        }));
        return allTomorrow;
    }

    return tomorrowForecasts;
}

exports.handler = async function(event, context) {
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=300, max-age=300'
            },
            body: JSON.stringify({
                error: 'Weather API key not configured',
                predictions: {}
            })
        };
    }

    try {
        const predictions = {};

        for (const [trailId, location] of Object.entries(TRAIL_LOCATIONS)) {
            try {
                const forecasts = await getForecastForLocation(location.lat, location.lon, apiKey);

                if (forecasts.length === 0) {
                    predictions[trailId] = {
                        trail: location.name,
                        error: 'No forecast data available'
                    };
                    continue;
                }

                const result = predictTomorrowStatus(forecasts);

                // Get a representative forecast for display (midday if available)
                const midday = forecasts[Math.floor(forecasts.length / 2)];

                predictions[trailId] = {
                    trail: location.name,
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
            } catch (err) {
                console.error(`Error fetching forecast for ${trailId}:`, err);
                predictions[trailId] = {
                    trail: location.name,
                    error: 'Unable to fetch forecast'
                };
            }
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=300, max-age=300'
            },
            body: JSON.stringify({
                predictions,
                lastUpdated: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Weather prediction error:', error);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, max-age=60'
            },
            body: JSON.stringify({
                error: 'Failed to fetch weather predictions',
                predictions: {}
            })
        };
    }
};
