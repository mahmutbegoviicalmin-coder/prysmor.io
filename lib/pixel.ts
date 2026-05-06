export const FB_PIXEL_ID = '4285435231716551';

export const initiateCheckout = (planName: string, value: number, currency = 'USD') => {
  if (typeof window === 'undefined') return;
  if (typeof window.fbq !== 'function') return;
  window.fbq('track', 'InitiateCheckout', {
    content_name: planName,
    value,
    currency,
  });
};
