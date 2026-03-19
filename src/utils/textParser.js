/**
 * Parse NWS product text to extract structured tornado data.
 *
 * NWS damage surveys (PNS) contain sections like:
 *   ...TORNADO...
 *   RATING: EF2
 *   PATH LENGTH: 5.3 MILES
 *   PATH WIDTH: 200 YARDS
 *   ...
 *
 * TOR products contain warning polygons in LAT...LON blocks.
 */

/**
 * Parse a full PNS product text and extract all tornado sections.
 * @param {string} text - Raw product text
 * @param {string} productType - 'PNS', 'TOR', 'LSR', etc.
 * @returns {{ tornadoes: Array, hasTornadoContent: boolean }}
 */
export function parseProductText(text, productType = 'PNS') {
  if (!text) return { tornadoes: [], hasTornadoContent: false, subType: null, isPDS: false };

  const upperText = text.toUpperCase();
  const isPDS = detectPDS(upperText);

  if (productType === 'TOR') {
    return parseTorWarning(text, isPDS);
  }

  if (productType === 'LSR') {
    return parseLSR(text);
  }

  // Exclude "On This Date In Weather History" PNS bulletins — they mention
  // historical tornadoes but aren't actual damage surveys or reports.
  if (/ON THIS DATE IN WEATHER HISTORY/i.test(upperText)) {
    return { tornadoes: [], hasTornadoContent: false, subType: null, isPDS: false };
  }

  // NWS Damage Survey PNS bulletins are actual tornado surveys — flag, don't return
  const isSurvey = /NWS DAMAGE SURVEY/i.test(upperText);

  // PNS / SVS — extract tornado sections
  const tornadoes = [];

  if (isSurvey) {
    // Damage surveys use .Name... or ...Name... section headers
    const surveyRegex = /\n\s*\.{1,3}([^.\n][^.]*?)\.{3}\s*\n([\s\S]*?)(?=\n\s*\.{1,3}[^.\n][^.]*?\.{3}\s*\n|&&|\$\$|$)/gi;
    let match;
    while ((match = surveyRegex.exec(text)) !== null) {
      // Skip sections clearly about non-tornado events
      const name = match[1].toLowerCase();
      if (/\b(?:hail|wind|flood|snow|ice|lightning|rain)\b/.test(name)) continue;
      const parsed = parseTornadoSection(match[2]);
      if (parsed) tornadoes.push(parsed);
    }
  } else {
    // Standard PNS — ...TORNADO... section headers
    const tornadoRegex = /\.\.\.TORNADO\.\.\.([\s\S]*?)(?=\.\.\.(?:TORNADO|HAIL|WIND|FLOOD|SNOW|ICE|FIRE|LIGHTNING)\.\.\.|$$)/gi;
    let match;
    while ((match = tornadoRegex.exec(text)) !== null) {
      const parsed = parseTornadoSection(match[1]);
      if (parsed) tornadoes.push(parsed);
    }
  }

  // Fallback: keyword scan if no explicit tornado sections
  const hasTornadoContent = tornadoes.length > 0 || isSurvey || hasTornadoKeywords(upperText);
  const subType = isSurvey ? 'PNS_SURVEY' : (tornadoes.length > 0 ? 'PNS_TORNADO' : 'PNS');

  return { tornadoes, hasTornadoContent, subType, isPDS };
}

/**
 * Detect "Particularly Dangerous Situation" in product text.
 * NWS includes this phrase verbatim in PDS-level warnings.
 */
function detectPDS(upperText) {
  return upperText.includes('PARTICULARLY DANGEROUS SITUATION');
}

/**
 * Parse a single tornado section from a PNS bulletin.
 *
 * TODO: This is the core parsing function — the most interesting design
 * challenge. NWS offices have format variations, so regex patterns need
 * to be flexible.
 *
 * @param {string} section - Text of a single tornado report section
 * @returns {Object|null} Structured tornado data
 */
