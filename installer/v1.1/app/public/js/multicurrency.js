(function () {
  const SYMBOLS = { USD: '$', ZAR: 'R', ZIG: 'ZiG ' };
  const CODES = ['USD', 'ZAR', 'ZIG'];
  const DEFAULT_FX = {
    baseCurrency: 'USD',
    rates: { USD: 1, ZAR: 20, ZIG: 400 },
    updatedAt: null
  };

  async function getRatesFromServer() {
    if (!window.API) {
      throw new Error('API client not available');
    }

    const data = typeof window.API.getCurrentExchangeRates === 'function'
      ? await window.API.getCurrentExchangeRates()
      : await window.API.getExchangeSettings();

    if (!data?.baseCurrency || !data?.rates) {
      throw new Error('Invalid exchange rates payload');
    }
    return data; // { baseCurrency, rates:{USD,ZAR,ZIG}, updatedAt }
  }

  function convert(amount, from, to, rates) {
    const fromRate = Number(rates[from]);
    const toRate = Number(rates[to]);
    if (!fromRate || !toRate) return 0;
    const baseAmount = Number(amount) / fromRate;
    return baseAmount * toRate;
  }

  function ensureModal() {
    if (document.getElementById('multiCurrencyModal')) return;

    const el = document.createElement('div');
    el.id = 'multiCurrencyModal';
    el.className = 'mc-overlay mc-hidden';
    el.innerHTML = `
      <div class="mc-card">
        <h3>Select Currency</h3>
        <div id="mcRatesInfo" class="mc-rates"></div>
        <div id="mcOptions" class="mc-options"></div>
        <div class="mc-actions"><button id="mcCancelBtn" type="button">Cancel</button></div>
      </div>
    `;
    document.body.appendChild(el);

    document.getElementById('mcCancelBtn')?.addEventListener('click', () => {
      el.classList.add('mc-hidden');
    });
  }

  window.openMultiCurrencyPicker = async function ({ amount, fromCurrency, onSelect, fxData }) {
    ensureModal();

    const modal = document.getElementById('multiCurrencyModal');
    const info = document.getElementById('mcRatesInfo');
    const options = document.getElementById('mcOptions');

    let fx = fxData || DEFAULT_FX;
    if (!fxData) {
      try {
        fx = await getRatesFromServer();
      } catch (error) {
        console.warn('Failed to load exchange rates, using defaults:', error.message);
      }
    }

    const from = fromCurrency || fx.baseCurrency;

    info.textContent = `Base: ${fx.baseCurrency} | Updated: ${fx.updatedAt || '-'}`;

    options.innerHTML = CODES.map((code) => {
      const value = convert(amount, from, code, fx.rates);
      return `
        <button class="mc-option" data-code="${code}" type="button">
          <span>${code}</span>
          <strong>${SYMBOLS[code]}${value.toFixed(2)}</strong>
        </button>
      `;
    }).join('');

    options.querySelectorAll('.mc-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        const usdRate = Number(fx.rates.USD) || 1;
        const selectedRate = Number(fx.rates[code]) || 1;
        const relativeRate = selectedRate / usdRate;
        modal.classList.add('mc-hidden');

        localStorage.setItem('pos.currencyCode', code);
        localStorage.setItem('pos.currencySymbol', SYMBOLS[code]);
        localStorage.setItem('pos.currencyRate', String(relativeRate));

        onSelect?.({ code, symbol: SYMBOLS[code], rate: relativeRate });
      });
    });

    modal.classList.remove('mc-hidden');
  };
})();