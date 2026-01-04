const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function fetchWeatherPredictions() {
    try {
        const response = await fetch('/.netlify/functions/weather-prediction');
        if (!response.ok) throw new Error('Failed to fetch weather');
        return await response.json();
    } catch (error) {
        console.error('Weather prediction fetch error:', error);
        return { predictions: {} };
    }
}

async function fetchMombaStatus() {
    try {
        const response = await fetch('/.netlify/functions/momba-status');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('MoMBA fetch error:', error);
        return { status: 'error', description: 'Unable to fetch status' };
    }
}

async function fetchJohnBryanStatus() {
    try {
        const response = await fetch('/.netlify/functions/johnbryan-status');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('John Bryan fetch error:', error);
        return { status: 'error', description: 'Unable to fetch status' };
    }
}

async function fetchCaesarCreekStatus() {
    try {
        const response = await fetch('/.netlify/functions/caesarcreek-status');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('Caesar Creek fetch error:', error);
        return { status: 'error', description: 'Unable to fetch status' };
    }
}

async function fetchTroyStatus() {
    try {
        const response = await fetch('/.netlify/functions/troy-status');
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('Troy fetch error:', error);
        return { status: 'error', description: 'Unable to fetch status' };
    }
}

function getStatusClass(status) {
    const statusMap = {
        'open': 'open',
        'closed': 'closed',
        'caution': 'caution',
        'wet': 'caution',
        'freeze-thaw': 'freeze-thaw',
        'freeze/thaw': 'freeze-thaw',
        'unknown': 'unknown',
        'error': 'error'
    };
    return statusMap[status.toLowerCase()] || 'unknown';
}

function getStatusText(status) {
    const textMap = {
        'open': 'Open',
        'closed': 'Closed',
        'caution': 'Caution',
        'wet': 'Caution',
        'freeze-thaw': 'Freeze/Thaw',
        'freeze/thaw': 'Freeze/Thaw',
        'unknown': 'Unknown',
        'error': 'Error'
    };
    return textMap[status.toLowerCase()] || status;
}

function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return `Updated: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function updateTrailCard(trailId, data) {
    const statusBadge = document.getElementById(`${trailId}-status`);
    const description = document.getElementById(`${trailId}-description`);
    const updated = document.getElementById(`${trailId}-updated`);

    if (statusBadge) {
        statusBadge.className = `status-badge ${getStatusClass(data.status)}`;
        statusBadge.textContent = getStatusText(data.status);
    }

    if (description) {
        description.textContent = data.description || 'No additional information available.';
    }

    if (updated) {
        updated.textContent = formatTime(data.lastUpdated);
    }
}

function updateWeatherDisplay(trailId, prediction) {
    const weatherDiv = document.getElementById(`${trailId}-weather`);
    const predictionDiv = document.getElementById(`${trailId}-prediction`);

    if (weatherDiv && prediction && prediction.tomorrow) {
        const t = prediction.tomorrow;
        const iconUrl = `https://openweathermap.org/img/wn/${t.icon}@2x.png`;
        weatherDiv.innerHTML = `
            <img class="weather-icon" src="${iconUrl}" alt="${t.description}">
            <span class="weather-temp">${t.tempLow}°-${t.tempHigh}°F</span>
            <span class="weather-desc">${t.description}</span>
            <span class="weather-details">${t.humidity}% humidity • ${t.wind_speed} mph wind</span>
        `;
    } else if (weatherDiv) {
        weatherDiv.innerHTML = '';
    }

    if (predictionDiv && prediction && prediction.prediction) {
        const confidenceClass = prediction.confidence || 'low';
        predictionDiv.className = `prediction-info ${confidenceClass}`;
        predictionDiv.innerHTML = `
            <span class="prediction-label">Tomorrow:</span>
            <span class="prediction-badge ${prediction.prediction}">${getStatusText(prediction.prediction)}</span>
            <span class="prediction-reason">${prediction.reason || ''}</span>
        `;
    } else if (predictionDiv) {
        predictionDiv.innerHTML = '';
        predictionDiv.className = 'prediction-info';
    }
}

async function refreshStatuses() {
    const [mombaData, johnBryanData, caesarCreekData, troyData, weatherData] = await Promise.all([
        fetchMombaStatus(),
        fetchJohnBryanStatus(),
        fetchCaesarCreekStatus(),
        fetchTroyStatus(),
        fetchWeatherPredictions()
    ]);

    updateTrailCard('momba', mombaData);
    updateTrailCard('johnbryan', johnBryanData);
    updateTrailCard('caesarcreek', caesarCreekData);
    updateTrailCard('troy', troyData);

    // Update weather predictions
    const predictions = weatherData.predictions || {};
    updateWeatherDisplay('momba', predictions.momba);
    updateWeatherDisplay('johnbryan', predictions.johnbryan);
    updateWeatherDisplay('caesarcreek', predictions.caesarcreek);
    updateWeatherDisplay('troy', predictions.troy);
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    refreshStatuses();
    setInterval(refreshStatuses, REFRESH_INTERVAL);
});