export function parseTornadoSection(section) {
  if (!section) return null;

  const data = {
    efRating: null,
    pathLength: null,
    pathWidth: null,
    lat: null,
    lon: null,
    startLat: null,
    startLon: null,
    endLat: null,
    endLon: null,
    county: null,
    state: null,
    fatalities: null,
    injuries: null,
    peakWinds: null,
    startTime: null,
    endTime: null,
    summary: null
  };

  // EF/Enhanced Fujita rating
  const efMatch = section.match(/(?:RATING|EF\s*SCALE|RATED)\s*(?::|\.{3})?\s*(EF[0-5U]|F[0-5])/i);
  if (efMatch) {
    let rating = efMatch[1].toUpperCase();
    // Normalize old Fujita to Enhanced Fujita
    if (rating.startsWith('F') && !rating.startsWith('EF')) {
      rating = 'E' + rating;
    }
    data.efRating = rating;
  }

  // Path length
  const lengthMatch = section.match(/PATH\s*LENGTH\s*(?:\/[^/]*\/)?\s*(?::|\.{3})?\s*([\d.]+)\s*(MILES?|MI|KM)/i);
  if (lengthMatch) {
    data.pathLength = `${lengthMatch[1]} ${lengthMatch[2].toLowerCase()}`;
  }

  // Path width
  const widthMatch = section.match(/PATH\s*WIDTH\s*(?:\/[^/]*\/)?\s*(?::|\.{3})?\s*([\d.]+)\s*(YARDS?|YDS?|FEET|FT|METERS?|M)\b/i);
  if (widthMatch) {
    data.pathWidth = `${widthMatch[1]} ${widthMatch[2].toLowerCase()}`;
  }

  // Coordinates — try labeled decimal first (damage surveys), then compressed, then positional
  const startDecMatch = section.match(/START\s*LAT\/?LON[:\s]+([-]?\d{2,3}\.\d+)\s*[,/]\s*([-]?\d{2,3}\.\d+)/i);
  if (startDecMatch) {
    data.startLat = parseFloat(startDecMatch[1]);
    data.startLon = parseFloat(startDecMatch[2]);
    if (data.startLon > 0) data.startLon = -data.startLon;
  }
  const endDecMatch = section.match(/END\s*LAT\/?LON[:\s]+([-]?\d{2,3}\.\d+)\s*[,/]\s*([-]?\d{2,3}\.\d+)/i);
  if (endDecMatch) {
    data.endLat = parseFloat(endDecMatch[1]);
    data.endLon = parseFloat(endDecMatch[2]);
    if (data.endLon > 0) data.endLon = -data.endLon;
  }

  // Try labeled compressed format: START LAT/LON 3456 8912
  if (!data.startLat) {
    const startMatch = section.match(/START\s*LAT\/?LON[:\s]+(\d{4})\s+(\d{4,5})/i);
    if (startMatch) {
      const sc = parseNWSCoords(startMatch[1], startMatch[2]);
      if (sc) { data.startLat = sc.lat; data.startLon = sc.lon; }
    }
  }
  if (!data.endLat) {
    const endMatch = section.match(/END\s*LAT\/?LON[:\s]+(\d{4})\s+(\d{4,5})/i);
    if (endMatch) {
      const ec = parseNWSCoords(endMatch[1], endMatch[2]);
      if (ec) { data.endLat = ec.lat; data.endLon = ec.lon; }
    }
  }

  // Fallback: find all compressed coord pairs positionally
  if (!data.startLat) {
    const allCoords = [...section.matchAll(/(\d{4})\s+(\d{4,5})(?:\s|$)/g)];
    const parsed = allCoords.map(m => parseNWSCoords(m[1], m[2])).filter(Boolean);
    if (parsed.length >= 2) {
      data.startLat = parsed[0].lat; data.startLon = parsed[0].lon;
      data.endLat = parsed[1].lat; data.endLon = parsed[1].lon;
    } else if (parsed.length === 1) {
      data.startLat = parsed[0].lat; data.startLon = parsed[0].lon;
    }
  }

  // Use start as primary location for backward compat
  if (data.startLat) {
    data.lat = data.startLat;
    data.lon = data.startLon;
  }

  // Decimal degree fallback
  if (!data.lat) {
    const decMatch = section.match(/([-]?\d{2,3}\.\d+)\s*[,/]\s*([-]?\d{2,3}\.\d+)/);
    if (decMatch) {
      const v1 = parseFloat(decMatch[1]);
      const v2 = parseFloat(decMatch[2]);
      if (v1 >= 20 && v1 <= 55 && (v2 <= -60 || v2 >= 60)) {
        data.lat = v1;
        data.lon = v2 < 0 ? v2 : -v2;
      }
    }
  }

  // County / location
  const countyMatch = section.match(/(?:IN|NEAR|OF)\s+([A-Z][A-Z\s]+?)\s+COUNTY/i);
  if (countyMatch) {
    data.county = countyMatch[1].trim();
  }
  // Fallback: extract county from location lines like "/ Texas County / MO"
  if (!data.county) {
    const locMatch = section.match(/\/\s*([A-Za-z\s]+?)\s+County\s*\//i);
    if (locMatch) data.county = locMatch[1].trim();
  }

  // State
  const stateMatch = section.match(/\b([A-Z]{2})\s*(?:COUNTY|PARISH|\.\.\.|$)/i);
  if (stateMatch && isStateCode(stateMatch[1])) {
    data.state = stateMatch[1].toUpperCase();
  }
  // Fallback: extract state from location lines like "County / MO"
  if (!data.state) {
    const stateLocMatch = section.match(/County\s*\/\s*([A-Z]{2})\b/i);
    if (stateLocMatch && isStateCode(stateLocMatch[1])) {
      data.state = stateLocMatch[1].toUpperCase();
    }
  }

  // Fatalities
  const fatMatch = section.match(/(\d+)\s*(?:FATALIT|DEATH|KILLED)/i);
  if (fatMatch) data.fatalities = parseInt(fatMatch[1], 10);

  // Injuries
  const injMatch = section.match(/(\d+)\s*INJUR/i);
  if (injMatch) data.injuries = parseInt(injMatch[1], 10);

  // Peak winds
  const windMatch = section.match(/(?:PEAK|MAX|EST)\s*(?:WINDS?|GUSTS?)\s*(?::|\.{3})?\s*(\d+)\s*MPH/i);
  if (windMatch) data.peakWinds = `${windMatch[1]} mph`;

  // Extract first meaningful line as summary
  const lines = section.trim().split('\n').filter(l => l.trim().length > 10);
  if (lines.length > 0) {
    data.summary = lines[0].trim().slice(0, 200);
  }

  // Only return if we got at least some useful data
  const hasData = data.efRating || data.pathLength || data.lat || data.county || data.fatalities !== null;
  return hasData ? data : null;
}

/**
 * Parse NWS compressed lat/lon format.
 * 3456 8912 → { lat: 34.56, lon: -89.12 }
 * 3456 10012 → { lat: 34.56, lon: -100.12 }
 */
export function parseNWSCoords(latStr, lonStr) {
  if (!latStr || !lonStr) return null;

  let lat, lon;

  if (latStr.length === 4) {
    lat = parseInt(latStr.slice(0, 2), 10) + parseInt(latStr.slice(2), 10) / 100;
  } else {
    return null;
  }

  if (lonStr.length === 4) {
    lon = -(parseInt(lonStr.slice(0, 2), 10) + parseInt(lonStr.slice(2), 10) / 100);
  } else if (lonStr.length === 5) {
    lon = -(parseInt(lonStr.slice(0, 3), 10) + parseInt(lonStr.slice(3), 10) / 100);
  } else {
    return null;
  }

  // Sanity check for CONUS
  if (lat < 20 || lat > 55 || lon > -60 || lon < -135) return null;

  return { lat, lon };
}

/**
 * Parse TOR (tornado warning) product — extract warning polygon.
 */
function parseTorWarning(text, isPDS = false) {
  const polygon = [];
  const latLonMatch = text.match(/LAT\.\.\.LON\s+([\d\s]+)/);

  if (latLonMatch) {
    const pairs = latLonMatch[1].trim().split(/\s+/);
    for (let i = 0; i < pairs.length - 1; i += 2) {
      const coords = parseNWSCoords(pairs[i], pairs[i + 1]);
      if (coords) polygon.push(coords);
    }
  }

  // Extract area description from "* Tornado Warning for...\n  <area>..."
  let summary = null;
  let county = null;
  let state = null;
  const areaMatch = text.match(/\*\s*Tornado Warning for\.\.\.?\s*\n([\s\S]*?)(?=\n\s*\*|\n\n)/i);
  if (areaMatch) {
    summary = areaMatch[1].replace(/\s+/g, ' ').replace(/\.{3,}/g, '').trim();
    const countyMatch = summary.match(/([A-Za-z\s]+?)\s+County/i);
    if (countyMatch) county = countyMatch[1].trim();
    const stateMatch = summary.match(/\bin\s+(?:[\w\s]+?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*$/);
    if (stateMatch) {
      const stateAbbr = stateNameToCode(stateMatch[1]);
      if (stateAbbr) state = stateAbbr;
    }
    // Fallback: look for two-letter state code in the area text
    if (!state) {
      const codeMatch = summary.match(/\b([A-Z]{2})\b/);
      if (codeMatch && isStateCode(codeMatch[1])) state = codeMatch[1];
    }
  }

  // Extract end time from "* Until <time>."
  let endTime = null;
  const untilMatch = text.match(/\*\s*Until\s+(\d{3,4}\s+[AP]M\s+[A-Z]{2,4})\.?/i);
  if (untilMatch) endTime = untilMatch[1].trim();

  // Extract HAZARD, SOURCE, IMPACT lines
  let hazard = null;
  let source = null;
  let impact = null;
  const hazardMatch = text.match(/HAZARD\.{3}\s*(.+)/i);
  if (hazardMatch) hazard = hazardMatch[1].replace(/\.+$/, '').trim();
  const sourceMatch = text.match(/SOURCE\.{3}\s*(.+)/i);
  if (sourceMatch) source = sourceMatch[1].replace(/\.+$/, '').trim();
  const impactMatch = text.match(/IMPACT\.{3}\s*([\s\S]*?)(?=\n\s*\n|LAT\.\.\.LON|PRECAUTIONARY)/i);
  if (impactMatch) impact = impactMatch[1].replace(/\s+/g, ' ').replace(/\.+$/, '').trim();

  // Extract motion description from "* At <time>..." paragraph
  let motionDescription = null;
  const motionMatch = text.match(/\*\s*At\s+\d{3,4}\s+[AP]M[\s\S]*?(?=\n\s*\n|HAZARD)/i);
  if (motionMatch) {
    motionDescription = motionMatch[0].replace(/^\*\s*/, '').replace(/\s+/g, ' ').trim();
  }

  const tornadoes = [];
  if (polygon.length > 0) {
    const centroid = {
      lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
      lon: polygon.reduce((s, p) => s + p.lon, 0) / polygon.length
    };

    tornadoes.push({
      efRating: null,
      pathLength: null,
      pathWidth: null,
      lat: centroid.lat,
      lon: centroid.lon,
      county,
      state,
      fatalities: null,
      injuries: null,
      peakWinds: null,
      startTime: null,
      endTime,
      summary: summary || 'Tornado Warning',
      source,
      hazard,
      impact,
      motionDescription,
      polygon
    });
  }

  return { tornadoes, hasTornadoContent: true, subType: isPDS ? 'TOR_PDS' : 'TOR', isPDS };
}

/**
 * Parse LSR (Local Storm Report) for tornado reports.
 */
function parseLSR(text) {
  const tornadoes = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!/TORNADO/i.test(lines[i]) || /WATERSPOUT/i.test(lines[i])) continue;

    // Parse LSR two-line tabular format:
    // Line 1: TIME     TORNADO       LOCATION          LAT    LON
    // Line 2: DATE                   COUNTY     ST  SOURCE
    const line1 = lines[i].trim();

    // Extract time from start of line (e.g., "1103 PM")
    let startTime = null;
    const timeMatch = line1.match(/^(\d{3,4}\s+[AP]M)\b/i);
    if (timeMatch) startTime = timeMatch[1].trim();

    // Extract location description (between event type and coordinates)
    let location = null;
    const locMatch = line1.match(/TORNADO\s{2,}(.+?)\s{2,}\d/i);
    if (locMatch) location = locMatch[1].trim();

    // Extract coordinates (decimal with N/S/E/W suffixes or plain decimal)
    let lat = null;
    let lon = null;
    const nwsCoordMatch = line1.match(/(\d+\.\d+)\s*([NS])\s+(\d+\.\d+)\s*([WE])/i);
    if (nwsCoordMatch) {
      lat = parseFloat(nwsCoordMatch[1]);
      if (nwsCoordMatch[2].toUpperCase() === 'S') lat = -lat;
      lon = parseFloat(nwsCoordMatch[3]);
      if (nwsCoordMatch[4].toUpperCase() === 'W') lon = -lon;
    } else {
      const decCoordMatch = line1.match(/([-]?\d{2,3}\.\d+)\s+([-]?\d{2,3}\.\d+)/);
      if (decCoordMatch) {
        lat = parseFloat(decCoordMatch[1]);
        lon = parseFloat(decCoordMatch[2]);
        if (lon > 0) lon = -lon;
      }
    }

    // Parse continuation line for county, state, source
    let county = null;
    let state = null;
    let source = null;
    if (i + 1 < lines.length) {
      const line2 = lines[i + 1];
      // Continuation line format: DATE              COUNTY     ST  SOURCE
      const contMatch = line2.match(/^\s*\d{2}\/\d{2}\/\d{4}\s+(.*)/);
      if (contMatch) {
        const rest = contMatch[1];
        // Parse: COUNTY     ST  SOURCE
        const fieldsMatch = rest.match(/^\s*([A-Za-z\s.'-]+?)\s{2,}([A-Z]{2})\s{2,}(.+)/);
        if (fieldsMatch) {
          county = fieldsMatch[1].trim();
          const stCode = fieldsMatch[2].trim();
          if (isStateCode(stCode)) state = stCode;
          source = fieldsMatch[3].trim();
        }
      }
    }

    // Build a rich summary from parsed fields
    const parts = [];
    if (startTime) parts.push(startTime);
    parts.push('Tornado');
    if (location) parts.push(location);
    if (county) {
      const loc = `${county} County` + (state ? `, ${state}` : '');
      parts.push(loc);
    }
    if (source) parts.push(`(${source})`);
    const summary = parts.join(' - ');

    tornadoes.push({
      efRating: null,
      pathLength: null,
      pathWidth: null,
      lat,
      lon,
      county,
      state,
      fatalities: null,
      injuries: null,
      peakWinds: null,
      startTime,
      endTime: null,
      summary,
      source,
      location
    });
  }

  return { tornadoes, hasTornadoContent: tornadoes.length > 0 || hasTornadoKeywords(text), subType: 'LSR', isPDS: false };
}

/**
 * Quick keyword scan for tornado-relevant content.
 */
function hasTornadoKeywords(text) {
  const keywords = ['TORNADO', 'TORNADOES', 'FUNNEL', 'TWISTER', 'WATERSPOUT'];
  return keywords.some(kw => text.includes(kw));
}

/**
 * Check if a 2-letter code is a US state abbreviation.
 */
/**
 * Convert a full state name to its two-letter abbreviation.
 */
function stateNameToCode(name) {
  const map = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
    'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
    'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
    'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
    'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
    'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
    'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
    'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
    'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
    'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY'
  };
  return map[name.toLowerCase()] || null;
}

function isStateCode(code) {
  const states = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP'
  ]);
  return states.has(code.toUpperCase());
}
