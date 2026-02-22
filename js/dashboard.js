/* ============================================================
   U.S. Economic Dashboard - Application Logic
   ============================================================ */

(function () {
  'use strict';

  /* ----- Configuration ----- */

  const CONFIG = {
    fredApiKey:  'd2c9f37eac3cdd75dd4147ef7726e8ff',
    corsProxy:   'https://corsproxy.io/?',
    termStart:   '2025-01-20',          // Inauguration date
    dataStart:   '2024-01-01',          // Fetch data from this date onward
    monthsForYoY: 12,                   // Months look-back for year-over-year inflation
  };

  /* FRED series IDs and their display metadata */
  const SERIES = [
    { id: 'A191RL1Q225SBEA', key: 'gdp',          label: 'GDP Growth Rate (%)',               color: '#4ecdc4', yLabel: 'Percent',      isPercent: true,  higherIsBetter: true  },
    { id: 'UNRATE',          key: 'unemployment',   label: 'Unemployment Rate (%)',             color: '#ff6b6b', yLabel: 'Percent',      isPercent: true,  higherIsBetter: false },
    { id: 'CPIAUCSL',        key: 'inflation',      label: 'Inflation Rate (Y/Y % Change)',     color: '#ffc107', yLabel: 'Percent',      isPercent: true,  higherIsBetter: false },
    { id: 'SP500',           key: 'sp500',          label: 'S&P 500 Index Value',               color: '#007bff', yLabel: 'Index Points', isPercent: false, higherIsBetter: true  },
  ];


  /* ----- FRED API ----- */

  /**
   * Fetch observations for a given FRED series.
   * Returns an array of { x: dateString, y: number } data points,
   * filtering out any placeholder (".") values.
   */
  async function fetchSeries(seriesId) {
    const fredUrl =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${seriesId}` +
      `&api_key=${CONFIG.fredApiKey}` +
      `&file_type=json` +
      `&observation_start=${CONFIG.dataStart}`;

    const url = `${CONFIG.corsProxy}${encodeURIComponent(fredUrl)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`FRED API error for ${seriesId}: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (!json.observations || !Array.isArray(json.observations)) {
      throw new Error(`Unexpected response shape for ${seriesId}`);
    }

    return json.observations
      .filter(function (obs) { return obs.value !== '.'; })
      .map(function (obs) {
        return { x: obs.date, y: parseFloat(obs.value) };
      });
  }


  /* ----- Data Transforms ----- */

  /**
   * Compute year-over-year percentage change from monthly CPI data.
   * Each point compares the current month's CPI to the same month
   * one year prior (12 months earlier).
   */
  function computeYoYInflation(cpiPoints) {
    var lookBack = CONFIG.monthsForYoY;
    return cpiPoints.slice(lookBack).map(function (point, index) {
      var baseline = cpiPoints[index].y;
      return {
        x: point.x,
        y: ((point.y - baseline) / baseline) * 100,
      };
    });
  }

  /**
   * Keep only data points on or after the presidential term start date.
   */
  function filterByTerm(points) {
    return points.filter(function (point) {
      return moment(point.x).isSameOrAfter(CONFIG.termStart);
    });
  }


  /* ----- DOM Updates ----- */

  /**
   * Populate a metric card with the latest value and change-since-inauguration.
   *
   * @param {string}  metricKey      - DOM id prefix (e.g. "gdp", "sp500")
   * @param {Array}   termData       - Data points filtered to the presidential term
   * @param {boolean} isPercent      - Whether to format the value with a "%" suffix
   * @param {boolean} higherIsBetter - Whether an increase is positive for the economy
   */
  function updateMetricCard(metricKey, termData, isPercent, higherIsBetter) {
    var valueEl  = document.getElementById(metricKey + '-value');
    var changeEl = document.getElementById(metricKey + '-change');

    if (!valueEl || !changeEl) return;

    /* Remove loading skeleton */
    valueEl.classList.remove('metric-card__value--loading');

    if (termData.length === 0) {
      valueEl.textContent  = 'N/A';
      changeEl.textContent = 'No data available for this period';
      return;
    }

    var latest = termData[termData.length - 1].y;
    var first  = termData[0].y;
    var change = latest - first;

    /* Display the current value */
    valueEl.textContent = isPercent
      ? latest.toFixed(1) + '%'
      : Math.round(latest).toLocaleString();

    /* Display directional change */
    var improved   = (change >= 0) === higherIsBetter;
    var direction  = change >= 0 ? 'up' : 'down';
    var arrow      = change >= 0 ? '\u25B2' : '\u25BC';   // ▲ or ▼
    var cssClass   = improved ? 'positive' : 'negative';
    var changeText = Math.abs(change).toFixed(2) + (isPercent ? '%' : '');

    changeEl.innerHTML =
      '<span class="' + cssClass + '" aria-label="Change direction: ' + direction + '">' +
      arrow + ' ' + changeText +
      '</span> since Inauguration';
  }


  /* ----- Chart Rendering ----- */

  /**
   * Render a Chart.js time-series line chart.
   *
   * @param {string} canvasId - The <canvas> element id
   * @param {Array}  data     - Array of { x, y } data points
   * @param {string} title    - Chart title
   * @param {string} color    - Line / fill color hex string
   * @param {string} yLabel   - Label for the Y-axis
   */
  function renderChart(canvasId, data, title, color, yLabel) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    var ctx = canvas.getContext('2d');

    new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label:           title,
          data:            data,
          borderColor:     color,
          backgroundColor: color + '22',
          borderWidth:     3,
          fill:            true,
          pointRadius:     2,
          tension:         0.3,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          title:  { display: true, text: title, color: '#fff', font: { size: 16 } },
          legend: { display: false },
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'month' },
            grid:  { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#888' },
          },
          y: {
            title: { display: true, text: yLabel, color: '#888' },
            grid:  { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#888' },
          },
        },
      },
    });
  }


  /* ----- Error Display ----- */

  function showError(message) {
    var banner = document.getElementById('error-banner');
    if (banner) {
      banner.textContent = message;
      banner.classList.add('visible');
    }
  }


  /* ----- Initialization ----- */

  async function init() {
    try {
      /* Fetch all four FRED series in parallel */
      var results = await Promise.all(
        SERIES.map(function (s) { return fetchSeries(s.id); })
      );

      var dataSets = {};
      SERIES.forEach(function (s, index) {
        dataSets[s.key] = results[index];
      });

      /* Compute year-over-year inflation from raw CPI values */
      dataSets.inflation = computeYoYInflation(dataSets.inflation);

      /* Update metric cards and render charts */
      SERIES.forEach(function (series) {
        var allPoints  = dataSets[series.key];
        var termPoints = filterByTerm(allPoints);

        updateMetricCard(series.key, termPoints, series.isPercent, series.higherIsBetter);
        renderChart(series.key + 'Chart', allPoints, series.label, series.color, series.yLabel);
      });

      /* Timestamp the last successful refresh */
      var timestampEl = document.getElementById('last-updated');
      if (timestampEl) {
        timestampEl.textContent = moment().format('MMMM Do YYYY, h:mm a');
      }

    } catch (err) {
      console.error('Dashboard initialization failed:', err);
      showError('Unable to load economic data. Please try refreshing the page.');
    }
  }


  /* ----- Boot ----- */
  init();

})();
