export const FB_PIXEL_ID = '1468737715025683';

export const initiateCheckout = (planName: string, value: number, currency = 'USD') => {
  if (typeof window === 'undefined') return;
  if (typeof window.fbq !== 'function') return;
  window.fbq('track', 'InitiateCheckout', {
    content_name: planName,
    value,
    currency,
  });
};
