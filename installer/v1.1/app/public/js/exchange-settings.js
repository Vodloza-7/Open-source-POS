window.ExchangeSettingsModule = {
  async init(rootEl) {
    if (!rootEl) return;
    this.root = rootEl;
    this.form = this.root.querySelector('#exchangeSettingsForm');
    this.status = this.root.querySelector('#exchangeSettingsStatus');
    await this.load();
    this.form?.addEventListener('submit', (e) => this.save(e));
  },

  setStatus(message, type = 'loading') {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.className = `status-message ${type}`;
  },

  async load() {
    try {
      this.setStatus('Loading settings...', 'loading');
      const data = await API.getExchangeSettings();

      this.root.querySelector('#baseCurrencyCode').value = data.baseCurrency || 'USD';
      this.root.querySelector('#usdToZarRate').value = Number(data?.rates?.ZAR || 20);
      this.root.querySelector('#usdToZigRate').value = Number(data?.rates?.ZIG || 400);
      this.root.querySelector('#defaultTaxRatePercent').value = Number(data.defaultTaxRatePercent || 10);
      this.root.querySelector('#allowTaxExemptProducts').value = String(Boolean(data.allowTaxExemptProducts));

      this.setStatus('Settings loaded.', 'success');
    } catch (err) {
      this.setStatus(`Failed to load settings: ${err.message}`, 'error');
    }
  },

  async save(e) {
    e.preventDefault();
    try {
      const payload = {
        baseCurrency: this.root.querySelector('#baseCurrencyCode').value,
        rates: {
          USD: 1,
          ZAR: Number(this.root.querySelector('#usdToZarRate').value),
          ZIG: Number(this.root.querySelector('#usdToZigRate').value)
        },
        defaultTaxRatePercent: Number(this.root.querySelector('#defaultTaxRatePercent').value),
        allowTaxExemptProducts: this.root.querySelector('#allowTaxExemptProducts').value === 'true'
      };

      this.setStatus('Saving settings...', 'loading');
      await API.saveExchangeSettings(payload);
      this.setStatus('Exchange and tax settings saved.', 'success');
    } catch (err) {
      this.setStatus(`Save failed: ${err.message}`, 'error');
    }
  }
};

