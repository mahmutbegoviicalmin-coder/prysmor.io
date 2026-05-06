export const FB_PIXEL_ID = '4285435231716551';

declare global {
  interface Window {
    fbq: (...args: unknown[]) => void;
  }
}

export const pageview = () => {
  window.fbq('track', 'PageView');
};

export const initiateCheckout = (planName: string, value: number, currency = 'USD') => {
  window.fbq('track', 'InitiateCheckout', {
    content_name: planName,
    value,
    currency,
  });
};
