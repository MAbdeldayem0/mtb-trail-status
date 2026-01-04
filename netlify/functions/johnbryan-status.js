const fetch = require('node-fetch');
const { Jimp, intToRGBA } = require('jimp');

const FB_PAGE_ID = '128228967211438';

function classifyByDominantChannel(r, g, b) {
    // For images with text, look at which channel deviates most from gray
    const avg = (r + g + b) / 3;
    const rDiff = r - avg;
    const gDiff = g - avg;
    const bDiff = b - avg;

    console.log(`RGB: (${r}, ${g}, ${b}), avg: ${avg.toFixed(1)}`);
    console.log(`Deviations - R: ${rDiff.toFixed(1)}, G: ${gDiff.toFixed(1)}, B: ${bDiff.toFixed(1)}`);

    // If blue is notably higher (cooler tones = freeze/thaw)
    if (bDiff > 3 && bDiff > rDiff && bDiff > gDiff) {
        return 'blue';
    }

    // If green is notably higher
    if (gDiff > 5 && gDiff > rDiff && gDiff > bDiff) {
        return 'green';
    }

    // If red is notably higher (or yellow: red + green high, blue low)
    if (rDiff > 5 && rDiff > bDiff) {
        if (gDiff > 0 && bDiff < -5) {
            return 'yellow';
        }
        return 'red';
    }

    return 'unknown';
}

function colorToStatus(color) {
    const statusMap = {
        green: 'open',
        red: 'closed',
        yellow: 'caution',
        blue: 'freeze-thaw'
    };
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

async function analyzeImageColor(imageUrl) {
    try {
        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        console.log('Facebook API response status:', response.status);

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }

        const buffer = await response.buffer();
        const image = await Jimp.read(buffer);

        const width = image.bitmap.width;
        const height = image.bitmap.height;

        let redSum = 0, greenSum = 0, blueSum = 0;
        let sampleCount = 0;

        // Sample all pixels
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

        const dominantColor = classifyByDominantChannel(avgR, avgG, avgB);

        return {
            color: dominantColor,
            rgb: { r: avgR, g: avgG, b: avgB }
        };
    } catch (error) {
        console.error('Image analysis error:', error);
        return { color: 'unknown', rgb: null };
    }
}

exports.handler = async function(event, context) {
    try {
        const imageUrl = `https://graph.facebook.com/${FB_PAGE_ID}/picture?type=large`;

        const result = await analyzeImageColor(imageUrl);
        const status = colorToStatus(result.color);
        const description = colorToDescription(result.color);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: status,
                description: description,
                detectedColor: result.color,
                rgb: result.rgb,
                lastUpdated: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Error fetching John Bryan status:', error);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'unknown',
                description: 'Unable to determine trail status. Check the Facebook page directly.',
                lastUpdated: new Date().toISOString()
            })
        };
    }
};
