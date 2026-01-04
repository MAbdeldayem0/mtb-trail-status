const fetch = require('node-fetch');

// Trail locations (latitude, longitude)
const TRAIL_LOCATIONS = {
    momba: { name: 'MoMBA', lat: 40.05, lon: -84.22 },
    johnbryan: { name: 'John Bryan', lat: 39.79, lon: -83.89 },
    caesarcreek: { name: 'Caesar Creek', lat: 39.49, lon: -84.06 },
    troy: { name: 'Troy MTB', lat: 40.04, lon: -84.20 }
};

function predictStatus(weather) {
    const temp = weather.temp;
    const feelsLike = weather.feels_like;
    const humidity = weather.humidity;
    const rain1h = weather.rain_1h || 0;
    const rain3h = weather.rain_3h || 0;
    const snow1h = weather.snow_1h || 0;
    const description = weather.description.toLowerCase();

    let prediction = 'open';
    let confidence = 'medium';
    let reason = '';

    // Freeze/Thaw conditions
    if (temp <= 35 && temp >= 28) {
        prediction = 'freeze-thaw';
        confidence = 'high';
        reason = `Temperature ${temp}°F is in freeze/thaw range`;
    }
    // Frozen/Closed - too cold
    else if (temp < 28) {
        prediction = 'freeze-thaw';
        confidence = 'medium';
        reason = `Temperature ${temp}°F - ground likely frozen`;
    }
    // Recent rain - muddy
    else if (rain1h > 0.1 || rain3h > 0.3) {
        prediction = 'closed';
        confidence = 'high';
        reason = `Recent rain (${rain1h > 0 ? rain1h + '" in last hour' : rain3h + '" in last 3 hours'})`;
    }
    // Currently raining
    else if (description.includes('rain') || description.includes('drizzle')) {
        prediction = 'closed';
        confidence = 'high';
        reason = `Current conditions: ${weather.description}`;
    }
    // Snow
    else if (snow1h > 0 || description.includes('snow')) {
        prediction = 'freeze-thaw';
        confidence = 'high';
        reason = `Snow detected - trails likely affected`;
    }
    // High humidity after warm temps (muddy)
    else if (humidity > 85 && temp > 40 && temp < 60) {
        prediction = 'caution';
        confidence = 'low';
        reason = `High humidity (${humidity}%) - trails may be wet`;
    }
    // Good conditions
    else if (temp > 45 && humidity < 70 && rain1h === 0) {
        prediction = 'open';
        confidence = 'high';
        reason = `Good conditions: ${temp}°F, ${humidity}% humidity`;
    }
    // Default
    else {
        prediction = 'open';
        confidence = 'low';
        reason = `Conditions seem okay: ${temp}°F`;
    }

    return { prediction, confidence, reason };
}

async function getWeatherForLocation(lat, lon, apiKey) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();

    return {
        temp: Math.round(data.main.temp),
        feels_like: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        rain_1h: data.rain?.['1h'] || 0,
        rain_3h: data.rain?.['3h'] || 0,
        snow_1h: data.snow?.['1h'] || 0,
        wind_speed: Math.round(data.wind.speed),
        clouds: data.clouds.all
    };
}

exports.handler = async function(event, context) {
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
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
                const weather = await getWeatherForLocation(location.lat, location.lon, apiKey);
                const prediction = predictStatus(weather);

                predictions[trailId] = {
                    trail: location.name,
                    weather: {
                        temp: weather.temp,
                        feels_like: weather.feels_like,
                        humidity: weather.humidity,
                        description: weather.description,
                        icon: weather.icon,
                        wind_speed: weather.wind_speed
                    },
                    prediction: prediction.prediction,
                    confidence: prediction.confidence,
                    reason: prediction.reason
                };
            } catch (err) {
                console.error(`Error fetching weather for ${trailId}:`, err);
                predictions[trailId] = {
                    trail: location.name,
                    error: 'Unable to fetch weather'
                };
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                predictions,
                lastUpdated: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Weather prediction error:', error);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Failed to fetch weather predictions',
                predictions: {}
            })
        };
    }
};
