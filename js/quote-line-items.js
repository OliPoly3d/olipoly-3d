(() => {
  const $ = id => document.getElementById(id);
  const note = 'Shipping is not included and will be added to the final invoice if shipment is required.';
  window.olipolyQuoteShippingNote = () => $('quoteShippingChargeMode')?.value === 'deferred' ? note : '';
  window.olipolyReadQuoteItems = () => window.OliPolyLineItems.commercial(window.quoteItemsEditor ? window.quoteItemsEditor.get() : JSON.parse($('quoteLineItems')?.value || '[]'));
  function bind() {
    const hidden = $('quoteLineItems');
    if (!hidden) return;
    function changed() {
      try {
        hidden.value = JSON.stringify(window.quoteItemsEditor.get());
        $('quoteItemsMessage').textContent = '';
        window.olipolySyncQuoteTotals?.();
      } catch (error) { $('quoteItemsMessage').textContent = error.message; }
    }
    window.quoteItemsEditor = window.OliPolyLineItems.mount($('quoteItems'), {onChange:changed});
    function restore() {
      window.quoteItemsEditor.set(JSON.parse(hidden.value || '[]'));
      const enabled = window.quoteItemsEditor.hasItems();
      $('quoteItems').classList.toggle('hidden', !enabled);
      $('quoteItemizeBtn').classList.toggle('hidden', enabled);
    }
    hidden.addEventListener('input', restore);
    hidden.addEventListener('change', restore);
    $('quoteItemizeBtn').addEventListener('click', () => {
      window.quoteItemsEditor.set([{id:crypto.randomUUID(),description:$('quoteTitle')?.value || 'First item',quantity:Number($('qty')?.value) || 1,unit_price:window.olipolyQuoteTotals?.piecePrice || 0}]);
      changed(); restore();
    });
    ['quoteShippingChargeMode','customerShippingCharge'].forEach(id => $(id).addEventListener('change', () => {
      $('customerShippingCharge').disabled = $('quoteShippingChargeMode').value === 'deferred';
      $('quoteShippingNotice').textContent = window.olipolyQuoteShippingNote();
      window.olipolySyncQuoteTotals?.();
    }));
    restore();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
